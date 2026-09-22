/**
 * lib/env.ts — one place for paths, .env values and tuneables.
 *
 * Importing this module never exits the process: a script that does not need
 * Figma credentials (a --dry run, a --report-only drift pass) must still be able
 * to load it. Call `requireFigmaEnv()` from the scripts that do need them.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);

/** …/scripts/DesignToDev */
export const PIPELINE_DIR = path.resolve(path.dirname(__filename), "..");
/** project root */
export const ROOT_DIR = path.resolve(PIPELINE_DIR, "..", "..");
/** PIPELINE_DIR relative to ROOT_DIR, forward slashes — for spawned commands. */
export const PIPELINE_REL = path.relative(ROOT_DIR, PIPELINE_DIR).replace(/\\/g, "/");

dotenv.config({ path: path.join(ROOT_DIR, ".env") });

// ─── Generated state ───────────────────────────────────────────────────────

export const SCRIPT_DATA_DIR = path.join(PIPELINE_DIR, "scriptData");

export const TOKENS_VERSION_FILE = path.join(SCRIPT_DATA_DIR, "design-tokens.version.json");
export const COMPONENTS_VERSION_FILE = path.join(SCRIPT_DATA_DIR, "components.version.json");
export const PAGES_VERSION_FILE = path.join(SCRIPT_DATA_DIR, "pages.version.json");

/** One transient dir for both component and page prompts; removed when empty. */
export const PROMPTS_DIR = path.join(SCRIPT_DATA_DIR, "prompts");

/** Written ONLY when a run is given --logTokenUsage. One file for all pipelines. */
export const TOKEN_USAGE_FILE = path.join(SCRIPT_DATA_DIR, "token-usage.json");

export const DRIFT_DIR = path.join(SCRIPT_DATA_DIR, "drift");
export const DRIFT_PROOF_DIR = path.join(DRIFT_DIR, "proof");
/** The HTML report carries its own machine-readable payload — there is no report.json. */
export const DRIFT_REPORT_HTML = path.join(DRIFT_DIR, "report.html");
export const DRIFT_REPORT_MD = path.join(DRIFT_DIR, "report.md");

// ─── Generated source ──────────────────────────────────────────────────────

export const DESIGN_TOKEN_CSS_FILE = path.join(ROOT_DIR, "src", "designToken.css");
export const COMPONENTS_SRC_DIR = path.join(ROOT_DIR, "src", "components");
export const PAGES_SRC_DIR = path.join(ROOT_DIR, "src", "pages");
/** The app's real entry point — designToken.css must be imported here or every
 *  var(--token) in every generated component silently resolves to nothing. */
export const MAIN_ENTRY_FILE = path.join(ROOT_DIR, "src", "main.tsx");

// ─── Storybook ─────────────────────────────────────────────────────────────

export const STORYBOOK_DIR = path.join(ROOT_DIR, ".storybook");
export const STORYBOOK_MAIN = path.join(STORYBOOK_DIR, "main.ts");
export const STORYBOOK_PREVIEW = path.join(STORYBOOK_DIR, "preview.ts");
/** Landing page for the docs site; written once, never overwritten. */
export const STORYBOOK_OVERVIEW = path.join(ROOT_DIR, "src", "Overview.mdx");

/** ROOT_DIR-relative, forward slashes — Vite serves the harness from here. */
export const HARNESS_HTML = `${PIPELINE_REL}/drift-harness/index.html`;

// ─── Figma ─────────────────────────────────────────────────────────────────

export const FIGMA_TOKEN = (process.env.FIGMA_TOKEN || process.env.FIGMA_PAT || "").trim();
export const FIGMA_FILE_KEY = (process.env.FIGMA_FILE_KEY || "").trim();
export const FIGMA_URL = (process.env.FIGMA_URL || "").trim();
export const API_BASE_URL = (process.env.FIGMA_API_BASE_URL || "https://api.figma.com/v1" ).trim();

/**
 * Canvas(es) holding page-level designs. componentPipeline SKIPS these (or a
 * whole page would be generated into src/components/) and pagePipeline READS
 * them — one setting, so the two can never disagree.
 */
export const PAGES_CANVAS = (process.env.FIGMA_PAGES_CANVAS || "Frames").trim();

export function requireFigmaEnv(): void {
  if (!FIGMA_TOKEN) {
    console.error("❌  Missing FIGMA_TOKEN / FIGMA_PAT in .env");
    process.exit(1);
  }
  if (!FIGMA_FILE_KEY) {
    console.error("❌  Missing FIGMA_FILE_KEY / FILE_KEY in .env");
    process.exit(1);
  }
}

// ─── Claude CLI ────────────────────────────────────────────────────────────

export const CLAUDE_BIN = process.env.CLAUDE_BIN || (process.platform === "win32" ? "claude.cmd" : "claude");
/** Set → forces ONE model everywhere, overriding the tiers below. */
export const CLAUDE_MODEL = (process.env.CLAUDE_MODEL || "").trim();
export const CLAUDE_MODEL_ATOMIC = (process.env.CLAUDE_MODEL_ATOMIC || "claude-sonnet-5").trim();
export const CLAUDE_MODEL_COMPOSITE = (process.env.CLAUDE_MODEL_COMPOSITE || "claude-opus-5").trim();
export const CLAUDE_MODEL_PAGE = (process.env.CLAUDE_MODEL_PAGE || "claude-opus-5").trim();
/** Docs are prose over code that already exists — the small model handles it. */
export const CLAUDE_MODEL_DOCS = (process.env.CLAUDE_MODEL_DOCS || "claude-sonnet-5").trim();
export const CLAUDE_DOCS_TIMEOUT_MS = Number(process.env.CLAUDE_DOCS_TIMEOUT_MS || 15 * 60_000);
export const CLAUDE_TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MS || 30 * 60_000);
export const CLAUDE_PAGE_TIMEOUT_MS = Number(process.env.CLAUDE_PAGE_TIMEOUT_MS || 45 * 60_000);