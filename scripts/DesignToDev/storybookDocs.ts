/**
 * storybookDocs.ts — Script 5 of 5 : the Storybook documentation backfill
 * ---------------------------------------------------------------------------
 * Normally you never run this. componentPipeline and pagePipeline scaffold
 * Storybook before they build and write each <Name>.mdx in the SAME Claude turn
 * that builds the component — that turn already holds the props, the story names
 * and the design, so the docs page is free and cannot drift from the code.
 *
 * This script is the repair tool for everything that route cannot reach:
 *
 *   - components and pages ADOPTED from disk, which were never built by the
 *     pipeline and so never got a docs page
 *   - anything built with --no-docs
 *   - a build whose .mdx failed to land
 *   - re-documenting without paying to rebuild the component (--force)
 *
 * Two phases, same as before:
 *   scaffold  Storybook config — shared with the build pipelines, see
 *             lib/storybook.ts. Idempotent; never overwrites your edits.
 *   docs      one <Name>.mdx per target, authored by Claude from the real source,
 *             with a live <Canvas> per story and an auto <Controls> props table.
 *
 * COST — docs are a Claude turn per target, so they are HASH-GATED the same way
 * builds are: a target is only re-documented when its Figma content hash has
 * moved since its .mdx was written (`docsBuiltAgainstHash`). A no-op run is free,
 * and a page the build pipeline already wrote is never rewritten.
 *
 * The authored <Name>.md stays where it is: it is the portable, plain-text
 * record (readable on GitHub, in an IDE, in a diff) and the input this step
 * reads. The .mdx is the live Storybook page built from it.
 *
 * Usage:
 *   npm run storybookDocs                 scaffold + document anything missing
 *   npm run storybookDocs -- --missing    only targets with no .mdx at all
 *   npm run storybookDocs:dry             show the plan, write prompts, spend nothing
 *   npm run storybookDocs:scaffold        Storybook config only, no Claude
 *   npx tsx .../storybookDocs.ts --only=Button --force
 *
 * Flags:
 *   --missing        only targets that have NO .mdx yet (never rewrites one)
 *   --only=A,B       comma-separated names or identifiers
 *   --components · --pages · --force · --dry · --scaffold-only
 *   --no-verify      skip the final Storybook build check
 *   --logTokenUsage  also write the token table to scriptData/token-usage.json
 */

import fs from "node:fs";
import path from "node:path";
import {
  CLAUDE_DOCS_TIMEOUT_MS,
  CLAUDE_MODEL_DOCS,
  COMPONENTS_VERSION_FILE,
  PAGES_VERSION_FILE,
  PROMPTS_DIR,
  ROOT_DIR,
} from "./lib/env.js";
import {
  consumePrompt,
  ensureDir,
  listFiles,
  log,
  normId,
  readJSON,
  rel,
  removeDirIfEmpty,
  writeJSON,
} from "./lib/io.js";
import { runClaude } from "./lib/claude.js";
import { reportUsage, type UsageRow } from "./lib/usage.js";
import { ensureStorybookSetup, verifyStorybookBuild } from "./lib/storybook.js";
import type { ComponentsVersionFile, PagesVersionFile } from "./lib/types.js";

// ─── Flags ─────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const opt = (n: string) => argv.find((a) => a.startsWith(`${n}=`))?.slice(n.length + 1);

const WANT_COMPONENTS = flag("--components");
const WANT_PAGES = flag("--pages");
const DO_COMPONENTS = WANT_COMPONENTS || !WANT_PAGES;
const DO_PAGES = WANT_PAGES || !WANT_COMPONENTS;

const DRY_RUN = flag("--dry") || flag("--dry-run");
const FORCE = flag("--force");
const SCAFFOLD_ONLY = flag("--scaffold-only");
const LOG_TOKEN_USAGE = flag("--logTokenUsage");
const NO_VERIFY = flag("--no-verify");
/** Only targets with no .mdx at all — never rewrites a docs page that exists. */
const MISSING_ONLY = flag("--missing");
/** Comma-separated, matched case/punctuation-insensitively. */
const ONLY = (opt("--only") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2 — DOCS
// ═══════════════════════════════════════════════════════════════════════════

type Kind = "component" | "page";

interface DocTarget {
  kind: Kind;
  /** Display name, e.g. "Product Card". */
  name: string;
  /** File/identifier stem, e.g. "ProductCard". */
  identifier: string;
  dir: string;
  figmaUrl: string;
  figmaHash: string;
  storyTitle: string;
  /** Files already in the directory — the docs prompt reads these. */
  files: string[];
  /** A docs page exists on disk, whatever it was written from. */
  hasMdx: boolean;
  /** true when a .mdx exists and was written from the current hash. */
  upToDate: boolean;
}

/** Derive the identifier from the component .tsx actually on disk. */
function identifierFor(dir: string, fallback: string): string {
  const hit = listFiles(dir).find(
    (f) => /\.tsx$/i.test(f) && !/\.(stories|test)\.tsx$/i.test(f)
  );
  return hit ? hit.replace(/\.tsx$/i, "") : fallback;
}

function readStoryTitle(dir: string, identifier: string, fallback: string): string {
  try {
    const src = fs.readFileSync(path.join(dir, `${identifier}.stories.tsx`), "utf-8");
    return src.match(/title\s*:\s*['"`]([^'"`]+)['"`]/)?.[1] ?? fallback;
  } catch {
    return fallback;
  }
}

function collectTargets(): DocTarget[] {
  const out: DocTarget[] = [];
  const keys = new Set(ONLY.map(normId));
  const wanted = (name: string, id: string) =>
    keys.size === 0 || keys.has(normId(name)) || keys.has(normId(id));

  if (DO_COMPONENTS) {
    const file = readJSON<ComponentsVersionFile>(COMPONENTS_VERSION_FILE);
    for (const c of file?.components ?? []) {
      if (!c.targetDir || c.codeStatus === "readyToCreate") continue;
      const dir = path.join(ROOT_DIR, c.targetDir);
      if (!fs.existsSync(dir)) continue;
      const identifier = identifierFor(dir, c.name.replace(/[^A-Za-z0-9]/g, ""));
      if (!wanted(c.name, identifier)) continue;
      const hasMdx = fs.existsSync(path.join(dir, `${identifier}.mdx`));
      out.push({
        kind: "component",
        name: c.name,
        identifier,
        dir,
        figmaUrl: c.figmaUrl,
        figmaHash: c.figmaHash,
        storyTitle: readStoryTitle(dir, identifier, `Components/${identifier}`),
        files: listFiles(dir),
        hasMdx,
        upToDate: hasMdx && c.docsBuiltAgainstHash === c.figmaHash,
      });
    }
  }

  if (DO_PAGES) {
    const file = readJSON<PagesVersionFile>(PAGES_VERSION_FILE);
    for (const p of file?.pages ?? []) {
      if (!p.targetDir || p.codeStatus === "readyToCreate") continue;
      const dir = path.join(ROOT_DIR, p.targetDir);
      if (!fs.existsSync(dir)) continue;
      if (!wanted(p.name, p.identifier)) continue;
      const hasMdx = fs.existsSync(path.join(dir, `${p.identifier}.mdx`));
      out.push({
        kind: "page",
        name: p.name,
        identifier: p.identifier,
        dir,
        figmaUrl: p.figmaUrl,
        figmaHash: p.figmaHash,
        storyTitle: readStoryTitle(dir, p.identifier, `Pages/${p.identifier}`),
        files: listFiles(dir),
        hasMdx,
        upToDate: hasMdx && p.docsBuiltAgainstHash === p.figmaHash,
      });
    }
  }

  return out;
}

function buildDocsPrompt(t: DocTarget): string {
  const id = t.identifier;
  const isPage = t.kind === "page";
  return `Existing React + Vite + TypeScript + Storybook 10 project. You are writing DOCUMENTATION
only — do NOT change the component's behaviour, styles, props or stories.

============================================================
TASK — WRITE THE STORYBOOK DOCS PAGE: ${t.name}
============================================================
Create exactly one new file:  ${rel(t.dir)}/${id}.mdx
Touch nothing else. If ${id}.mdx already exists, rewrite it in full.

READ FIRST (these are the source of truth — do not invent anything they contradict):
${t.files.map((f) => `  - ${rel(t.dir)}/${f}`).join("\n")}
  - ${id}.tsx            the real props, states and behaviour
  - ${id}.stories.tsx    the exact story export names you must reference
  - ${id}.md             the authored notes: description, props, usage, assumptions
  - ${id}.module.scss    which tokens it actually consumes

Figma source: ${t.figmaUrl}

============================================================
FILE SHAPE — Storybook 10 MDX
============================================================
Start with exactly these imports and the Meta binding:

    import { Meta, Canvas, Controls, Story } from '@storybook/addon-docs/blocks';
    import * as ${id}Stories from './${id}.stories';

    <Meta of={${id}Stories} />

- \`<Meta of={...} />\` attaches this page to the "${t.storyTitle}" entry. Do NOT pass a
  \`title\` prop as well — that would create a second, orphaned sidebar entry.
- Reference stories ONLY by export names that really exist in ${id}.stories.tsx.
  Check the file; a wrong name is a build error, not a broken link.
- \`<Canvas of={${id}Stories.X} />\` renders a live, interactive example.
- \`<Controls />\` renders the props table automatically from the TypeScript types —
  write it once, under the main example. Do not hand-write a props table as well.

============================================================
CONTENT
============================================================
1. H1 = ${t.name}, then one or two sentences on what it is and when to use it.
2. A live primary example: <Canvas of={...} /> for the default/most representative story.
3. <Controls /> immediately after it.
4. ${
    isPage
      ? `SECTIONS — walk the page's major sections in order, saying which are composed from
   already-built components and which are bespoke. Note which components it reuses.`
      : `VARIANTS — one short subsection per variant axis (e.g. Type, State), each with its
   own <Canvas of={...} /> so every variant is visible on the page.`
  }
5. USAGE — a fenced \`\`\`tsx block showing a realistic import + JSX snippet. The import
   path must be the real relative path; the "@ -> src/" alias is NOT configured here.
6. ${
    isPage
      ? `RESPONSIVE — the breakpoints actually implemented and what changes at each.`
      : `RESPONSIVE — how it behaves below its design width, if anything changes.`
  }
7. ACCESSIBILITY — roles, aria attributes, keyboard interaction that the code really has.
8. ASSUMPTIONS — carry over anything recorded under "Assumptions" in ${id}.md. If there
   are none, omit the section rather than writing "none".

Keep it factual and short. Every claim must be checkable against the files above —
no aspirational features, no props that do not exist, no invented design rationale.

============================================================
VERIFY BEFORE FINISHING
Do NOT run tsc — .mdx is not type-checked, and this task changes no TypeScript.
Instead, re-read ${id}.stories.tsx and confirm that EVERY name you wrote as
\`${id}Stories.<Name>\` is actually exported there. A referenced export that does
not exist breaks the whole Storybook build, not just this page.
The full MDX is compiled once at the end of the run, after every page is written.`;
}

interface DocsOutcome {
  written: number;
  failed: number;
  skipped: number;
  upToDate: number;
  usage: UsageRow[];
}

async function runDocs(targets: DocTarget[]): Promise<DocsOutcome> {
  console.log("\n── Phase: docs ─────────────────────────────────────────────");
  const out: DocsOutcome = { written: 0, failed: 0, skipped: 0, upToDate: 0, usage: [] };

  // --missing never touches a page that exists, whatever hash it was written
  // from; otherwise the normal rule is "current hash, or rewrite".
  const todo = MISSING_ONLY
    ? targets.filter((t) => !t.hasMdx)
    : targets.filter((t) => FORCE || !t.upToDate);
  out.upToDate = targets.length - todo.length;

  if (todo.length === 0) {
    log(
      "✓ ",
      MISSING_ONLY
        ? `Every target already has a docs page (${targets.length} checked) — nothing to write.`
        : `Every docs page is current (${targets.length} target(s)) — nothing to write. ` +
            "Use --force to rewrite them."
    );
    return out;
  }

  log(
    "🚀",
    `${todo.length} docs page(s) queued${out.upToDate ? ` · ${out.upToDate} already current` : ""}` +
      `${DRY_RUN ? " — DRY RUN (prompts only)" : ""}`
  );
  for (const t of todo) console.log(`   - ${t.kind.padEnd(9)} ${t.name}  →  ${t.storyTitle}`);
  console.log();

  ensureDir(PROMPTS_DIR);

  // Component/page version files are rewritten as each docs page lands, so an
  // interrupted run never re-bills the pages it already wrote.
  const components = readJSON<ComponentsVersionFile>(COMPONENTS_VERSION_FILE);
  const pages = readJSON<PagesVersionFile>(PAGES_VERSION_FILE);

  for (let i = 0; i < todo.length; i++) {
    const t = todo[i];
    console.log("─".repeat(64));
    log(`[${i + 1}/${todo.length}]`, `${t.name} — docs`);

    const prompt = buildDocsPrompt(t);
    ensureDir(PROMPTS_DIR);
    const promptPath = path.join(PROMPTS_DIR, `docs-${t.identifier}.mdx.md`);
    fs.writeFileSync(promptPath, prompt, "utf-8");
    log("📝", `prompt → ${rel(promptPath)}`);

    if (DRY_RUN) {
      out.skipped++;
      continue;
    }

    log("🧠", `${t.name} → model ${CLAUDE_MODEL_DOCS}`);
    log("📖", `${t.name} — writing docs...`);
    const run = await runClaude(
      prompt,
      `${t.name} docs`,
      CLAUDE_MODEL_DOCS,
      CLAUDE_DOCS_TIMEOUT_MS
    );
    const mdxPath = path.join(t.dir, `${t.identifier}.mdx`);
    const success = run.code === 0 && fs.existsSync(mdxPath);
    out.usage.push({ label: t.name, mode: "create", ok: success, model: CLAUDE_MODEL_DOCS, run });

    if (!success) {
      out.failed++;
      log(
        "❌",
        run.code === 0
          ? `${t.name} — claude finished but ${rel(mdxPath)} was not written`
          : `${t.name} docs failed (exit ${run.code}) — prompt kept at ${rel(promptPath)}`
      );
      continue;
    }

    if (t.kind === "component" && components) {
      const entry = components.components.find((c) => normId(c.name) === normId(t.name));
      if (entry) entry.docsBuiltAgainstHash = t.figmaHash;
      writeJSON(COMPONENTS_VERSION_FILE, components);
    } else if (t.kind === "page" && pages) {
      const entry = pages.pages.find((p) => normId(p.identifier) === normId(t.identifier));
      if (entry) entry.docsBuiltAgainstHash = t.figmaHash;
      writeJSON(PAGES_VERSION_FILE, pages);
    }
    consumePrompt(promptPath);
    out.written++;
    log("✅", `${t.name} documented → ${rel(mdxPath)}`);
  }

  removeDirIfEmpty(PROMPTS_DIR); // only once the whole loop is done
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  console.log(
    `\n=== Script 5 · storybookDocs (${SCAFFOLD_ONLY ? "scaffold" : "scaffold → docs"}) ===`
  );
  if (DRY_RUN) log("🧪", "DRY RUN — no files written, no Claude calls");

  const targets = collectTargets();
  console.log("\n── Phase: scaffold ─────────────────────────────────────────");
  const scaffold = ensureStorybookSetup({ dry: DRY_RUN });

  if (SCAFFOLD_ONLY) {
    console.log("\n✅  Done (scaffold only).\n");
    if (scaffold.manual.length) process.exitCode = 1;
    return;
  }

  if (targets.length === 0) {
    log(
      "✓ ",
      ONLY.length > 0
        ? `Nothing matches --only=${ONLY.join(",")}`
        : "Nothing built yet to document — run componentPipeline / pagePipeline first."
    );
    return;
  }

  const docs = await runDocs(targets);
  reportUsage(docs.usage, "docs", "docs page", LOG_TOKEN_USAGE);

  let verified = true;
  if (docs.written > 0 && !DRY_RUN && !NO_VERIFY) {
    console.log("─".repeat(64));
    verified = await verifyStorybookBuild();
  }

  console.log("─".repeat(64));
  log(
    "📊",
    `done — ${docs.written} written · ${docs.failed} failed · ${docs.skipped} skipped · ` +
      `${docs.upToDate} already current`
  );
  if (docs.written > 0) {
    log("📚", "view it with:  npm run storybook");
  }
  if (docs.failed > 0 || scaffold.manual.length > 0 || !verified) process.exitCode = 1;
  console.log();
}

void main().catch((err) => {
  console.error("\n❌  storybookDocs failed:", (err as Error).message);
  process.exitCode = 1;
});
