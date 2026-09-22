/**
 * lib/storybook.ts — the Storybook documentation surface, shared by every script
 * that writes into it.
 *
 * Three things live here because three scripts need them:
 *
 *   ensureStorybookSetup()   make Storybook able to SHOW docs at all — the docs
 *                            addon, viewports matching the Figma breakpoints,
 *                            sidebar order, a landing page. Deterministic, no
 *                            Claude, idempotent, and safe to call on every run.
 *                            componentPipeline and pagePipeline call it BEFORE
 *                            they build anything, so the first generated .mdx
 *                            already has somewhere to render.
 *
 *   MDX_RULES                the file-shape contract for a Storybook 10 .mdx.
 *                            The build prompts embed it so the docs page is
 *                            authored in the SAME Claude turn as the component —
 *                            that turn already has the props, the story names and
 *                            the design in context, so the page costs nothing
 *                            extra and cannot describe a prop that isn't there.
 *
 *   verifyStorybookBuild()   compile the whole site once, at the end of a run.
 *                            This cannot be done per component: one bad story
 *                            reference breaks the ENTIRE build, and while a
 *                            component is being written the other pages do not
 *                            exist yet.
 *
 * Scaffolding patches the existing config in place and never overwrites your
 * edits — each change is marker-guarded, and anything it cannot do safely is
 * reported for you to do by hand instead of being forced.
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  ROOT_DIR,
  STORYBOOK_DIR,
  STORYBOOK_MAIN,
  STORYBOOK_OVERVIEW,
  STORYBOOK_PREVIEW,
} from "./env.js";
import { ensureDir, log, nowISO, rel } from "./io.js";
import { BREAKPOINTS } from "./screens.js";

/** Stamped into generated config so a re-run recognises its own work. */
const MARKER = "DesignToDev";

// ═══════════════════════════════════════════════════════════════════════════
// SCAFFOLD — deterministic, no Claude, idempotent
// ═══════════════════════════════════════════════════════════════════════════

export interface ScaffoldResult {
  changed: string[];
  manual: string[];
}

/**
 * Add the docs addon to .storybook/main.ts.
 *
 * MDX does not render at all without it — this is the one edit that cannot be
 * skipped. The existing file is patched in place rather than rewritten, so any
 * hand configuration survives; if `addons` cannot be found the file is left
 * alone and the change is reported for you to make.
 */
function patchMain(res: ScaffoldResult): void {
  const src = fs.readFileSync(STORYBOOK_MAIN, "utf-8");
  if (src.includes("@storybook/addon-docs")) return;

  const m = src.match(/addons\s*:\s*\[([\s\S]*?)\]/);
  if (!m) {
    res.manual.push(
      `${rel(STORYBOOK_MAIN)} — add '@storybook/addon-docs' to the addons array (MDX will not render without it)`
    );
    return;
  }
  const inner = m[1].trim();
  const entry = `'@storybook/addon-docs'`;
  const replacement = inner
    ? `addons: [\n    ${entry}, /* ${MARKER} */\n    ${inner.replace(/^\s+/gm, "    ").trim()}\n  ]`
    : `addons: [${entry} /* ${MARKER} */]`;
  fs.writeFileSync(STORYBOOK_MAIN, src.replace(m[0], replacement), "utf-8");
  res.changed.push(`${rel(STORYBOOK_MAIN)} — enabled @storybook/addon-docs`);
}

/**
 * Add viewports and sidebar order to .storybook/preview.ts.
 *
 * The page prompt tells Claude to set `parameters.viewport` per designed
 * breakpoint; without these definitions those names resolve to nothing. The
 * widths are the same BREAKPOINTS the pipelines reason about, so a story named
 * "desktop" renders at the width the design was drawn at.
 */
function patchPreview(res: ScaffoldResult): void {
  const src = fs.readFileSync(STORYBOOK_PREVIEW, "utf-8");
  if (src.includes(MARKER)) return;

  const viewports = BREAKPOINTS.map(
    (b) =>
      `        ${b.name}: {\n` +
      `          name: '${b.name} (${b.ref}px)',\n` +
      `          styles: { width: '${b.ref}px', height: '900px' },\n` +
      `          type: '${b.ref < 768 ? "mobile" : b.ref < 1024 ? "tablet" : "desktop"}',\n` +
      `        },`
  ).join("\n");

  const block =
    `    /* ${MARKER} — widths match the Figma breakpoints the pipelines use */\n` +
    `    viewport: {\n      options: {\n${viewports}\n      },\n    },\n` +
    `    options: {\n` +
    `      storySort: { order: ['Overview', 'Atoms', 'Components', 'Pages'] },\n` +
    `    },\n`;

  const m = src.match(/parameters\s*:\s*\{/);
  if (!m || m.index === undefined) {
    res.manual.push(`${rel(STORYBOOK_PREVIEW)} — could not find a "parameters:" object to extend`);
    return;
  }
  const at = m.index + m[0].length;
  const out = `${src.slice(0, at)}\n${block}${src.slice(at)}`;
  fs.writeFileSync(STORYBOOK_PREVIEW, out, "utf-8");
  res.changed.push(`${rel(STORYBOOK_PREVIEW)} — added Figma breakpoint viewports + sidebar order`);
}

/** Landing page. Written once — never overwritten, it is yours to edit after. */
function writeOverview(res: ScaffoldResult): void {
  if (fs.existsSync(STORYBOOK_OVERVIEW)) return;
  const body = `import { Meta } from '@storybook/addon-docs/blocks';

<Meta title="Overview" />

# Design System

Every component and page here is generated from Figma by the DesignToDev pipeline
(\`scripts/DesignToDev/\`) and proved against the design with pixel diffing.

- **Atoms** — the primitives: Button, Input, and friends.
- **Components** — composites built from atoms.
- **Pages** — full screens, composed from the above.

## How a change reaches this site

1. \`npm run designToken\` — Figma variables become CSS custom properties.
2. \`npm run componentPipeline\` — hashes the Figma file, builds what changed,
   and writes each component's docs page in the same turn.
3. \`npm run pagePipeline\` — the same, for page-level designs.
4. \`npm run driftDetection\` — renders each story and diffs it against the Figma frame.
5. \`npm run storybookDocs\` — backfills docs for anything built before this step existed.

Nothing is rebuilt unless its Figma content hash moved, so a no-op run is free.

<div style={{ opacity: 0.6, fontSize: 13, marginTop: 32 }}>
  First generated ${nowISO().slice(0, 10)}
</div>
`;
  ensureDir(path.dirname(STORYBOOK_OVERVIEW));
  fs.writeFileSync(STORYBOOK_OVERVIEW, body, "utf-8");
  res.changed.push(`${rel(STORYBOOK_OVERVIEW)} — docs landing page`);
}

/**
 * Make sure Storybook can render documentation. Safe to call on every run: on an
 * already-configured project it reports "nothing to scaffold" and touches
 * nothing.
 *
 * `quiet` keeps a no-op silent — the build pipelines call this on every run and
 * a line saying nothing happened is noise there.
 */
export function ensureStorybookSetup(
  opts: { dry?: boolean; quiet?: boolean } = {}
): ScaffoldResult {
  const { dry = false, quiet = false } = opts;
  const res: ScaffoldResult = { changed: [], manual: [] };

  if (!fs.existsSync(STORYBOOK_DIR)) {
    res.manual.push(`${rel(STORYBOOK_DIR)} does not exist — run \`npx storybook@latest init\` first`);
  } else if (dry) {
    // Report intent without touching anything.
    const main = fs.readFileSync(STORYBOOK_MAIN, "utf-8");
    const preview = fs.readFileSync(STORYBOOK_PREVIEW, "utf-8");
    if (!main.includes("@storybook/addon-docs"))
      res.changed.push(`${rel(STORYBOOK_MAIN)} — would enable @storybook/addon-docs`);
    if (!preview.includes(MARKER))
      res.changed.push(`${rel(STORYBOOK_PREVIEW)} — would add breakpoint viewports`);
    if (!fs.existsSync(STORYBOOK_OVERVIEW))
      res.changed.push(`${rel(STORYBOOK_OVERVIEW)} — would write the landing page`);
  } else {
    patchMain(res);
    patchPreview(res);
    writeOverview(res);
  }

  if (res.changed.length === 0 && res.manual.length === 0) {
    if (!quiet) log("✓ ", "Storybook already set up for docs — nothing to scaffold");
  } else {
    for (const c of res.changed) log(dry ? "🧪" : "✅", c);
    for (const m of res.manual) log("⚠️ ", `needs a manual edit: ${m}`);
  }
  return res;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT FRAGMENT — the .mdx contract, embedded in the BUILD prompts
// ═══════════════════════════════════════════════════════════════════════════

/**
 * What a generated `<Id>.mdx` must look like.
 *
 * This is written by the same Claude turn that builds the component, which is
 * the whole point: that turn already knows the props it just declared, the story
 * exports it just wrote and the design it just read, so the docs page is free
 * and cannot drift from the code. A separate docs pass had to re-read all of it
 * and pay for the privilege.
 */
export const MDX_RULES = (id: string, isPage: boolean): string => `MDX — the Storybook documentation page (${id}.mdx)
Write it LAST, once the component, stories and ${id}.md are final, so it describes
what you actually built.

Start with exactly these imports and the Meta binding:

    import { Meta, Canvas, Controls } from '@storybook/addon-docs/blocks';
    import * as ${id}Stories from './${id}.stories';

    <Meta of={${id}Stories} />

- \`<Meta of={...} />\` attaches this page to the stories file's own sidebar entry.
  Do NOT pass a \`title\` prop as well — that creates a second, orphaned entry.
- Reference stories ONLY by export names that really exist in ${id}.stories.tsx.
  A wrong name breaks the ENTIRE Storybook build, not just this page — re-read the
  stories file and check every one before you finish.
- \`<Canvas of={${id}Stories.X} />\` renders a live, interactive example.
- \`<Controls />\` renders the props table automatically from the TypeScript types.
  Write it once, under the main example — do not hand-write a props table as well.

Content, in this order:
1. H1 = the display name, then one or two sentences on what it is and when to use it.
2. The primary example: <Canvas of={...} /> for the default/most representative story.
3. <Controls /> immediately after it.
4. ${
  isPage
    ? `SECTIONS — walk the page's major sections in order, saying which are composed
   from already-built components and which are bespoke.`
    : `VARIANTS — one short subsection per variant axis (e.g. Type, State), each with
   its own <Canvas of={...} /> so every variant is visible on the page.`
}
5. USAGE — a fenced \`\`\`tsx block with a realistic import + JSX snippet. The import
   path must be the real relative path; the "@ -> src/" alias is NOT configured here.
6. RESPONSIVE — ${
  isPage
    ? "the breakpoints actually implemented and what changes at each."
    : "how it behaves below its design width, if anything changes."
}
7. ACCESSIBILITY — roles, aria attributes and keyboard interaction the code really has.
8. ASSUMPTIONS — carry over anything you recorded under "Assumptions" in ${id}.md.
   Omit the section entirely if there are none.

Keep it factual and short. Every claim must be checkable against the files you
wrote — no aspirational features, no props that do not exist.
Do not run tsc for the .mdx: it is not type-checked. The whole site is compiled
once at the end of the pipeline run.`;

// ═══════════════════════════════════════════════════════════════════════════
// VERIFY — compile every generated .mdx, once
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A malformed .mdx — a story export that does not exist, a bad blocks import —
 * breaks the ENTIRE Storybook build, not just its own page. Nothing can check
 * that while a single component is being written, so the build runs once here,
 * after everything in the run has landed.
 */
export async function verifyStorybookBuild(): Promise<boolean> {
  log("🏗 ", "compiling Storybook to verify every generated .mdx…");
  const code = await new Promise<number>((resolve) => {
    const proc = spawn("npm", ["run", "build-storybook", "--", "--quiet"], {
      cwd: ROOT_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    let tail = "";
    const keep = (chunk: unknown): void => {
      tail = (tail + String(chunk)).slice(-4000);
    };
    proc.stdout?.on("data", keep);
    proc.stderr?.on("data", keep);
    proc.on("error", () => resolve(127));
    proc.on("close", (c) => {
      if (c !== 0) console.error(tail);
      resolve(c ?? 1);
    });
  });
  if (code === 0) {
    log("✅", "Storybook builds — all docs pages compile");
    fs.rmSync(path.join(ROOT_DIR, "storybook-static"), { recursive: true, force: true });
    return true;
  }
  log("❌", `Storybook build failed (exit ${code}) — a generated .mdx is invalid (output above)`);
  return false;
}
