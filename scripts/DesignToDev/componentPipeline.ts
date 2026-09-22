/**
 * componentPipeline.ts — Script 2 of 5 : Figma components → React components
 * ---------------------------------------------------------------------------
 * Versioning and code generation in ONE script, because they are one job: the
 * version phase decides what needs building, and the build phase writes the
 * result straight back. Three phases, all optional:
 *
 *   version   walk the Figma file, hash every component, set codeStatus
 *   create    CREATE prompt  → Claude + Figma MCP, for "readyToCreate"
 *   update    UPDATE prompt  → Claude + Figma MCP, for "readyToUpdate"
 *
 * With no phase flag it runs all three in order.
 *
 * DOCUMENTATION — Storybook is set up (docs addon, Figma breakpoint viewports,
 * sidebar order, landing page) BEFORE anything is built, so the first generated
 * .mdx has somewhere to render. Each component's .mdx is then written by the
 * SAME Claude turn that builds it: that turn already holds the props it just
 * declared, the story exports it just wrote and the design it just read, so the
 * docs page costs nothing extra and cannot describe a prop that isn't there.
 * The whole site is compiled once at the end to catch a bad story reference,
 * which breaks the entire build rather than just its own page.
 *
 * After each component builds, driftDetection proves it against the design —
 * build, prove, next. Neither docs nor drift run on a dry run.
 *
 * GIT FLOW (see lib/git.ts) — once every component is built, each one that
 * produced file changes gets its own branch, commit, push and PR. The run is
 * atomic: if ANY component's worst visual drift reaches the gate (default 20%)
 * nothing is branched or pushed at all, and the reason is logged. `--no-pr`
 * turns the whole thing off.
 *
 * HOW CHANGE IS DETECTED (two tiers, so this scales past 100 components)
 *   1. GET /v1/files/:key?depth=1  → ~1.3KB. If Figma's file `version` is
 *      unchanged, nothing was edited: skip everything below.
 *   2. GET /v1/files/:key          → the ENTIRE document in one call. Every
 *      component is hashed locally from its own subtree (lib/hash.ts). Cost is
 *      flat — one request whether there are 8 components or 100, and no Claude
 *      tokens at all.
 *   Figma has no per-node edit timestamp, and /components' `updated_at` is
 *   publish-gated, so the hash is the only honest signal. See lib/hash.ts.
 *
 * Usage:
 *   npm run componentPipeline             version → create → update → drift
 *   npm run componentPipeline:version     version only
 *   npm run componentPipeline:create      create only
 *   npm run componentPipeline:update      update only
 *   npm run componentPipeline:dry         all phases, nothing written or spent
 *   npm run componentPipeline:versionDry  (etc.)
 *
 * Extra flags:
 *   --only=Button      one component by name
 *   --force            also rebuild components whose status is "created"
 *   --force-scan       ignore the file-version gate and re-hash everything
 *   --no-drift         skip visual regression after each build
 *   --no-docs          do not ask for the .mdx, skip the Storybook scaffold and
 *                      skip the final build check
 *   --no-pr            skip the git flow — build only, leave changes in the tree
 *   --logTokenUsage    also write the token table to scriptData/token-usage.json
 *                      (it is always printed either way)
 *
 * Env: FIGMA_TOKEN, FIGMA_FILE_KEY, FIGMA_PAGES_CANVAS, CLAUDE_BIN,
 *      CLAUDE_MODEL (forces one model), CLAUDE_MODEL_ATOMIC, CLAUDE_MODEL_COMPOSITE,
 *      CLAUDE_TIMEOUT_MS.
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  CLAUDE_MODEL,
  CLAUDE_MODEL_ATOMIC,
  CLAUDE_MODEL_COMPOSITE,
  COMPONENTS_SRC_DIR,
  COMPONENTS_VERSION_FILE,
  DRIFT_REPORT_HTML,
  FIGMA_FILE_KEY,
  PAGES_CANVAS,
  PIPELINE_REL,
  PROMPTS_DIR,
  ROOT_DIR,
  requireFigmaEnv,
} from "./lib/env.js";
import {
  consumePrompt,
  ensureDir,
  fileMTime,
  findGeneratedDir,
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
  fetchFileStamp,
  fetchFileTree,
  nodeLink,
  nodeH,
  nodeW,
  parseVariantProps,
  type FigmaFileTree,
  type FigmaNode,
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
  SCREEN_PROP_RE,
  baseKey,
  breakpointForWidth,
  deviceFromName,
  type Breakpoint,
} from "./lib/screens.js";
import type {
  CodeStatus,
  ComponentEntry,
  ComponentInfo,
  ComponentsVersionFile,
  VariantInfo,
} from "./lib/types.js";

requireFigmaEnv();

// ─── Flags ─────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const opt = (n: string) => argv.find((a) => a.startsWith(`${n}=`))?.slice(n.length + 1);

const WANT_VERSION = flag("--version");
const WANT_CREATE = flag("--create");
const WANT_UPDATE = flag("--update");
/** No phase named → run the whole pipeline. */
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

const GIT_CFG: GitConfig = loadGitConfig(
  readJSON<{ git?: Partial<GitConfig> }>(path.join(ROOT_DIR, "package.json"))?.git
);

/** Page-level designs live on their own canvas and belong to pagePipeline.ts. */
const PAGES_CANVASES = new Set(
  PAGES_CANVAS.split(",")
    .map((s) => normId(s))
    .filter(Boolean)
);

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1 — VERSION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Walk the file tree and turn every COMPONENT_SET / standalone COMPONENT into an
 * entry. Reading the tree rather than the published-library index is what lets
 * this see unpublished nodes, drop deleted ones, and get the variant map right.
 */
function buildComponentIndex(tree: FigmaFileTree): ComponentInfo[] {
  interface Group {
    name: string;
    page: string | null;
    nodeId: string;
    hash: string;
    width: number;
    height: number;
    root: FigmaNode;
    variants: VariantInfo[];
    /** this group's own COMPONENT node ids — used to resolve instances */
    ownIds: Set<string>;
    instanceIds: Set<string>;
  }

  const groups: Group[] = [];
  const ownerOf = new Map<string, Group>();

  for (const canvas of tree.document.children ?? []) {
    if (canvas.type !== "CANVAS") continue;
    if (PAGES_CANVASES.has(normId(canvas.name))) continue;

    for (const node of canvas.children ?? []) {
      if (node.type !== "COMPONENT" && node.type !== "COMPONENT_SET") continue;

      const variantNodes = node.type === "COMPONENT_SET" ? node.children ?? [] : [node];
      const g: Group = {
        name: node.name.trim(),
        page: canvas.name,
        nodeId: node.id,
        hash: hashNode(node),
        width: nodeW(node),
        height: nodeH(node),
        root: node,
        variants: variantNodes.map((v) => ({
          name: v.name,
          nodeId: v.id,
          props: parseVariantProps(v.name),
          figmaUrl: nodeLink(v.id),
          width: nodeW(v),
          height: nodeH(v),
        })),
        ownIds: new Set(variantNodes.map((v) => v.id)),
        instanceIds: new Set<string>(),
      };
      for (const id of g.ownIds) ownerOf.set(id, g);
      groups.push(g);
    }
  }

  // Real dependencies: an INSTANCE node names the component it instantiates, so
  // the graph comes from the design itself rather than guessing at name substrings.
  for (const g of groups) {
    (function walk(n: FigmaNode) {
      if (n.type === "INSTANCE" && n.componentId) g.instanceIds.add(n.componentId);
      for (const c of n.children ?? []) walk(c);
    })(g.root);
  }

  const deps = new Map<Group, Set<Group>>();
  for (const g of groups) {
    const set = new Set<Group>();
    for (const cid of g.instanceIds) {
      const owner = ownerOf.get(cid);
      if (owner && owner !== g) set.add(owner);
    }
    deps.set(g, set);
  }

  // Kahn topological sort — dependencies first, alphabetical within a rank, so a
  // Card is always built before the Product Card that instantiates it.
  const inDegree = new Map<Group, number>(groups.map((g) => [g, 0]));
  const dependents = new Map<Group, Group[]>(groups.map((g) => [g, []]));
  for (const [g, set] of deps) {
    for (const d of set) {
      dependents.get(d)!.push(g);
      inDegree.set(g, inDegree.get(g)! + 1);
    }
  }
  const queue = groups.filter((g) => inDegree.get(g) === 0);
  const ordered: Group[] = [];
  while (queue.length) {
    queue.sort((a, b) => a.name.localeCompare(b.name));
    const g = queue.shift()!;
    ordered.push(g);
    for (const d of dependents.get(g)!) {
      inDegree.set(d, inDegree.get(d)! - 1);
      if (inDegree.get(d) === 0) queue.push(d);
    }
  }
  for (const g of groups) if (!ordered.includes(g)) ordered.push(g); // cycle → append

  return ordered.map((g) => {
    const variantProps: Record<string, Set<string>> = {};
    for (const v of g.variants) {
      for (const [k, val] of Object.entries(v.props)) {
        (variantProps[k] ??= new Set<string>()).add(val);
      }
    }
    return {
      name: g.name,
      nodeId: g.nodeId,
      page: g.page,
      figmaUrl: nodeLink(g.nodeId),
      figmaHash: g.hash,
      width: g.width,
      height: g.height,
      variantProps: Object.fromEntries(
        Object.entries(variantProps).map(([k, s]) => [k, [...s]])
      ),
      variants: g.variants,
      dependsOn: [...deps.get(g)!].map((d) => d.name).sort(),
      description: "",
    } satisfies ComponentInfo;
  });
}

/** Variant identity — exactly what the stale published index used to get wrong. */
const variantFingerprint = (vs: VariantInfo[]): string =>
  vs
    .map((v) => `${v.nodeId}=${v.name}`)
    .sort()
    .join("|");

function computeCodeStatus(builtAgainstHash: string | null, hash: string): CodeStatus {
  if (builtAgainstHash == null) return "readyToCreate";
  return builtAgainstHash === hash ? "created" : "readyToUpdate";
}

function countStatuses(components: ComponentEntry[]): Record<CodeStatus, number> {
  return components.reduce<Record<CodeStatus, number>>(
    (acc, c) => {
      acc[c.codeStatus]++;
      return acc;
    },
    { readyToCreate: 0, readyToUpdate: 0, created: 0 }
  );
}

function summarise(components: ComponentEntry[]): void {
  const counts = countStatuses(components);
  for (const c of components.filter((x) => x.codeStatus !== "created")) {
    log("  •", `${c.name} — ${c.codeStatus}`);
  }
  log(
    "📊",
    `readyToCreate ${counts.readyToCreate} · readyToUpdate ${counts.readyToUpdate} · ` +
      `created ${counts.created}`
  );
}

async function runVersionPhase(): Promise<ComponentsVersionFile | null> {
  console.log("\n── Phase: version ──────────────────────────────────────────");

  const prevFile = readJSON<ComponentsVersionFile>(COMPONENTS_VERSION_FILE);

  // Tier 1 — the cheap gate.
  const stamp = await fetchFileStamp();
  if (
    !FORCE_SCAN &&
    prevFile?.figmaVersion === stamp.version &&
    (prevFile?.components?.length ?? 0) > 0
  ) {
    log("✓ ", `Figma unchanged (version ${stamp.version}) — skipped the full scan`);
    summarise(prevFile!.components);
    return prevFile;
  }

  // Tier 2 — ONE document fetch, then hash every component locally.
  log("🌐", `file version ${stamp.version} — fetching document…`);
  const tree = await fetchFileTree();
  const infos = buildComponentIndex(tree);
  log("🧩", `${infos.length} component(s) found`);

  const prevComponents = prevFile?.components ?? [];
  const byNode = new Map(prevComponents.map((c) => [c.nodeId, c]));
  const byName = new Map(prevComponents.map((c) => [normId(c.name), c]));
  const matched = new Set<ComponentEntry>();

  const components: ComponentEntry[] = infos.map((info) => {
    // Identity must survive Figma re-minting a node id when a component is recreated.
    let prev = byNode.get(info.nodeId);
    if (!prev) {
      const hit = byName.get(normId(info.name));
      if (hit) {
        log("🔗", `"${info.name}" node id changed ${hit.nodeId} → ${info.nodeId}`);
        prev = hit;
      }
    }
    if (prev) matched.add(prev);

    let builtAgainstHash = prev?.builtAgainstHash ?? null;
    let builtAt = prev?.builtAt ?? null;
    let targetDir = prev?.targetDir ?? null;

    // Migration: entries written before hashing existed.
    if (prev && builtAgainstHash == null && prev.builtAt != null) {
      const drifted = variantFingerprint(prev.variants ?? []) !== variantFingerprint(info.variants);
      if (drifted) {
        log("⚠️ ", `"${info.name}" variants changed since it was built — needs update`);
        builtAgainstHash = "legacy-drift"; // != figmaHash → readyToUpdate
      } else {
        builtAgainstHash = info.figmaHash; // adopt, no rebuild
      }
    }

    // Generated code on disk but no record at all → adopt instead of rebuilding.
    if (builtAgainstHash == null && builtAt == null) {
      const dir = findGeneratedDir(COMPONENTS_SRC_DIR, info.name);
      if (dir) {
        log("📎", `"${info.name}" already built at ${rel(dir)} — adopted, not rebuilt`);
        builtAgainstHash = info.figmaHash;
        builtAt = fileMTime(path.join(dir, `${path.basename(dir)}.tsx`));
        targetDir = rel(dir);
      }
    }

    return {
      ...info,
      codeStatus: computeCodeStatus(builtAgainstHash, info.figmaHash),
      builtAgainstHash,
      builtAt,
      builtWithModel: prev?.builtWithModel ?? null,
      targetDir,
    } satisfies ComponentEntry;
  });

  for (const p of prevComponents) {
    if (!matched.has(p)) {
      log("🗑 ", `"${p.name}" no longer in Figma — removed from version file`);
    }
  }

  const out: ComponentsVersionFile = {
    figmaFileKey: FIGMA_FILE_KEY,
    figmaVersion: stamp.version,
    lastModified: stamp.lastModified,
    updatedAt: nowISO(),
    components,
  };

  if (DRY_RUN) {
    log("🧪", `would write ${rel(COMPONENTS_VERSION_FILE)} — not written (dry run)`);
  } else {
    writeJSON(COMPONENTS_VERSION_FILE, out);
    log("💾", `${rel(COMPONENTS_VERSION_FILE)} — updatedAt ${out.updatedAt}`);
  }
  summarise(components);
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPTS
// ═══════════════════════════════════════════════════════════════════════════

const PROJECT_CONTEXT = `Existing React + Vite + TypeScript project, setup complete — do not scaffold tooling.
Stack: React + Storybook (CSF3) + Vitest/RTL + SCSS Modules.
Design tokens are global CSS custom properties in src/designToken.css
(e.g. --colors-primary-700, --spacing-4, --radius-md). Read that file; use var(--token)
for every colour, spacing, radius, font-size, line-height and shadow that has one only if value matchs.
IMPORTS: the "@ -> src/" alias is NOT configured in this repo — use relative imports.`;

function variantLines(c: ComponentEntry): string {
  if (!c.variants.length) return `  - (default)  ->  ${c.figmaUrl}`;
  return c.variants
    .map((v) => {
      const label =
        Object.entries(v.props)
          .map(([k, val]) => `${k}=${val}`)
          .join(", ") || v.name;
      return `  - ${label}  (${v.width}×${v.height}px)  ->  ${v.figmaUrl}`;
    })
    .join("\n");
}

function depLines(c: ComponentEntry): string {
  if (!c.dependsOn.length) return "  none";
  return c.dependsOn
    .map(
      (d) =>
        `  - ${d}  (already built — import and reuse from src/components/**/${d}/${d}.tsx, do not re-create)`
    )
    .join("\n");
}

function figmaSourceBlock(c: ComponentEntry, id: string): string {
  return `Figma is the single source of truth. Use the Figma MCP (server "figma") on the
component node AND on every variant node below:
- get_design_context / get_code / get_variable_defs -> use the returned sizes, spacing,
  colours, typography, radius, border, effects and layout verbatim. Never guess a value
  the MCP can give you.
- get_screenshot on each node -> keep as the visual target to check your build against.
- ASSETS: for every image and icon in the design, pull the real file from the MCP
  (download_assets, or the image-fill / exported-node refs in get_design_context). Save it to
  src/assets/${id}/ and import it with a relative path. Use a placeholder element ONLY when
  the MCP returns no asset for that node.

Component node : ${c.figmaUrl}   (${c.width}×${c.height}px)
Variant nodes  :
${variantLines(c)}

Variant properties (map exactly onto typed React props):
${JSON.stringify(c.variantProps, null, 2)}

Depends on:
${depLines(c)}${c.description ? `\n\nFigma description: ${c.description}` : ""}`;
}

/**
 * The component is compared pixel-for-pixel against its Figma frame after the
 * build, laid out at exactly that frame's width — so a component that collapses
 * to its content instead of filling the frame reads as a real failure.
 */
function sizingRules(c: ComponentEntry): string {
  const sizes = c.variants.length
    ? c.variants.map((v) => `${v.name} ${v.width}×${v.height}`).join(" · ")
    : `${c.width}×${c.height}`;
  const widths = new Set(c.variants.map((v) => v.width).filter(Boolean));
  const uniform = widths.size <= 1;
  const base = c.variants.length ? Math.max(...c.variants.map((v) => v.width)) : c.width;

  return `SIZING — match the Figma frame box
- Every variant is rendered in a container of exactly its own Figma width and compared
  against that frame afterwards. A component that shrink-wraps instead of filling its
  container reads as a real failure, so get this right.
- Variant frames: ${sizes}
${
  uniform
    ? `- All variants share one width (${base}px), so the code must render them all at that
  same width — no variant may collapse to its content.`
    : `- The widths differ, which means these are SCREEN designs: build one component whose
  media queries produce each width, not a fixed size per variant.`
}
- Root element: if Figma's layout is "Fill container" use width:100%; if "Fixed" use the
  px value; if "Hug contents" let it hug — but it must hug to the size Figma shows.
- Do not add a max-width the design does not have, and do not leave outer margin on the
  root — spacing belongs to the parent.`;
}

const BEHAVIOR_RULES = `BEHAVIOR — build real interaction, not just static variants
- For each state Figma shows (Hover, Focus, Active/Pressed, Selected, Filled, Error, Open, ...):
  * purely visual -> CSS :hover / :focus-visible / :active in the .module.scss
  * needs logic   -> React state + handlers (onMouseEnter/Leave, onFocus/Blur,
                     onPointerDown/Up, onClick, onChange)
- The variant/state prop only FORCES a state for stories, tests and docs. With no forced state
  the component must move between Default and its other states on real user interaction.
  Button: restyle on hover, pressed feedback on pointer-down, disabled blocks handlers.
  Input:  focus ring + label shift on focus; "filled" style once it has a value; "error" style
          when invalid; controlled via value/onChange.
- If Figma defines a prototype interaction (on click / on hover -> change), wire that behaviour.`;

const UNDERSPEC_RULES = (id: string) => `UNDERSPECIFIED ELEMENTS
- When the MCP cannot fully describe an element (e.g. a rating drawn as one flattened graphic,
  missing sub-icons): first use the Figma layer names + description for intent; if still unclear,
  implement the conventional accessible pattern and note the assumption in ${id}.md.
- Rating stars: 5 stars; value + defaultValue props; hovering previews the fill up to the hovered
  star; click commits the value; keyboard accessible; readOnly prop for display-only use.`;

const EFFICIENCY_RULES = `EFFICIENCY
- Do the smallest fully-correct thing. No unrequested abstraction, no extra files,
  no speculative props. Reuse Figma MCP output you already fetched instead of
  re-calling; don't re-run tsc / vitest more than needed.
- If the same result at the same visual accuracy and correctness can be reached in
  fewer tokens or turns, take that path.
- Quality first: never trade pixel-accuracy, correct variants, accessibility or
  passing tests for brevity.`;

const RULES = (id: string) => `RULES
TSX     One component, every variant reachable via typed props. Export \`${id}Props\`.
        Props mirror the variant properties above. Reuse dependency components. No inline style={{}}.
        Accessible: correct roles, aria-disabled / aria-label, sensible focus order.
SCSS    BEM-like classes mirroring the node tree; token values from src/designToken.css where they exist.
STORIES CSF3; default export = meta; one named export per variant (force its state via args).
TESTS   RTL; one it() per variant (renders + key text visible; disabled variant has
        aria-disabled="true"); plus one interaction test for the main behaviour (click / type).
MD      H1 = component name; 1-2 line description; props table (Prop | Type | Default | Description);
        usage snippet; variants list; any assumptions from UNDERSPECIFIED ELEMENTS; Updates Table: (Date | Discriptsion) .`;

/** The .mdx contract, or nothing at all when the run is --no-docs. */
const docsRules = (id: string): string => (NO_DOCS ? "" : `\n${MDX_RULES(id, false)}\n`);

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

const FINISH = (id: string) =>
  `Run:  npx tsc --noEmit   and   npx vitest run ${id}\nFix every TypeScript and test error before finishing.`;

/** Every component in the version file — for the responsive sibling lookup. */
let ALL_COMPONENTS: ComponentEntry[] = [];

function screenSiblings(c: ComponentEntry): ComponentEntry[] {
  const key = baseKey(c.name);
  return ALL_COMPONENTS.filter((o) => o.nodeId !== c.nodeId && baseKey(o.name) === key);
}

/**
 * Variants that are alternate SCREEN designs rather than states.
 *
 * "Footer-Desktop" (1440px) / "Footer-Laptop" (1024px) is a component set with
 * no `Screen=` variant property at all — Figma just names the frames. Without
 * this check the prompt fell through to "only one design exists, so YOU make it
 * responsive", throwing away a laptop layout the designer had already drawn.
 */
function screenVariantsOf(c: ComponentEntry): Array<{ v: VariantInfo; bp: Breakpoint }> | null {
  if (c.variants.length < 2) return null;
  const widths = new Set(c.variants.map((v) => v.width).filter(Boolean));
  if (widths.size < 2) return null; // same width -> these are states, not screens
  const mapped = c.variants.map((v) => ({
    v,
    bp: deviceFromName(v.name) ?? breakpointForWidth(v.width),
  }));
  const deduped = mapped.filter(
    (m, i, all) => all.findIndex((o) => o.bp.name === m.bp.name) === i
  );
  if (deduped.length < 2) return null;
  return deduped.sort((a, b) => a.v.width - b.v.width);
}

/**
 * Responsive contract, driven by what Figma actually contains:
 *   1. the component has a screen variant PROPERTY -> one media query per value
 *   2. its variants are screen designs by width    -> one media query per variant
 *   3. a separate component is its mobile twin     -> use that design
 *   4. none of the above                           -> make it responsive yourself,
 *                                                     and document every decision
 */
function responsiveRules(c: ComponentEntry, id: string): string {
  const screenProp = Object.keys(c.variantProps).find((k) => SCREEN_PROP_RE.test(k));
  if (screenProp) {
    const values = c.variantProps[screenProp].join(", ");
    return `RESPONSIVE — Figma defines screen variants ("${screenProp}": ${values})
Call the Figma MCP on EVERY variant node and build one media query per variant using
that variant's real values. Do not invent a breakpoint Figma already answers, and do
not expose "${screenProp}" as a React prop — it is a viewport, not an API.`;
  }

  const screens = screenVariantsOf(c);
  if (screens) {
    const lines = screens
      .map(
        (s) =>
          `  - ${s.bp.name} (${s.v.width}×${s.v.height}px, "${s.v.name}")  ->  @media ${s.bp.media}\n` +
          `      ${s.v.figmaUrl}`
      )
      .join("\n");
    const widest = screens[screens.length - 1];
    return `RESPONSIVE — the variants ARE screen designs (different widths, one per breakpoint)
This component set does not define a "Screen" property; Figma names the frames
instead. Each variant below is the SAME component at a different screen size, so
build ONE component with media queries — never one component per size, and never a
React prop for the breakpoint:
${lines}

- Call the Figma MCP on EVERY node above and use that variant's real values. Do not
  guess a layout Figma has already drawn, and do not invent a breakpoint it answers.
- The widest design (${widest.v.width}px) is the base; narrower ones are overrides.
- Below the narrowest design (${screens[0].v.width}px) keep it working down to 375px
  with fluid primitives, and list those decisions in ${id}.md under "Assumptions".`;
  }

  const siblings = screenSiblings(c);
  if (siblings.length) {
    const lines = siblings.map((s) => `  - ${s.name} (${s.width}px)  ->  ${s.figmaUrl}`).join("\n");
    return `RESPONSIVE — alternate screen designs exist as SEPARATE Figma components
Do NOT invent the small-screen layout: these nodes already define it. Call the Figma
MCP on each and build a media query per design, using its real values:
  - ${c.name} (base, ${c.width}px)  ->  ${c.figmaUrl}
${lines}

Build ONE component with breakpoints — not one component per screen size.`;
  }

  return `RESPONSIVE — only one design exists, so YOU make it responsive
Figma defines this component at ${c.width}px only, and no separate mobile/tablet version
exists in the file. Build that design faithfully, then make it work down to 375px:
  - mobile <768 · tablet 768-1023 · laptop 1024-1439 · desktop >=1440 · large >=1920
- Prefer fluid primitives first: flex-wrap, grid auto-fit + minmax, max-width,
  clamp() for type and large padding, width:100% instead of fixed px.
- You MAY restructure where the wide layout genuinely cannot work small (collapse a
  horizontal nav to a burger, stack columns, reflow a card row). Use conventional,
  accessible patterns — a burger toggle is a real <button> with aria-expanded /
  aria-controls and full keyboard support.
- Never drop content or functionality to make it fit; never cause horizontal scroll,
  overlapping text or a cut-off element.
- The ${c.width}px design stays the base; the smaller layouts are overrides.
- These decisions are yours, not Figma's — list every one in ${id}.md under
  "Assumptions" (what changed, at which breakpoint, why).`;
}

function buildCreatePrompt(c: ComponentEntry): string {
  const id = pascalId(c.name);
  return `${PROJECT_CONTEXT}

============================================================
TASK — CREATE COMPONENT: ${c.name}  (identifier: ${id})
============================================================
Output dir:  atomic (Button, Input, Icon ...) -> src/components/atoms/${id}/
             composite (Card, Navbar, Modal ...) -> src/components/${id}/
Create only these files (real image/icon assets downloaded from Figma go in src/assets/${id}/):
  ${fileList(id)}

============================================================
FIGMA — SOURCE OF TRUTH
============================================================
${figmaSourceBlock(c, id)}

============================================================
${sizingRules(c)}

${BEHAVIOR_RULES}

${responsiveRules(c, id)}

${UNDERSPEC_RULES(id)}

${EFFICIENCY_RULES}

${RULES(id)}
${docsRules(id)}
============================================================
${FINISH(id)}`;
}

function buildUpdatePrompt(c: ComponentEntry, dir: string, files: string[]): string {
  const id =
    files
      .find((f) => /\.tsx$/i.test(f) && !/\.(stories|test)\.tsx$/i.test(f))
      ?.split("/")
      .pop()
      ?.replace(/\.tsx$/i, "") ?? pascalId(c.name);
  return `${PROJECT_CONTEXT}

============================================================
TASK — UPDATE COMPONENT: ${c.name}  (identifier: ${id})
============================================================
Make the component pixel-perfect against the current Figma design and production-ready.
Edit these files in place — do NOT rename them (downloaded images/icons go in
src/assets/${id}/):
${files.map((f) => `  - ${f}`).join("\n")}
Component directory: ${rel(dir)}/
${
  NO_DOCS || files.some((f) => f.toLowerCase().endsWith(`${id.toLowerCase()}.mdx`))
    ? "Create no other files."
    : `The docs page ${id}.mdx does not exist yet — CREATE it as described below. ` +
      "Create no other files."
}

WHY THIS RUN EXISTS
The Figma design changed after this component was last built — its content hash no
longer matches what the code was generated from. Re-read EVERY node listed below
through the MCP and treat the current design as truth: variant names, ordering and
node ids may all have moved since. Do not assume the existing code's mapping of
node -> variant is still correct; verify each one against the MCP response.

============================================================
FIGMA — SOURCE OF TRUTH
============================================================
${figmaSourceBlock(c, id)}

============================================================
${sizingRules(c)}

${BEHAVIOR_RULES}

${responsiveRules(c, id)}

${UNDERSPEC_RULES(id)}

CHANGES
- Match Figma exactly: spacing, sizing, colours, typography, radius, border, shadows and every
  interactive state. Replace any leftover placeholders with the real MCP assets.
- Keep the public props API stable UNLESS the variant properties changed — if they did, update
  the props interface and ${id}.stories.tsx / ${id}.test.tsx / ${id}.md to match.

${EFFICIENCY_RULES}

${RULES(id)}
${docsRules(id)}
============================================================
${FINISH(id)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// MODEL TIERING
// ═══════════════════════════════════════════════════════════════════════════

const COMPOSITE_RE =
  /\b(card|modal|dialog|nav|navbar|header|footer|sidebar|drawer|table|list|form|menu|hero|section|page|layout|panel|accordion|carousel|tabs|toast|banner|grid)\b/i;

function pickModel(c: ComponentEntry): { model: string; tier: string } {
  if (CLAUDE_MODEL) return { model: CLAUDE_MODEL, tier: "forced" };
  const dims = Object.keys(c.variantProps).length;
  const atomic =
    c.dependsOn.length === 0 && dims <= 2 && !COMPOSITE_RE.test(`${c.name} ${c.description}`);
  return atomic
    ? { model: CLAUDE_MODEL_ATOMIC, tier: "atomic" }
    : { model: CLAUDE_MODEL_COMPOSITE, tier: "composite" };
}

// ═══════════════════════════════════════════════════════════════════════════
// DRIFT DETECTION (per component, straight after its build)
// ═══════════════════════════════════════════════════════════════════════════

interface DriftSummary {
  ran: boolean;
  passed: number;
  failed: number;
  noStory: number;
  errored: number;
  worst: number;
  note?: string;
}

interface DriftRow {
  kind?: string;
  target: string;
  variant: string;
  status: "pass" | "fail" | "no-story" | "errored";
  mismatchRatio: number;
}

async function runDrift(componentName: string): Promise<DriftSummary> {
  // Stripped to alphanumerics: driftDetection matches --only case- and
  // punctuation-insensitively, and this keeps spaces out of a shell-spawned arg.
  const onlyArg = componentName.replace(/[^A-Za-z0-9]/g, "");
  const empty: DriftSummary = {
    ran: false,
    passed: 0,
    failed: 0,
    noStory: 0,
    errored: 0,
    worst: 0,
  };

  const code = await new Promise<number>((resolve) => {
    const proc = spawn(
      "npx",
      [
        "tsx",
        `${PIPELINE_REL}/driftDetection.ts`,
        "--components",
        `--only=${onlyArg}`,
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
  const mine = rows.filter(
    (r) => r.kind !== "page" && normId(r.target ?? "") === normId(componentName)
  );
  if (mine.length === 0) {
    return {
      ...empty,
      note: code === 127 ? "could not spawn npx tsx" : `driftDetection produced no rows (exit ${code})`,
    };
  }
  return {
    ran: true,
    passed: mine.filter((r) => r.status === "pass").length,
    failed: mine.filter((r) => r.status === "fail").length,
    noStory: mine.filter((r) => r.status === "no-story").length,
    errored: mine.filter((r) => r.status === "errored").length,
    worst: mine.reduce((m, r) => Math.max(m, r.mismatchRatio ?? 0), 0),
  };
}

/**
 * Did the build actually produce a docs page? The identifier on disk wins over
 * the one we would derive from the Figma name — an adopted component may well be
 * called something slightly different.
 */
function hasMdx(dir: string, figmaName: string): boolean {
  const files = listFiles(dir);
  const stem =
    files
      .find((f) => /\.tsx$/i.test(f) && !/\.(stories|test)\.tsx$/i.test(f))
      ?.replace(/\.tsx$/i, "") ?? pascalId(figmaName);
  return files.some((f) => f.toLowerCase() === `${stem.toLowerCase()}.mdx`);
}

function prUnitFor(
  c: ComponentEntry,
  mode: "create" | "update",
  worst: number,
  model: string
): UnitInfo {
  const verb = mode === "create" ? "create" : "sync";
  const variants = c.variants
    .map((v) => `- \`${v.name}\` (${v.width}×${v.height}px)`)
    .join("\n");
  return {
    title: `${mode === "create" ? "feat" : "fix"}(${c.name}): ${verb} with Figma design`,
    body: [
      `Generated by the DesignToDev pipeline (${mode}) from Figma.`,
      "",
      `**Figma node:** ${c.figmaUrl}`,
      `**Content hash:** \`${c.figmaHash}\``,
      `**Model:** ${model}`,
      "",
      "**Variants**",
      variants || "- (single frame)",
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

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2/3 — BUILD
// ═══════════════════════════════════════════════════════════════════════════

interface BuildOutcome {
  built: number;
  failed: number;
  skipped: number;
  driftFailed: number;
  docsFailed: number;
  usage: UsageRow[];
  /** Components shipped to their own branch + PR. */
  shipped: string[];
  /** Components whose worst drift reached the gate — abandoned, not shipped. */
  blocked: Array<{ label: string; worst: number }>;
}

async function runBuildPhase(
  file: ComponentsVersionFile,
  mode: "create" | "update",
  gitState: RepoState | null
): Promise<BuildOutcome> {
  console.log(`\n── Phase: ${mode} ────────────────────────────────────────────`);

  const out: BuildOutcome = {
    built: 0,
    failed: 0,
    skipped: 0,
    driftFailed: 0,
    docsFailed: 0,
    usage: [],
    shipped: [],
    blocked: [],
  };

  const targets = file.components.filter((c) => {
    if (ONLY_ARG && normId(c.name) !== normId(ONLY_ARG)) return false;
    if (mode === "create") return c.codeStatus === "readyToCreate";
    // update: drifted components, plus "created" ones when forced
    return c.codeStatus === "readyToUpdate" || (FORCE && c.codeStatus === "created");
  });

  if (targets.length === 0) {
    log(
      "✓ ",
      mode === "create"
        ? "Nothing to create — every Figma component already has code."
        : "Nothing to update — no component has drifted in Figma since it was built."
    );
    return out;
  }

  log("🚀", `${targets.length} component(s) queued${DRY_RUN ? " — DRY RUN (prompts only)" : ""}:`);
  for (const c of targets) {
    const forced = FORCE && c.codeStatus === "created";
    console.log(`   - ${c.name}  [${c.codeStatus}${forced ? " → forced update" : ""}]`);
  }
  console.log();

  ensureDir(PROMPTS_DIR);

  for (let i = 0; i < targets.length; i++) {
    const c = targets[i];

    console.log("─".repeat(64));
    log(`[${i + 1}/${targets.length}]`, `${c.name} — ${mode}`);

    // Branch off base before generating, so this component's work lands
    // directly on its own branch. No branch in dry-run / --no-pr modes.
    let branch: string | null = null;
    if (!NO_PR && !DRY_RUN && gitState) {
      const begun = beginUnit(GIT_CFG, gitState, "component", c.name);
      if (!begun.ok) {
        log("❌", `Component ${c.name} — ${begun.reason}`);
        out.failed++;
        continue;
      }
      branch = begun.branch;
    }

    log("📥", `Component ${c.name} fetched!  (node ${c.nodeId} · ${c.variants.length} variant(s))`);

    const { model, tier } = pickModel(c);
    log("🧠", `Component ${c.name} → model ${model} (${tier})`);

    // Resolve existing files for the UPDATE flow.
    let dir: string | null = null;
    let files: string[] = [];
    if (mode === "update") {
      const fromTarget =
        c.targetDir && fs.existsSync(path.join(ROOT_DIR, c.targetDir))
          ? path.join(ROOT_DIR, c.targetDir)
          : null;
      dir = fromTarget ?? findGeneratedDir(COMPONENTS_SRC_DIR, c.name);
      const existing = dir ? listFiles(dir) : [];
      if (!dir || existing.length === 0) {
        console.error(
          `   ⚠️  no existing component files for "${c.name}" — skipping ` +
            "(run the create phase first, or fix its targetDir in components.version.json)."
        );
        if (branch && gitState) abandonUnit(GIT_CFG, gitState, branch);
        out.skipped++;
        continue;
      }
      files = existing.map((f) => `${rel(dir!)}/${f}`);
    }

    const prompt =
      mode === "create" ? buildCreatePrompt(c) : buildUpdatePrompt(c, dir!, files);

    // Prefixed because components and pages now share one prompts dir.
    ensureDir(PROMPTS_DIR);
    const promptPath = path.join(PROMPTS_DIR, `component-${c.name}.${mode}.md`);
    fs.writeFileSync(promptPath, prompt, "utf-8");
    log("📝", `prompt → ${rel(promptPath)}`);

    if (DRY_RUN) {
      out.skipped++;
      continue;
    }

    log("🔨", `Component ${c.name} — start building...`);
    const run = await runClaude(prompt, `${c.name} ${mode}`, model);
    const success = run.code === 0;
    out.usage.push({ label: c.name, mode, ok: success, model, tier, run });

    if (!success) {
      out.failed++;
      log("❌", `Component ${c.name} build failed (exit ${run.code}) — prompt kept at ${rel(promptPath)}`);
      if (branch && gitState) abandonUnit(GIT_CFG, gitState, branch);
      continue;
    }

    c.codeStatus = "created";
    c.builtAgainstHash = c.figmaHash;
    c.builtAt = nowISO();
    c.builtWithModel = model;
    const finalDir = dir ?? findGeneratedDir(COMPONENTS_SRC_DIR, c.name);
    if (finalDir) c.targetDir = rel(finalDir);

    // The docs page was written by the same turn, so it is current by
    // construction — record that, or storybookDocs would pay to rewrite it.
    const mdxWritten = !NO_DOCS && finalDir != null && hasMdx(finalDir, c.name);
    if (mdxWritten) c.docsBuiltAgainstHash = c.figmaHash;

    writeJSON(COMPONENTS_VERSION_FILE, file); // save progress after every component
    consumePrompt(promptPath);
    out.built++;
    log("✅", `Component ${c.name} built successfully → codeStatus: created`);

    if (NO_DOCS) {
      log("⏭ ", `Component ${c.name} — docs page not requested (--no-docs)`);
    } else if (mdxWritten) {
      log("📖", `Component ${c.name} — docs page written in the same turn`);
    } else {
      out.docsFailed++;
      log(
        "⚠️ ",
        `Component ${c.name} — no .mdx was produced; run ` +
          `\`npm run storybookDocs -- --only=${c.name.replace(/[^A-Za-z0-9]/g, "")}\` to backfill it`
      );
    }

    let worst = 0;
    if (NO_DRIFT) {
      log("⏭ ", `Component ${c.name} — drift detection skipped (--no-drift)`);
    } else {
      log("🔍", `Component ${c.name} — drift detection...`);
      const drift = await runDrift(c.name);
      worst = drift.worst;
      if (!drift.ran) {
        out.driftFailed++;
        log("⚠️ ", `Component ${c.name} drift could not run — ${drift.note}`);
      } else if (drift.failed > 0 || drift.errored > 0) {
        out.driftFailed++;
        log(
          "🔴",`Component ${c.name} DRIFTED — ${drift.failed} fail · ${drift.errored} errored · ` + 
          `${drift.passed} pass (worst ${(drift.worst * 100).toFixed(2)}%)`
        );
      } else {
        log(
          "🟢",
          `Component ${c.name} matches Figma — ${drift.passed} variant(s)` +
            `${drift.noStory ? ` · ${drift.noStory} no-story` : ""} ` +
            `(worst ${(drift.worst * 100).toFixed(2)}%)`
        );
      }
    }

    // ── Ship this component's branch on its own, right now ──
    if (branch && gitState) {
      if (!NO_DRIFT && worst * 100 >= GIT_CFG.maxDriftPercent) {
        out.blocked.push({ label: c.name, worst });
        log(
          "🛑",
          `Component ${c.name} — ${(worst * 100).toFixed(2)}% drift is at or over the ` +
            `${GIT_CFG.maxDriftPercent}% gate; branch abandoned, no PR`
        );
        abandonUnit(GIT_CFG, gitState, branch);
      } else {
        const result = shipUnit(GIT_CFG, gitState, branch, prUnitFor(c, mode, worst, model));
        logShipResult(`Component ${c.name}`, result);
        if (result.prUrl && !result.reason) out.shipped.push(c.name);
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
  console.log(`\n=== Script 2 · componentPipeline (${phases}) ===`);
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
    log("🌿", `base branch "${gitState.baseBranch}" — branching per component as each one builds`);
  }

  // Make sure Storybook can render documentation, so the first generated
  // .mdx has somewhere to go. Idempotent and silent on an already-configured
  // project.
  if (!NO_DOCS && (DO_CREATE || DO_UPDATE)) {
    ensureStorybookSetup({ dry: DRY_RUN, quiet: true });
  }

  let file: ComponentsVersionFile | null = null;

  if (DO_VERSION) {
    file = await runVersionPhase();
  } else {
    file = readJSON<ComponentsVersionFile>(COMPONENTS_VERSION_FILE);
    if (!file || !Array.isArray(file.components)) {
      console.error(
        `❌  ${rel(COMPONENTS_VERSION_FILE)} not found or invalid.\n` +
          "    Run:  npm run componentPipeline:version"
      );
      process.exitCode = 1;
      return;
    }
  }
  if (!file) return;

  ALL_COMPONENTS = file.components; // sibling lookup for the responsive contract

  if (!DO_CREATE && !DO_UPDATE) {
    console.log("\n✅  Done.\n");
    return;
  }

  const totals: BuildOutcome = {
    built: 0,
    failed: 0,
    skipped: 0,
    driftFailed: 0,
    docsFailed: 0,
    usage: [],
    shipped: [],
    blocked: [],
  };
  const merge = (o: BuildOutcome) => {
    totals.built += o.built;
    totals.failed += o.failed;
    totals.skipped += o.skipped;
    totals.driftFailed += o.driftFailed;
    totals.docsFailed += o.docsFailed;
    totals.usage.push(...o.usage);
    totals.shipped.push(...o.shipped);
    totals.blocked.push(...o.blocked);
  };

  if (DO_CREATE) merge(await runBuildPhase(file, "create", gitState));
  if (DO_UPDATE) merge(await runBuildPhase(file, "update", gitState));

  reportUsage(totals.usage, "components", "component", LOG_TOKEN_USAGE);

  // One compile for the whole run. A single bad story reference in any .mdx
  // breaks the ENTIRE site, so this cannot be checked per component.
  let storybookOk = true;
  if (!NO_DOCS && !DRY_RUN && totals.built > 0) {
    console.log("─".repeat(64));
    storybookOk = await verifyStorybookBuild();
  }

  console.log("─".repeat(64));
  log(
    "📊",
    `done — ${totals.built} built · ${totals.failed} build-failed · ${totals.skipped} skipped` +
      (NO_DRIFT || DRY_RUN ? "" : ` · ${totals.driftFailed} drifted`) +
      (NO_DOCS || DRY_RUN ? "" : ` · ${totals.docsFailed} docs-missing`) +
      (NO_PR || DRY_RUN ? "" : ` · ${totals.shipped.length} PR(s) opened`)
  );
  if (!NO_DRIFT && !DRY_RUN && totals.built > 0) {
    log("🖼 ", `drift report → ${rel(DRIFT_REPORT_HTML)}`);
  }
  // A component that built but drifted keeps codeStatus "created"; the non-zero
  // exit is what surfaces it to CI.
  if (totals.failed > 0 || totals.driftFailed > 0 || totals.docsFailed > 0 || !storybookOk) {
    process.exitCode = 1;
  }
  console.log();
}

void main().catch((err) => {
  console.error("\n❌  componentPipeline failed:", (err as Error).message);
  process.exitCode = 1;
});
