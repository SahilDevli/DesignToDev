/**
 * designToken.ts — Script 1 of 5 : Figma variables → src/designToken.css
 * ---------------------------------------------------------------------------
 * Fetches the Figma file's local variables and regenerates the global CSS custom
 * properties every generated component and page styles against. Writes
 * scripts/scriptData/design-tokens.version.json, whose `updatedAt` only moves
 * when the tokens actually change.
 *
 * This is the only script that touches src/designToken.css.
 *
 * Usage:
 *   npm run designToken        # fetch + regenerate
 *   npm run designToken:dry    # report what would change, write nothing
 *
 * Env (.env at project root):
 *   FIGMA_TOKEN | FIGMA_PAT     (required)
 *   FIGMA_FILE_KEY | FILE_KEY   (required)
 *   FIGMA_API_BASE_URL          (optional, default https://api.figma.com/v1)
 */

import fs from "node:fs";
import path from "node:path";
import {
  API_BASE_URL,
  DESIGN_TOKEN_CSS_FILE,
  FIGMA_FILE_KEY,
  MAIN_ENTRY_FILE,
  ROOT_DIR,
  TOKENS_VERSION_FILE,
  requireFigmaEnv,
} from "./lib/env.js";
import { ensureDir, log, nowISO, readJSON, rel, writeJSON } from "./lib/io.js";
import { figmaGet } from "./lib/figma.js";
import {
  abandonUnit,
  beginUnit,
  inspectRepo,
  loadGitConfig,
  logShipResult,
  shipUnit,
  type GitConfig,
  type RepoState,
} from "./lib/git.js";

requireFigmaEnv();

const DRY_RUN = process.argv.includes("--dry") || process.argv.includes("--dry-run");
/** Skip branch/commit/push/PR — regenerate only, leave changes in the tree. */
const NO_PR = process.argv.includes("--no-pr");

const GIT_CFG: GitConfig = loadGitConfig(
  readJSON<{ git?: Partial<GitConfig> }>(path.join(ROOT_DIR, "package.json"))?.git
);

// ─── Figma variable shapes ─────────────────────────────────────────────────

interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}
interface VariableAlias {
  type: "VARIABLE_ALIAS";
  id: string;
}
type FigmaVariableValue = FigmaColor | VariableAlias | number | string | boolean;

interface FigmaVariable {
  id: string;
  name: string;
  resolvedType: "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";
  scopes?: string[];
  variableCollectionId: string;
  valuesByMode?: Record<string, FigmaVariableValue>;
}

interface FigmaVariableCollection {
  id: string;
  name: string;
  modes: Array<{ modeId: string; name?: string }>;
}

interface CSSEntry {
  cssName: string;
  cssValue: string;
  modeName: string;
}

interface TokensVersionFile {
  figmaVersion: string;
  updatedAt: string;
}

// ─── Categorisation ────────────────────────────────────────────────────────

const CSS_CATEGORIES = ["colors", "spacing", "radius", "typography", "shadows", "other"];

const UNITS_CONFIG: Record<string, string> = {
  default: "px",
  colors: "",
  spacing: "px",
  radius: "px",
  typography: "px",
  shadows: "px",
  other: "px",
};

const SCOPE_CATEGORY_MAP: Record<string, string> = {
  ALL_FILLS: "colors",
  STROKE_COLOR: "colors",
  TEXT_FILL: "colors",
  CORNER_RADIUS: "radius",
  GAP: "spacing",
  WIDTH_HEIGHT: "spacing",
  FONT_FAMILY: "typography",
  FONT_SIZE: "typography",
  FONT_WEIGHT: "typography",
  FONT_STYLE: "typography",
  LINE_HEIGHT: "typography",
  LETTER_SPACING: "typography",
  PARAGRAPH_SPACING: "typography",
  PARAGRAPH_INDENT: "typography",
  EFFECT_FLOAT: "shadows",
  STROKE_FLOAT: "other",
  OPACITY: "other",
};

function toKebabCase(value: string): string {
  return value
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-zA-Z0-9/-]/g, "")
    .replace(/\/+/g, "-")
    .toLowerCase();
}

function figmaColorToCSS(color: FigmaColor): string {
  if (!color || typeof color !== "object") return "transparent";
  const r = Math.round((color.r ?? 0) * 255);
  const g = Math.round((color.g ?? 0) * 255);
  const b = Math.round((color.b ?? 0) * 255);
  return `rgba(${r}, ${g}, ${b}, ${color.a ?? 1})`;
}

function isVariableAlias(value: unknown): value is VariableAlias {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as VariableAlias).type === "VARIABLE_ALIAS"
  );
}

const resolveUnit = (category: string): string =>
  UNITS_CONFIG[category] ?? UNITS_CONFIG.default ?? "px";

function convertTokenValue(
  value: FigmaVariableValue,
  resolvedType: string,
  category: string,
  variables: Record<string, FigmaVariable>
): string {
  if (isVariableAlias(value)) {
    const target = variables[value.id];
    if (target) return `var(--${toKebabCase(target.name)})`;
    console.warn(`   ⚠️  unresolved variable alias: ${value.id}`);
    return resolvedType === "COLOR" ? "transparent" : "initial";
  }
  if (resolvedType === "COLOR") return figmaColorToCSS(value as FigmaColor);
  if (resolvedType === "FLOAT")
    return typeof value === "number" ? `${value}${resolveUnit(category)}` : String(value);
  if (resolvedType === "STRING") return `"${String(value)}"`;
  if (resolvedType === "BOOLEAN") return value ? "true" : "false";
  return String(value);
}

function getTokenCategory(variable: FigmaVariable): string {
  for (const scope of variable.scopes ?? []) {
    if (Object.prototype.hasOwnProperty.call(SCOPE_CATEGORY_MAP, scope))
      return SCOPE_CATEGORY_MAP[scope];
  }
  if (variable.resolvedType === "COLOR") return "colors";
  const name = variable.name.toLowerCase();
  if (name.includes("color")) return "colors";
  if (name.includes("spacing") || name.startsWith("space/")) return "spacing";
  if (name.includes("radius")) return "radius";
  if (name.includes("font") || name.startsWith("typography/")) return "typography";
  if (name.includes("shadow") || name.startsWith("elevation/")) return "shadows";
  return "other";
}

// ─── CSS generation ────────────────────────────────────────────────────────

function generateCSS(
  variables: Record<string, FigmaVariable>,
  collections: Record<string, FigmaVariableCollection>
): string {
  const byCategory: Record<string, CSSEntry[]> = {};
  for (const cat of CSS_CATEGORIES) byCategory[cat] = [];

  for (const variable of Object.values(variables)) {
    let category = getTokenCategory(variable);
    if (!byCategory[category]) category = "other";

    const collection = collections[variable.variableCollectionId];
    if (!collection) {
      console.warn(`   ⚠️  no collection for "${variable.name}"`);
      continue;
    }

    for (const mode of collection.modes ?? []) {
      const value = variable.valuesByMode?.[mode.modeId];
      if (value === undefined) continue;
      byCategory[category].push({
        cssName: `--${toKebabCase(variable.name)}`,
        cssValue: convertTokenValue(value, variable.resolvedType, category, variables),
        modeName: mode.name ?? "Default",
      });
    }
  }

  // selector → category → entries. Default/Light is :root, every other mode is
  // a [data-theme="…"] block.
  const bySelector: Record<string, Record<string, CSSEntry[]>> = {};
  for (const category of CSS_CATEGORIES) {
    for (const entry of byCategory[category]) {
      const normalized = entry.modeName.toLowerCase().replace(/\s+/g, "-");
      const selector =
        normalized === "default" || normalized === "light"
          ? ":root"
          : `[data-theme="${normalized}"]`;
      ((bySelector[selector] ??= {})[category] ??= []).push(entry);
    }
  }

  const selectors = [
    ...(bySelector[":root"] ? [":root"] : []),
    ...Object.keys(bySelector)
      .filter((s) => s !== ":root")
      .sort(),
  ];

  let css =
    "/* src/designToken.css — auto-generated from Figma variables by scripts/designToken.ts.\n" +
    "   Do not edit by hand. Import once (e.g. in src/main.tsx) so the tokens are global. */\n";

  for (const selector of selectors) {
    const cats = bySelector[selector];
    css += `\n${selector} {\n`;
    let first = true;
    for (const category of CSS_CATEGORIES) {
      const entries = cats[category];
      if (!entries || entries.length === 0) continue;
      css += `${first ? "" : "\n"}  /* ${category} */\n`;
      first = false;
      const seen = new Set<string>();
      for (const e of entries) {
        if (seen.has(e.cssName)) continue;
        seen.add(e.cssName);
        css += `  ${e.cssName}: ${e.cssValue};\n`;
      }
    }
    css += "}\n";
  }

  return css;
}

/**
 * Guarantee `src/main.tsx` imports designToken.css. Without this, every
 * generated component's var(--token) resolves to nothing in the real app —
 * Storybook and the drift harness import the file directly so they never
 * catch it. Idempotent; a no-op once the import is present.
 */
function ensureGlobalImport(): boolean {
  const IMPORT_LINE = "import './designToken.css'";
  if (!fs.existsSync(MAIN_ENTRY_FILE)) {
    console.warn(`   ⚠️  ${rel(MAIN_ENTRY_FILE)} not found — import designToken.css there manually`);
    return false;
  }

  const src = fs.readFileSync(MAIN_ENTRY_FILE, "utf-8");
  if (/^\s*import\s+['"]\.\/designToken\.css['"]\s*;?\s*$/m.test(src)) return false;

  if (DRY_RUN) {
    log("🧪", `would add "${IMPORT_LINE}" to ${rel(MAIN_ENTRY_FILE)}`);
    return false;
  }

  // Insert after the last leading top-level `import ...` line, so it lands
  // with the rest of the entry point's imports rather than at either edge.
  const lines = src.split("\n");
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^import\s/.test(lines[i])) lastImportIdx = i;
    else if (lastImportIdx >= 0) break;
  }
  lines.splice(lastImportIdx + 1, 0, `${IMPORT_LINE};`);
  fs.writeFileSync(MAIN_ENTRY_FILE, lines.join("\n"), "utf-8");
  log("✅", `${rel(MAIN_ENTRY_FILE)} — added global designToken.css import`);
  return true;
}

/** Count added / removed / changed custom properties between two stylesheets. */
function diffTokens(before: string | null, after: string): string {
  const parse = (css: string | null): Map<string, string> => {
    const out = new Map<string, string>();
    for (const m of (css ?? "").matchAll(/^\s*(--[\w-]+)\s*:\s*(.+?);\s*$/gm)) {
      out.set(m[1], m[2]);
    }
    return out;
  };
  const a = parse(before);
  const b = parse(after);
  let added = 0;
  let changed = 0;
  for (const [k, v] of b) {
    if (!a.has(k)) added++;
    else if (a.get(k) !== v) changed++;
  }
  let removed = 0;
  for (const k of a.keys()) if (!b.has(k)) removed++;
  return `${added} added · ${changed} changed · ${removed} removed`;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("\n=== Script 1 · designToken (Figma variables → designToken.css) ===\n");
  if (DRY_RUN) log("🧪", "DRY RUN — nothing will be written");

  const fileMeta = await figmaGet<{ version?: string; name?: string }>(
    `${API_BASE_URL}/files/${FIGMA_FILE_KEY}?depth=1`
  );
  const figmaVersion = String(fileMeta?.version ?? "unknown");
  log("📄", `file "${fileMeta?.name ?? "unknown"}" — version ${figmaVersion}`);

  const varsRes = await figmaGet<{
    meta?: {
      variables?: Record<string, FigmaVariable>;
      variableCollections?: Record<string, FigmaVariableCollection>;
    };
  }>(`${API_BASE_URL}/files/${FIGMA_FILE_KEY}/variables/local`);

  const variables = varsRes.meta?.variables ?? {};
  const collections = varsRes.meta?.variableCollections ?? {};
  log(
    "✅",
    `${Object.keys(variables).length} variables in ${Object.keys(collections).length} collections`
  );

  // Branch off base before writing, so this run's edit lands directly on its
  // own branch. No branch in dry-run / --no-pr modes.
  let gitState: RepoState | null = null;
  let branch: string | null = null;
  if (!NO_PR && !DRY_RUN) {
    gitState = inspectRepo(GIT_CFG);
    if (!gitState.usable) {
      console.error(`❌  git flow unusable — ${gitState.reason}`);
      process.exitCode = 1;
      return;
    }
    if (!gitState.hasGh) {
      log("⚠️ ", "gh CLI not available/authenticated — branch will push, PR needs a click");
    }
    const begun = beginUnit(GIT_CFG, gitState, "tokens", "Design tokens");
    if (!begun.ok) {
      console.error(`❌  ${begun.reason}`);
      process.exitCode = 1;
      return;
    }
    branch = begun.branch;
  }

  const css = generateCSS(variables, collections);
  const prevCss = fs.existsSync(DESIGN_TOKEN_CSS_FILE)
    ? fs.readFileSync(DESIGN_TOKEN_CSS_FILE, "utf-8")
    : null;
  const prev = readJSON<TokensVersionFile>(TOKENS_VERSION_FILE);
  const changed = prevCss !== css;

  if (!changed) {
    log("✓ ", `${rel(DESIGN_TOKEN_CSS_FILE)} already up to date`);
  } else {
    log("🔀", `tokens changed — ${diffTokens(prevCss, css)}`);
    if (DRY_RUN) {
      log("🧪", `would rewrite ${rel(DESIGN_TOKEN_CSS_FILE)} (${css.split("\n").length} lines)`);
    } else {
      ensureDir(path.dirname(DESIGN_TOKEN_CSS_FILE));
      fs.writeFileSync(DESIGN_TOKEN_CSS_FILE, css, "utf-8");
      log("✅", `${rel(DESIGN_TOKEN_CSS_FILE)} regenerated`);
    }
  }

  ensureGlobalImport();

  if (DRY_RUN) {
    console.log("\n✅  Done (dry run).\n");
    return;
  }

  const updatedAt = changed || !prev ? nowISO() : prev.updatedAt;
  writeJSON(TOKENS_VERSION_FILE, { figmaVersion, updatedAt } satisfies TokensVersionFile);
  log("💾", `${rel(TOKENS_VERSION_FILE)} — updatedAt ${updatedAt}`);

  // Tokens have no visual-regression step, so there is no drift gate here —
  // only the "did anything actually change" rule.
  if (branch && gitState) {
    if (!changed) {
      log("✓ ", "nothing changed — abandoning empty branch, no PR");
      abandonUnit(GIT_CFG, gitState, branch);
    } else {
      const result = shipUnit(GIT_CFG, gitState, branch, {
        title: "feat(design-tokens): sync with Figma variables",
        body: [
          "Regenerated by the DesignToDev pipeline from the Figma file's local variables.",
          "",
          `**Figma file version:** \`${figmaVersion}\``,
          `**Change:** ${diffTokens(prevCss, css)}`,
          "",
          "Generated with [Claude Code](https://claude.com/claude-code)",
        ].join("\n"),
      });
      logShipResult("Design tokens", result);
    }
  }

  console.log("\n✅  Done.\n");
}

void main().catch((err) => {
  console.error("\n❌  designToken failed:", (err as Error).message);
  process.exitCode = 1;
});
