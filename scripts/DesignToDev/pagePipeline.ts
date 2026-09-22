/**
 * pagePipeline.ts — Script 3 of 5 : Figma page frames → full page components
 * ---------------------------------------------------------------------------
 * Same three phases as componentPipeline, for page-level designs:
 *
 *   version   find the page nodes, hash them, set codeStatus
 *   create    CREATE prompt → Claude + Figma MCP, for "readyToCreate"
 *   update    UPDATE prompt → Claude + Figma MCP, for "readyToUpdate"
 *
 * Pages live on their own Figma canvas (default "Frames") and are usually NOT
 * published to the team library, so the published-components endpoint cannot see
 * them at all. Discovery therefore reads the file tree, which sees every node
 * regardless of publish state. The same content hash as componentPipeline
 * decides when a built page has drifted, so a page is never rebuilt — and never
 * re-billed — because Figma re-minted a node id.
 *
 * Output — src/pages/<PageName>/:
 *   <PageName>.tsx  .module.scss  .stories.tsx  .test.tsx  .md  .mdx
 *
 * DOCUMENTATION — Storybook is set up (docs addon, Figma breakpoint viewports,
 * sidebar order, landing page) BEFORE anything is built, so the first generated
 * .mdx has somewhere to render. The .mdx is then written by the SAME Claude turn
 * that builds the page: that turn already holds the sections it just composed and
 * the story exports it just wrote, so the docs page costs nothing extra and
 * cannot describe something that isn't there. The whole site is compiled once at
 * the end to catch a bad story reference, which breaks the entire build rather
 * than just its own page.
 *
 * RESPONSIVE POLICY (design-driven, with one honest fallback):
 *   variants  the node is a COMPONENT_SET with screen variants → one media query
 *             per variant that really exists
 *   siblings  a separate node is the same page at another width ("Home Page
 *             Mobile") → use that design
 *   single    neither → Claude makes it responsive itself and must list every
 *             decision under "Assumptions" in the .md
 *
 * Usage:
 *   npm run pagePipeline              version → create → update → drift
 *   npm run pagePipeline:version      version only
 *   npm run pagePipeline:create       create only
 *   npm run pagePipeline:update       update only
 *   npm run pagePipeline:dry          all phases, nothing written or spent
 *
 * GIT FLOW (see lib/git.ts) — once every page is built, each one that produced
 * file changes gets its own branch, commit, push and PR. The run is atomic: if
 * ANY page's worst visual drift reaches the gate (default 20%) nothing is
 * branched or pushed at all, and the reason is logged.
 *
 * Extra flags: --only=HomePage · --force · --force-scan · --no-drift · --no-pr
 *              --canvas=Screens
 *   --logTokenUsage  also write the token table to scriptData/token-usage.json
 *                    (it is always printed either way)
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  CLAUDE_MODEL_PAGE,
  CLAUDE_PAGE_TIMEOUT_MS,
  COMPONENTS_VERSION_FILE,
  DRIFT_REPORT_HTML,
  FIGMA_FILE_KEY,
  PAGES_CANVAS,
  PAGES_SRC_DIR,
  PAGES_VERSION_FILE,
  PIPELINE_REL,
  PROMPTS_DIR,
  ROOT_DIR,
  requireFigmaEnv,
} from "./lib/env.js";
import {
  consumePrompt,
  ensureDir,
  fileMTime,
  listFiles,
  log,
  normId,
  nowISO,
  pascalId,
  readJSON,
  rel,
  removeDirIfEmpty,
  writeJSON,
} from "./lib/io.js";
import {
  collectInstances,
  fetchFileOutline,
  fetchFileStamp,
  fetchNode,
  nodeH,
  nodeLink,
  nodeW,
  parseVariantProps,
  type FigmaNode,
  type NodeLookups,
} from "./lib/figma.js";
import { hashNode } from "./lib/hash.js";
import { runClaude } from "./lib/claude.js";
import { MDX_RULES, ensureStorybookSetup, verifyStorybookBuild } from "./lib/storybook.js";
import { readPayload } from "./lib/driftReport.js";
import { reportUsage, type UsageRow } from "./lib/usage.js";
import {
  abandonUnit,
  beginUnit,
  inspectRepo,
  loadGitConfig,
  logShipResult,
  shipUnit,
  type GitConfig,
  type RepoState,
  type UnitInfo,
} from "./lib/git.js";
import {
  BREAKPOINTS,
  SCREEN_PROP_RE,
  baseKey,
  breakpointForWidth,
  deviceFromName,
} from "./lib/screens.js";
import type {
  CodeStatus,
  PageDependency,
  PageEntry,
  PagesVersionFile,
  ScreenVariant,
} from "./lib/types.js";

requireFigmaEnv();

// ─── Flags ─────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const opt = (n: string) => argv.find((a) => a.startsWith(`${n}=`))?.slice(n.length + 1);

const WANT_VERSION = flag("--version");
const WANT_CREATE = flag("--create");
const WANT_UPDATE = flag("--update");
const ALL_PHASES = !WANT_VERSION && !WANT_CREATE && !WANT_UPDATE;

const DO_VERSION = ALL_PHASES || WANT_VERSION;
const DO_CREATE = ALL_PHASES || WANT_CREATE;
const DO_UPDATE = ALL_PHASES || WANT_UPDATE;

const DRY_RUN = flag("--dry") || flag("--dry-run");
const FORCE = flag("--force");
const FORCE_SCAN = flag("--force-scan");
const NO_DRIFT = flag("--no-drift");
const NO_DOCS = flag("--no-docs");
/** Skip branch/commit/push/PR — build only, leave everything in the tree. */
const NO_PR = flag("--no-pr");
/** Opt-in: without it the usage table is printed but no file is written. */
const LOG_TOKEN_USAGE = flag("--logTokenUsage");
const ONLY_ARG = opt("--only");
const CANVAS = (opt("--canvas") || PAGES_CANVAS).trim();

const GIT_CFG: GitConfig = loadGitConfig(
  readJSON<{ git?: Partial<GitConfig> }>(path.join(ROOT_DIR, "package.json"))?.git
);

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1 — VERSION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Direct children that are NOT instances — their own markup must be authored.
 * A bespoke section can still CONTAIN instances (a hand-built grid holding four
 * Product Cards), so each is annotated with what it reuses; otherwise the prompt
 * reads as "build all of this yourself" and built components get re-invented.
 */
function bespokeSections(root: FigmaNode, lookups: NodeLookups): string[] {
  return (root.children ?? [])
    .filter((c) => c.type !== "INSTANCE")
    .map((c) => {
      const inner = collectInstances(c, lookups);
      const reuse = [...inner.entries()].map(([n, k]) => `${n}×${k}`).join(", ");
      return (
        `${c.name} (${c.type}, ${nodeW(c)}×${nodeH(c)})` +
        (reuse
          ? ` — layout is bespoke, but it CONTAINS ${reuse}: import those, do not rebuild them`
          : "")
      );
    });
}

function resolveDependencies(
  instances: Map<string, number>,
  pageIdentifier: string
): PageDependency[] {
  const built =
    readJSON<{ components?: Array<{ name: string; targetDir: string | null }> }>(
      COMPONENTS_VERSION_FILE
    )?.components ?? [];
  // Relative imports on purpose: the "@ -> src/" alias is documented in this repo
  // but is NOT configured in vite/tsconfig, so "@/..." would not resolve.
  const from = `src/pages/${pageIdentifier}`;
  return [...instances.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, uses]) => {
      const match = built.find((b) => normId(b.name) === normId(name));
      const identifier = pascalId(name, "Component");
      const importPath = match?.targetDir
        ? `${path.posix.relative(from, match.targetDir.replace(/\\/g, "/"))}/${identifier}`
        : null;
      return { name, identifier, importPath, uses };
    });
}

function findPageDir(identifier: string): string | null {
  const dir = path.join(PAGES_SRC_DIR, identifier);
  try {
    if (fs.readdirSync(dir).some((f) => f === `${identifier}.tsx`)) return dir;
  } catch {
    /* not there */
  }
  return null;
}

async function discoverPages(): Promise<PageEntry[]> {
  log("🌐", `reading Figma file tree (canvas "${CANVAS}")…`);

  const tree = await fetchFileOutline();
  const canvas = tree.document.children.find(
    (p) => p.type === "CANVAS" && normId(p.name) === normId(CANVAS)
  );
  if (!canvas) {
    const names = tree.document.children.map((p) => `"${p.name}"`).join(", ");
    throw new Error(
      `No Figma canvas named "${CANVAS}". Available pages: ${names}.\n` +
        "    Pass --canvas=<name> or set FIGMA_PAGES_CANVAS."
    );
  }

  const roots = (canvas.children ?? []).filter(
    (n) => n.type === "COMPONENT" || n.type === "COMPONENT_SET"
  );
  if (roots.length === 0) {
    log("⚠️ ", `canvas "${canvas.name}" has no COMPONENT / COMPONENT_SET nodes.`);
    return [];
  }

  // A page's alternate screen designs may be separate nodes ("Home Page Mobile")
  // sitting on any canvas — index the whole document by base name.
  const primaryKeys = new Set(roots.map((r) => baseKey(r.name)));
  const primaryIds = new Set(roots.map((r) => r.id));
  const siblingsByKey = new Map<string, FigmaNode[]>();
  for (const cv of tree.document.children) {
    if (cv.type !== "CANVAS") continue;
    for (const n of cv.children ?? []) {
      if (n.type !== "COMPONENT" && n.type !== "COMPONENT_SET") continue;
      if (primaryIds.has(n.id)) continue;
      const key = baseKey(n.name);
      if (!primaryKeys.has(key)) continue;
      const list = siblingsByKey.get(key) ?? [];
      list.push(n);
      siblingsByKey.set(key, list);
    }
  }

  const siblingCount = [...siblingsByKey.values()].reduce((a, l) => a + l.length, 0);
  log(
    "🧩",
    `${roots.length} page node(s) on "${canvas.name}"` +
      (siblingCount ? ` · ${siblingCount} alternate screen design(s) matched by name` : "")
  );

  const pages: PageEntry[] = [];

  for (const root of roots) {
    // Full-depth fetch: needed for the hash, the instances and the section names.
    const fetched = await fetchNode(root.id);
    if (!fetched) {
      log("⚠️ ", `could not fetch node ${root.id} ("${root.name}") — skipped`);
      continue;
    }
    const doc = fetched.document;
    const lookups: NodeLookups = {
      components: fetched.components,
      componentSets: fetched.componentSets,
    };
    const isSet = doc.type === "COMPONENT_SET";

    // Screen designs: only what Figma really contains, never invented.
    let screens: ScreenVariant[] = [];
    if (isSet) {
      screens = (doc.children ?? []).map((v) => {
        const props = parseVariantProps(v.name);
        const w = nodeW(v);
        // Figma's own screen label wins; width is only the fallback.
        const labelled = Object.entries(props).find(([k]) => SCREEN_PROP_RE.test(k))?.[1];
        const named = labelled
          ? BREAKPOINTS.find((b) => normId(b.name) === normId(labelled))
          : undefined;
        const bp = named ?? breakpointForWidth(w);
        return {
          name: v.name,
          nodeId: v.id,
          figmaUrl: nodeLink(v.id),
          width: w,
          height: nodeH(v),
          breakpoint: bp.name,
          media: bp.media,
          props,
        };
      });
      screens.sort((a, b) => a.width - b.width);
    } else {
      const asScreen = (n: FigmaNode): ScreenVariant => {
        const w = nodeW(n);
        const bp = deviceFromName(n.name) ?? breakpointForWidth(w);
        return {
          name: n.name,
          nodeId: n.id,
          figmaUrl: nodeLink(n.id),
          width: w,
          height: nodeH(n),
          breakpoint: bp.name,
          media: bp.media,
          props: {},
        };
      };
      const sibs = siblingsByKey.get(baseKey(doc.name)) ?? [];
      screens = [asScreen(doc), ...sibs.map(asScreen)]
        .filter((s, i, all) => all.findIndex((o) => o.breakpoint === s.breakpoint) === i)
        .sort((a, b) => a.width - b.width);
    }

    const screenSource: PageEntry["screenSource"] =
      isSet && screens.length > 1 ? "variants" : screens.length > 1 ? "siblings" : "single";

    // Dependencies + bespoke sections come from the widest variant.
    const widest = isSet
      ? (doc.children ?? []).reduce((a, b) => (nodeW(a) >= nodeW(b) ? a : b), doc)
      : doc;
    const instances = collectInstances(widest, lookups);
    const identifier = pascalId(doc.name, "Page");

    pages.push({
      name: doc.name,
      identifier,
      nodeId: doc.id,
      canvas: canvas.name,
      figmaUrl: nodeLink(doc.id),
      figmaHash: hashNode(doc),
      width: nodeW(widest),
      height: nodeH(widest),
      isVariantSet: isSet,
      screenSource,
      screens,
      dependsOn: resolveDependencies(instances, identifier),
      bespokeSections: bespokeSections(widest, lookups),
      description: "",
      fetchedAt: nowISO(),
      codeStatus: "readyToCreate",
      builtAgainstHash: null,
      builtAt: null,
      builtWithModel: null,
      targetDir: null,
    });
  }

  return pages.sort((a, b) => a.name.localeCompare(b.name));
}

function computeCodeStatus(builtAgainstHash: string | null, hash: string): CodeStatus {
  if (builtAgainstHash == null) return "readyToCreate";
  return builtAgainstHash === hash ? "created" : "readyToUpdate";
}

/**
 * Merge freshly-discovered pages with what previous runs already built.
 *
 * Build state must survive a Figma node-id change: re-creating a component in
 * Figma mints a brand-new id, which would otherwise make an already-built page
 * look new and get rebuilt. Identity therefore falls back to the page
 * identifier, and — as a final backstop — to the files actually being on disk.
 */
function mergeWithPrevious(
  fresh: PageEntry[],
  stamp: { version: string; lastModified: string }
): PagesVersionFile {
  const prev = readJSON<PagesVersionFile>(PAGES_VERSION_FILE);
  const prevPages = prev?.pages ?? [];
  const byNode = new Map(prevPages.map((p) => [p.nodeId, p]));
  const byIdent = new Map(prevPages.map((p) => [normId(p.identifier), p]));

  const pages = fresh.map((p) => {
    const old = byNode.get(p.nodeId) ?? byIdent.get(normId(p.identifier));
    const dir = findPageDir(p.identifier);

    let builtAgainstHash = old?.builtAgainstHash ?? null;
    let builtAt = old?.builtAt ?? null;
    let targetDir = old?.targetDir ?? (dir ? rel(dir) : null);

    if (old && old.nodeId !== p.nodeId) {
      log("🔗", `"${p.name}" node id changed ${old.nodeId} → ${p.nodeId}`);
    }

    // Migration: records written before pages were hashed. They were built
    // against *something*; adopt the current hash rather than re-billing a page.
    if (builtAgainstHash == null && builtAt != null) {
      builtAgainstHash = p.figmaHash;
    }

    // Files exist but no record at all → adopt them instead of rebuilding.
    if (builtAgainstHash == null && builtAt == null && dir) {
      log("📎", `"${p.name}" already exists at ${rel(dir)} — adopted, not rebuilt`);
      builtAgainstHash = p.figmaHash;
      builtAt = fileMTime(path.join(dir, `${p.identifier}.tsx`));
      targetDir = rel(dir);
    }

    return {
      ...p,
      codeStatus: computeCodeStatus(builtAgainstHash, p.figmaHash),
      builtAgainstHash,
      builtAt,
      builtWithModel: old?.builtWithModel ?? null,
      targetDir,
    } satisfies PageEntry;
  });

  for (const old of prevPages) {
    const stillThere = pages.some(
      (p) => p.nodeId === old.nodeId || normId(p.identifier) === normId(old.identifier)
    );
    if (!stillThere) {
      log("🗑 ", `"${old.name}" no longer on the "${CANVAS}" canvas — removed`);
    }
  }

  return {
    figmaFileKey: FIGMA_FILE_KEY,
    canvas: CANVAS,
    figmaVersion: stamp.version,
    lastModified: stamp.lastModified,
    updatedAt: nowISO(),
    pages,
  };
}

function summarise(pages: PageEntry[]): void {
  for (const p of pages) {
    const screens =
      p.screenSource === "variants"
        ? `${p.screens.length} designed breakpoints (variants)`
        : p.screenSource === "siblings"
        ? `${p.screens.length} designed breakpoints (separate nodes)`
        : `single ${p.width}px design — responsive is generated`;
    console.log(
      `   - ${p.name.padEnd(18)} [${p.codeStatus}]  ${screens} · ` +
        `${p.dependsOn.length} dependency(ies)`
    );
  }
}

async function runVersionPhase(): Promise<PagesVersionFile | null> {
  console.log("\n── Phase: version ──────────────────────────────────────────");

  const prevFile = readJSON<PagesVersionFile>(PAGES_VERSION_FILE);
  const stamp = await fetchFileStamp();

  if (
    !FORCE_SCAN &&
    prevFile?.figmaVersion === stamp.version &&
    prevFile?.canvas === CANVAS &&
    (prevFile?.pages?.length ?? 0) > 0
  ) {
    log("✓ ", `Figma unchanged (version ${stamp.version}) — skipped the full scan`);
    summarise(prevFile!.pages);
    return prevFile;
  }

  const fresh = await discoverPages();
  const file = mergeWithPrevious(fresh, stamp);

  if (DRY_RUN) {
    log("🧪", `would write ${rel(PAGES_VERSION_FILE)} — not written (dry run)`);
  } else {
    writeJSON(PAGES_VERSION_FILE, file);
    log("💾", `${rel(PAGES_VERSION_FILE)} — updatedAt ${file.updatedAt}`);
  }
  summarise(file.pages);
  return file;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPTS
// ═══════════════════════════════════════════════════════════════════════════

const PROJECT_CONTEXT = `Existing React + Vite + TypeScript project, setup complete — do not scaffold tooling.
Stack: React + Storybook (CSF3) + Vitest/RTL + SCSS Modules.
Design tokens are global CSS custom properties in src/designToken.css
(e.g. --colors-primary-700, --spacing-4, --radius-md). Read that file; use var(--token)
for every colour, spacing, radius, font-size, line-height and shadow that has one.
IMPORTS: the "@ -> src/" alias is NOT configured in this repo. Use the exact relative
import paths given below; do not rewrite them to "@/...".`;

const screenLines = (p: PageEntry): string =>
  p.screens
    .map(
      (s) =>
        `  - ${s.breakpoint} @ ${s.width}×${s.height}px  ` +
        `${Object.keys(s.props).length ? `[${s.name}] ` : ""}->  ${s.figmaUrl}`
    )
    .join("\n");

/**
 * Re-resolve import paths against components.version.json as it is RIGHT NOW.
 *
 * `dependsOn.importPath` is frozen when the page is scanned, but components keep
 * being built after that — including earlier in this very run. Trusting the
 * stored value told the prompt that an already-built component was "NOT BUILT
 * YET", and the page dutifully stubbed out a placeholder for code that exists.
 */
function refreshDependencies(p: PageEntry): PageDependency[] {
  if (!p.dependsOn.length) return p.dependsOn;
  const built =
    readJSON<{ components?: Array<{ name: string; targetDir: string | null }> }>(
      COMPONENTS_VERSION_FILE
    )?.components ?? [];
  const from = `src/pages/${p.identifier}`;
  return p.dependsOn.map((d) => {
    const match = built.find((b) => normId(b.name) === normId(d.name));
    if (!match?.targetDir) return d;
    const importPath = `${path.posix.relative(
      from,
      match.targetDir.replace(/\\/g, "/")
    )}/${d.identifier}`;
    return importPath === d.importPath ? d : { ...d, importPath };
  });
}

function dependencyLines(p: PageEntry): string {
  if (!p.dependsOn.length) return "  none — every section is authored from scratch";
  return refreshDependencies(p)
    .map((d) =>
      d.importPath
        ? `  - ${d.name} (${d.uses}×) — ALREADY BUILT. Import and reuse from ${d.importPath}. ` +
          "Do NOT re-create it, do NOT copy its markup, do NOT restyle its internals."
        : `  - ${d.name} (${d.uses}×) — NOT BUILT YET. Build the page around it and leave a ` +
          "clearly marked placeholder; do not silently invent it."
    )
    .join("\n");
}

const bespokeLines = (p: PageEntry): string =>
  p.bespokeSections.length ? p.bespokeSections.map((s) => `  - ${s}`).join("\n") : "  (none)";

function responsiveBlock(p: PageEntry): string {
  const queries = p.screens
    .map((s) => `  - ${s.breakpoint} (${s.width}px design)  ->  @media ${s.media}\n      ${s.figmaUrl}`)
    .join("\n");

  if (p.screenSource === "variants") {
    return `RESPONSIVE — ${p.screens.length} designed breakpoints (Figma variants)
Figma defines a separate variant for each screen size below. Call the Figma MCP on
EVERY variant node and build one media query per variant, using that variant's real
values — never guess what a designed size looks like:
${queries}

- Between two designed sizes, interpolate sensibly (wrap, flex-basis, clamp).
- Do NOT invent a breakpoint Figma already answers.
- The widest design (${p.width}px) is the base; narrower ones override it.`;
  }

  if (p.screenSource === "siblings") {
    return `RESPONSIVE — ${p.screens.length} designed breakpoints (separate Figma nodes)
These are SEPARATE Figma nodes that are alternate screen designs of this same page.
Call the Figma MCP on EACH one and build a media query per design, using its real
values — never guess what a designed size looks like:
${queries}

- Treat them as one component with breakpoints, NOT as separate components.
- Between two designed sizes, interpolate sensibly (wrap, flex-basis, clamp).
- Do NOT invent a breakpoint that is already designed above.
- The widest design (${p.width}px) is the base; narrower ones override it.`;
  }

  return `RESPONSIVE — only ONE design exists (${p.width}px), so YOU make it responsive
Figma defines this page at ${p.width}px only, and no separate mobile or tablet design
exists anywhere in the file. Build the ${p.width}px design faithfully, then make it
genuinely responsive yourself down to 375px.

Target breakpoints:
  - mobile   @media (max-width: 767px)
  - tablet   @media (min-width: 768px) and (max-width: 1023px)
  - laptop   @media (min-width: 1024px) and (max-width: 1439px)
  - desktop  @media (min-width: 1440px)   <- the design above, the base
  - large    @media (min-width: 1920px)   <- cap content width and centre it

You MAY restructure where a desktop layout genuinely cannot work small:
  * collapse a horizontal nav into a burger / drawer
  * re-stack multi-column sections into a single column
  * reflow card grids (4-up -> 3-up -> 2-up -> 1-up)
  * scale or crop oversized hero art, clamp large display type
  * hide purely decorative elements that add no information
Use conventional, accessible patterns — a burger toggle must be a real <button> with
aria-expanded and aria-controls, and keyboard operable.

NEVER remove content or functionality to make it fit, and never let a narrow viewport
produce horizontal scroll, overlapping text or a cut-off section.

Because these decisions are yours and not Figma's, list EVERY one of them in
${p.identifier}.md under an "Assumptions" heading — what you changed, at which
breakpoint, and why.`;
}

const pageShellRules = (p: PageEntry): string => {
  const cls = p.identifier.charAt(0).toLowerCase() + p.identifier.slice(1);
  return `PAGE SHELL — this is a PAGE, not a component
- The root element is a page shell, not a fixed-width frame. Never hardcode the design
  width on it.
    .${cls} {
      width: 100%;          /* viewport minus scrollbar — never 100vw, which
                               includes the scrollbar and causes horizontal scroll */
      min-height: 100vh;    /* the page covers the screen, no more, no less */
      overflow-x: hidden;   /* kill any residual sideways scroll */
      margin: 0;
    }
- Do NOT set overflow-y:hidden — the page is ${p.height}px tall and must scroll vertically.
- Full-bleed sections (nav, hero/poster, footer, banded backgrounds) span width:100%
  edge to edge; their INNER content is capped with max-width and centred, so the band
  reaches the screen edges on a wide monitor while the content stays aligned.
    .section { width:100%; }
    .section__inner { max-width: <design content width>px; margin-inline:auto;
                      padding-inline: clamp(1rem, 4vw, 3rem); }
- Nothing may exceed the viewport width at ANY size. No fixed px widths on containers,
  no width:100vw, no negative margins that push past the edge.
- Read the Figma design carefully and assign the right property to the right element:
  which sections are full-bleed vs contained, which gaps are fixed vs fluid, which
  items wrap and which must stay on one line.
- This page is rendered at ${p.width}px and compared against the Figma frame afterwards,
  so at ${p.width}px it must land on the design — the responsive rules are what happens
  either side of that, not an excuse to drift at the designed width.`;
};

const RULES = (id: string) => `RULES
TSX     One default-exported page component \`${id}\`. Export \`${id}Props\` if it takes any
        props (most pages take none — that is fine, still export the type).
        Compose it from the already-built components listed above; author only the
        bespoke sections yourself. No inline style={{}}.
        Semantic landmarks: <header>/<nav>, <main>, <footer>, correct heading order.
SCSS    All styling in ${id}.module.scss. BEM-like class names mirroring the section
        structure. Token values from src/designToken.css wherever one exists.
STORIES CSF3; default export = meta with parameters: { layout: "fullscreen" };
        one named export per designed breakpoint, each setting the matching
        parameters.viewport so the story renders at that width.
TESTS   RTL. Assert the page renders, each major section is present, and the reused
        components appear (query by their role / accessible name).
MD      H1 = page name; what the page is; section list; which components it reuses and
        which sections are bespoke; the responsive behaviour actually implemented;
        an "Assumptions" section for anything Figma did not specify.`;

/** The .mdx contract, or nothing at all when the run is --no-docs. */
const docsRules = (id: string): string => (NO_DOCS ? "" : `\n${MDX_RULES(id, true)}\n`);

/** Files a build is asked to produce — the .mdx is one of them unless --no-docs. */
const fileList = (id: string): string =>
  [
    `${id}.tsx`,
    `${id}.module.scss`,
    `${id}.stories.tsx`,
    `${id}.test.tsx`,
    `${id}.md`,
    ...(NO_DOCS ? [] : [`${id}.mdx`]),
  ].join("  ");

const FIGMA_BLOCK = (p: PageEntry, id: string) => `Use the Figma MCP (server "figma") on the page node AND on every screen node below:
- get_design_context / get_variable_defs -> use the returned sizes, spacing, colours,
  typography, radius, borders, effects and layout verbatim. Never guess a value the
  MCP can give you.
- get_screenshot on each node -> keep as the visual target to check your build against.
- ASSETS: pull every real image and icon from the MCP (download_assets, or the
  image-fill / exported-node refs in get_design_context) into src/assets/${id}/ and
  import it. Use a placeholder ONLY when the MCP returns no asset for that node.

Page node : ${p.figmaUrl}
Screen nodes :
${screenLines(p)}

Reuse these already-built components (they are the same instances Figma uses):
${dependencyLines(p)}

Sections you must author yourself (not instances of anything):
${bespokeLines(p)}`;

const EFFICIENCY = `EFFICIENCY
- Do the smallest fully-correct thing. Reuse the MCP output you already fetched instead
  of re-calling it; don't re-run tsc / vitest more than needed.
- Quality first: never trade design accuracy, correct reuse, accessibility or passing
  tests for brevity.`;

function buildCreatePrompt(p: PageEntry): string {
  const id = p.identifier;
  return `${PROJECT_CONTEXT}

============================================================
TASK — CREATE PAGE: ${p.name}  (identifier: ${id})
============================================================
Output dir: src/pages/${id}/
Create exactly these files (downloaded images/icons go in src/assets/${id}/):
  ${fileList(id)}

============================================================
FIGMA — SOURCE OF TRUTH
============================================================
${FIGMA_BLOCK(p, id)}

============================================================
${responsiveBlock(p)}

============================================================
${pageShellRules(p)}

============================================================
${EFFICIENCY}

${RULES(id)}
${docsRules(id)}
============================================================
Run:  npx tsc --noEmit   and   npx vitest run ${id}
Fix every TypeScript and test error before finishing.`;
}

function buildUpdatePrompt(p: PageEntry, dir: string, files: string[]): string {
  const id = p.identifier;
  return `${PROJECT_CONTEXT}

============================================================
TASK — UPDATE PAGE: ${p.name}  (identifier: ${id})
============================================================
Make the page match the current Figma design. Edit these files in place — do NOT rename
them (downloaded images/icons go in src/assets/${id}/):
${files.map((f) => `  - ${f}`).join("\n")}
Page directory: ${rel(dir)}/
${
  NO_DOCS || files.some((f) => f.toLowerCase().endsWith(`${id.toLowerCase()}.mdx`))
    ? "Create no other files."
    : `The docs page ${id}.mdx does not exist yet — CREATE it as described below. ` +
      "Create no other files."
}

WHY THIS RUN EXISTS
The Figma design changed after this page was last built — its content hash no longer
matches what the code was generated from. Re-read EVERY node listed below through the
MCP and treat the current design as truth: section order, sizes, copy, assets and node
ids may all have moved since. Do not assume the existing code still mirrors the design;
verify each section against the MCP response.

============================================================
FIGMA — SOURCE OF TRUTH
============================================================
${FIGMA_BLOCK(p, id)}

============================================================
${responsiveBlock(p)}

============================================================
${pageShellRules(p)}

============================================================
CHANGES
- Match Figma exactly: section order, spacing, sizing, colours, typography, radius,
  borders, shadows and copy. Replace leftover placeholders with the real MCP assets.
- A component listed as ALREADY BUILT must be imported, not re-implemented — if the page
  now renders it differently, that is a change to the page, not to the component.
- Keep the file set and the exported names stable.

${EFFICIENCY}

${RULES(id)}
${docsRules(id)}
============================================================
Run:  npx tsc --noEmit   and   npx vitest run ${id}
Fix every TypeScript and test error before finishing.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// DRIFT DETECTION (per page, straight after its build)
// ═══════════════════════════════════════════════════════════════════════════

interface DriftRow {
  kind?: string;
  target: string;
  status: "pass" | "fail" | "no-story" | "errored";
  mismatchRatio: number;
}

async function runDrift(identifier: string): Promise<{
  ran: boolean;
  passed: number;
  failed: number;
  worst: number;
  note?: string;
}> {
  const code = await new Promise<number>((resolve) => {
    const proc = spawn(
      "npx",
      [
        "tsx",
        `${PIPELINE_REL}/driftDetection.ts`,
        "--pages",
        `--only=${identifier}`,
        "--merge",
      ],
      {
        cwd: ROOT_DIR,
        stdio: ["ignore", "inherit", "inherit"],
        shell: process.platform === "win32",
      }
    );
    proc.on("error", () => resolve(127));
    proc.on("close", (c) => resolve(c ?? 1));
  });

  // Rows come back out of report.html's embedded payload — there is no report.json.
  const rows = readPayload<{ results?: DriftRow[] }>(DRIFT_REPORT_HTML)?.results ?? [];
  const mine = rows.filter((r) => r.kind === "page" && normId(r.target ?? "") === normId(identifier));
  if (mine.length === 0) {
    return {
      ran: false,
      passed: 0,
      failed: 0,
      worst: 0,
      note: code === 127 ? "could not spawn npx tsx" : `driftDetection produced no rows (exit ${code})`,
    };
  }
  return {
    ran: true,
    passed: mine.filter((r) => r.status === "pass").length,
    failed: mine.filter((r) => r.status !== "pass").length,
    worst: mine.reduce((m, r) => Math.max(m, r.mismatchRatio ?? 0), 0),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2/3 — BUILD
// ═══════════════════════════════════════════════════════════════════════════

interface BuildOutcome {
  built: number;
  failed: number;
  skipped: number;
  docsFailed: number;
  usage: UsageRow[];
  /** Pages shipped to their own branch + PR. */
  shipped: string[];
  /** Pages whose worst drift reached the gate — abandoned, not shipped. */
  blocked: Array<{ label: string; worst: number }>;
}

function prUnitFor(p: PageEntry, mode: "create" | "update", worst: number): UnitInfo {
  const screens = p.screens
    .map((s) => `- ${s.breakpoint} — ${s.width}×${s.height}px`)
    .join("\n");
  const reuses = p.dependsOn.map((d) => `- ${d.name} ×${d.uses}`).join("\n");
  return {
    title: `${mode === "create" ? "feat" : "fix"}(${p.name}): ${
      mode === "create" ? "create" : "sync"
    } with Figma design`,
    body: [
      `Generated by the DesignToDev pipeline (${mode}) from Figma.`,
      "",
      `**Figma node:** ${p.figmaUrl}`,
      `**Content hash:** \`${p.figmaHash}\``,
      `**Model:** ${CLAUDE_MODEL_PAGE}`,
      "",
      "**Designed screens**",
      screens || "- (single frame)",
      "",
      "**Reuses**",
      reuses || "- nothing — every section is authored",
      "",
      "**Visual regression**",
      NO_DRIFT
        ? "- skipped (`--no-drift`)"
        : `- worst mismatch **${(worst * 100).toFixed(2)}%** (gate: ${GIT_CFG.maxDriftPercent}%)`,
      "",
      "Generated with [Claude Code](https://claude.com/claude-code)",
    ].join("\n"),
  };
}

async function runBuildPhase(
  file: PagesVersionFile,
  mode: "create" | "update",
  gitState: RepoState | null
): Promise<BuildOutcome> {
  console.log(`\n── Phase: ${mode} ────────────────────────────────────────────`);
  const out: BuildOutcome = {
    built: 0,
    failed: 0,
    skipped: 0,
    docsFailed: 0,
    usage: [],
    shipped: [],
    blocked: [],
  };

  const targets = file.pages.filter((p) => {
    if (
      ONLY_ARG &&
      normId(p.identifier) !== normId(ONLY_ARG) &&
      normId(p.name) !== normId(ONLY_ARG)
    )
      return false;
    if (mode === "create") return p.codeStatus === "readyToCreate";
    return p.codeStatus === "readyToUpdate" || (FORCE && p.codeStatus === "created");
  });

  if (targets.length === 0) {
    log(
      "✓ ",
      mode === "create"
        ? "Nothing to create — every Figma page already has code."
        : "Nothing to update — no page has drifted in Figma since it was built."
    );
    return out;
  }

  log("🚀", `${targets.length} page(s) queued${DRY_RUN ? " — DRY RUN (prompts only)" : ""}`);
  ensureDir(PROMPTS_DIR);

  for (let i = 0; i < targets.length; i++) {
    const p = targets[i];

    console.log("─".repeat(64));
    log(`[${i + 1}/${targets.length}]`, `${p.name} — ${mode}`);

    // Branch off base before generating, so this page's work lands directly
    // on its own branch. No branch in dry-run / --no-pr modes.
    let branch: string | null = null;
    if (!NO_PR && !DRY_RUN && gitState) {
      const begun = beginUnit(GIT_CFG, gitState, "page", p.identifier);
      if (!begun.ok) {
        log("❌", `Page ${p.name} — ${begun.reason}`);
        out.failed++;
        continue;
      }
      branch = begun.branch;
    }

    log(
      "📥",
      `Page ${p.name} fetched!  (node ${p.nodeId} · ${p.width}×${p.height} · ` +
        `${p.screens.length} design(s))`
    );

    // Components built since this page was scanned — including ones built
    // earlier in this same run — only become importable here.
    p.dependsOn = refreshDependencies(p);
    const missing = p.dependsOn.filter((d) => !d.importPath);
    if (missing.length) {
      log(
        "⚠️ ",
        `unbuilt dependencies: ${missing.map((m) => m.name).join(", ")} — ` +
          "run `npm run componentPipeline` first for a faithful page"
      );
    }
    if (p.dependsOn.length) {
      log("🧩", `reuses ${p.dependsOn.map((d) => `${d.name}×${d.uses}`).join(", ")}`);
    }

    let dir: string | null = null;
    let files: string[] = [];
    if (mode === "update") {
      const fromTarget =
        p.targetDir && fs.existsSync(path.join(ROOT_DIR, p.targetDir))
          ? path.join(ROOT_DIR, p.targetDir)
          : null;
      dir = fromTarget ?? findPageDir(p.identifier);
      const existing = dir ? listFiles(dir) : [];
      if (!dir || existing.length === 0) {
        console.error(
          `   ⚠️  no existing page files for "${p.name}" — skipping (run the create phase first).`
        );
        if (branch && gitState) abandonUnit(GIT_CFG, gitState, branch);
        out.skipped++;
        continue;
      }
      files = existing.map((f) => `${rel(dir!)}/${f}`);
    }

    const prompt = mode === "create" ? buildCreatePrompt(p) : buildUpdatePrompt(p, dir!, files);
    ensureDir(PROMPTS_DIR);
    const promptPath = path.join(PROMPTS_DIR, `page-${p.identifier}.${mode}.md`);
    fs.writeFileSync(promptPath, prompt, "utf-8");
    log("📝", `prompt → ${rel(promptPath)}`);

    if (DRY_RUN) {
      out.skipped++;
      continue;
    }

    log("🧠", `Page ${p.name} → model ${CLAUDE_MODEL_PAGE}`);
    log("🔨", `Page ${p.name} — start building...`);

    const run = await runClaude(
      prompt,
      `${p.name} ${mode}`,
      CLAUDE_MODEL_PAGE,
      CLAUDE_PAGE_TIMEOUT_MS
    );
    const success = run.code === 0;
    out.usage.push({ label: p.name, mode, ok: success, model: CLAUDE_MODEL_PAGE, run });

    if (!success) {
      out.failed++;
      log("❌", `Page ${p.name} build failed (exit ${run.code}) — prompt kept at ${rel(promptPath)}`);
      if (branch && gitState) abandonUnit(GIT_CFG, gitState, branch);
      continue;
    }

    p.codeStatus = "created";
    p.builtAgainstHash = p.figmaHash;
    p.builtAt = nowISO();
    p.builtWithModel = CLAUDE_MODEL_PAGE;
    const finalDir = dir ?? findPageDir(p.identifier);
    if (finalDir) p.targetDir = rel(finalDir);

    // The docs page was written by the same turn, so it is current by
    // construction — record that, or storybookDocs would pay to rewrite it.
    const mdxWritten =
      !NO_DOCS && finalDir != null && fs.existsSync(path.join(finalDir, `${p.identifier}.mdx`));
    if (mdxWritten) p.docsBuiltAgainstHash = p.figmaHash;

    writeJSON(PAGES_VERSION_FILE, file); // save progress after every page
    consumePrompt(promptPath);
    out.built++;
    log("✅", `Page ${p.name} built successfully → ${p.targetDir ?? `src/pages/${p.identifier}`}`);

    if (NO_DOCS) {
      log("⏭ ", `Page ${p.name} — docs page not requested (--no-docs)`);
    } else if (mdxWritten) {
      log("📖", `Page ${p.name} — docs page written in the same turn`);
    } else {
      out.docsFailed++;
      log(
        "⚠️ ",
        `Page ${p.name} — no .mdx was produced; run ` +
          `\`npm run storybookDocs -- --only=${p.identifier}\` to backfill it`
      );
    }

    let worst = 0;
    if (NO_DRIFT) {
      log("⏭ ", `Page ${p.name} — drift detection skipped (--no-drift)`);
    } else {
      log("🔍", `Page ${p.name} — drift detection...`);
      const drift = await runDrift(p.identifier);
      worst = drift.worst;
      if (!drift.ran) {
        log("⚠️ ", `Page ${p.name} drift could not run — ${drift.note}`);
      } else {
        // Pages are report-only for the BUILD's exit code (see
        // "drift.pageThreshold" in package.json) — but the git gate below still
        // applies, because shipping a page that no longer looks like the design
        // is exactly what the gate exists to stop.
        log(
          drift.failed ? "🟡" : "🟢",
          `Page ${p.name} — ${drift.passed} within threshold · ${drift.failed} over ` +
            `(worst ${(drift.worst * 100).toFixed(2)}%) — report only`
        );
      }
    }

    // ── Ship this page's branch on its own, right now ──
    if (branch && gitState) {
      if (!NO_DRIFT && worst * 100 >= GIT_CFG.maxDriftPercent) {
        out.blocked.push({ label: p.name, worst });
        log(
          "🛑",
          `Page ${p.name} — ${(worst * 100).toFixed(2)}% drift is at or over the ` +
            `${GIT_CFG.maxDriftPercent}% gate; branch abandoned, no PR`
        );
        abandonUnit(GIT_CFG, gitState, branch);
      } else {
        const result = shipUnit(GIT_CFG, gitState, branch, prUnitFor(p, mode, worst));
        logShipResult(`Page ${p.name}`, result);
        if (result.prUrl && !result.reason) out.shipped.push(p.name);
      }
    }
  }

  removeDirIfEmpty(PROMPTS_DIR); // only once the whole loop is done
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const phases = [DO_VERSION && "version", DO_CREATE && "create", DO_UPDATE && "update"]
    .filter(Boolean)
    .join(" → ");
  console.log(`\n=== Script 3 · pagePipeline (${phases}) ===`);
  if (DRY_RUN) log("🧪", "DRY RUN — no files written, no Claude calls, no drift detection");

  // Before anything is built: confirm the repo is fit to branch from (clean
  // tree, a remote, a resolvable base branch) — fail fast rather than
  // generating work we then can't ship.
  let gitState: RepoState | null = null;
  if (!NO_PR && !DRY_RUN && (DO_CREATE || DO_UPDATE)) {
    gitState = inspectRepo(GIT_CFG);
    if (!gitState.usable) {
      console.error(`❌  git flow unusable — ${gitState.reason}`);
      process.exitCode = 1;
      return;
    }
    if (!gitState.hasGh) {
      log("⚠️ ", "gh CLI not available/authenticated — branches will push, PRs need a click");
    }
    log("🌿", `base branch "${gitState.baseBranch}" — branching per page as each one builds`);
  }

  // Make sure Storybook can render documentation, so the first generated
  // .mdx has somewhere to go. Idempotent and silent on an already-configured
  // project.
  if (!NO_DOCS && (DO_CREATE || DO_UPDATE)) {
    ensureStorybookSetup({ dry: DRY_RUN, quiet: true });
  }

  let file: PagesVersionFile | null = null;

  if (DO_VERSION) {
    file = await runVersionPhase();
  } else {
    file = readJSON<PagesVersionFile>(PAGES_VERSION_FILE);
    if (!file || !Array.isArray(file.pages)) {
      console.error(
        `❌  ${rel(PAGES_VERSION_FILE)} not found or invalid.\n` +
          "    Run:  npm run pagePipeline:version"
      );
      process.exitCode = 1;
      return;
    }
  }
  if (!file) return;

  if (!DO_CREATE && !DO_UPDATE) {
    console.log("\n✅  Done.\n");
    return;
  }

  const totals: BuildOutcome = {
    built: 0,
    failed: 0,
    skipped: 0,
    docsFailed: 0,
    usage: [],
    shipped: [],
    blocked: [],
  };
  const merge = (o: BuildOutcome) => {
    totals.built += o.built;
    totals.failed += o.failed;
    totals.skipped += o.skipped;
    totals.docsFailed += o.docsFailed;
    totals.shipped.push(...o.shipped);
    totals.blocked.push(...o.blocked);
    totals.usage.push(...o.usage);
  };

  if (DO_CREATE) merge(await runBuildPhase(file, "create", gitState));
  if (DO_UPDATE) merge(await runBuildPhase(file, "update", gitState));

  reportUsage(totals.usage, "pages", "page", LOG_TOKEN_USAGE);

  // One compile for the whole run. A single bad story reference in any .mdx
  // breaks the ENTIRE site, so this cannot be checked per page.
  let storybookOk = true;
  if (!NO_DOCS && !DRY_RUN && totals.built > 0) {
    console.log("─".repeat(64));
    storybookOk = await verifyStorybookBuild();
  }

  console.log("─".repeat(64));
  log(
    "📊",
    `done — ${totals.built} built · ${totals.failed} failed · ${totals.skipped} skipped` +
      (NO_DOCS || DRY_RUN ? "" : ` · ${totals.docsFailed} docs-missing`) +
      (NO_PR || DRY_RUN ? "" : ` · ${totals.shipped.length} PR(s) opened`)
  );
  if (totals.failed > 0 || totals.docsFailed > 0 || !storybookOk) process.exitCode = 1;
  console.log();
}

void main().catch((err) => {
  console.error("\n❌  pagePipeline failed:", (err as Error).message);
  process.exitCode = 1;
});
