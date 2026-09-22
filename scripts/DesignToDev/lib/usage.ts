/**
 * lib/usage.ts — token / cost accounting.
 *
 * The per-item table is always PRINTED; it costs nothing and is the thing you
 * actually read while a run is going. A file is only written when the run was
 * given `--logTokenUsage`, and then there is exactly ONE — scriptData/token-usage.json,
 * shared by every pipeline, with a section per kind so a page run never erases
 * what the component run recorded.
 */

import { TOKEN_USAGE_FILE } from "./env.js";
import { log, nowISO, readJSON, rel, writeJSON } from "./io.js";
import { runTotal, type RunResult } from "./claude.js";

export interface UsageRow {
  /** Component or page name. */
  label: string;
  mode: "create" | "update";
  ok: boolean;
  model: string;
  tier?: string;
  run: RunResult;
}

interface Totals {
  items: number;
  ok: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  costUsd: number;
  turns: number;
  durationMs: number;
}

interface Section {
  generatedAt: string;
  modelsUsed: string[];
  totals: Totals;
  items: Array<Record<string, unknown>>;
}

interface UsageFile {
  generatedAt: string;
  totals: Totals;
  runs: Record<string, Section>;
}

const fmtInt = (n: number): string => Math.round(n).toLocaleString("en-US");

const emptyTotals = (): Totals => ({
  items: 0,
  ok: 0,
  failed: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 0,
  costUsd: 0,
  turns: 0,
  durationMs: 0,
});

function addTotals(into: Totals, from: Totals): void {
  into.items += from.items;
  into.ok += from.ok;
  into.failed += from.failed;
  into.inputTokens += from.inputTokens;
  into.outputTokens += from.outputTokens;
  into.cacheReadTokens += from.cacheReadTokens;
  into.cacheWriteTokens += from.cacheWriteTokens;
  into.totalTokens += from.totalTokens;
  into.costUsd = Number((into.costUsd + from.costUsd).toFixed(4));
  into.turns += from.turns;
  into.durationMs += from.durationMs;
}

/**
 * @param sectionKey "components" | "pages" — the slot in token-usage.json
 * @param unit       word used in the printed heading, e.g. "component"
 * @param writeFile  true only when the run was given --logTokenUsage
 */
export function reportUsage(
  rows: UsageRow[],
  sectionKey: string,
  unit: string,
  writeFile: boolean
): void {
  if (rows.length === 0) return;

  console.log("─".repeat(64));
  log("🧮", `Token usage per ${unit}`);

  const totals = emptyTotals();
  totals.items = rows.length;
  totals.ok = rows.filter((r) => r.ok).length;
  totals.failed = rows.filter((r) => !r.ok).length;

  for (const { label, mode, ok, model, run } of rows) {
    totals.inputTokens += run.inputTokens;
    totals.outputTokens += run.outputTokens;
    totals.cacheReadTokens += run.cacheReadTokens;
    totals.cacheWriteTokens += run.cacheWriteTokens;
    totals.costUsd += run.costUsd;
    totals.turns += run.turns;
    totals.durationMs += run.durationMs;

    const tag = ok ? "" : run.usageAvailable ? " (failed)" : " (no usage)";
    console.log(
      `   ${`${label} · ${mode}`.padEnd(28)}` +
        ` in ${fmtInt(run.inputTokens).padStart(9)}` +
        `  out ${fmtInt(run.outputTokens).padStart(8)}` +
        `  cache r/w ${fmtInt(run.cacheReadTokens)}/${fmtInt(run.cacheWriteTokens)}` +
        `  Σ ${fmtInt(runTotal(run)).padStart(10)}` +
        `  $${run.costUsd.toFixed(4)}  ${model}${tag}`
    );
  }

  totals.totalTokens =
    totals.inputTokens + totals.outputTokens + totals.cacheReadTokens + totals.cacheWriteTokens;
  totals.costUsd = Number(totals.costUsd.toFixed(4));

  console.log("   " + "-".repeat(58));
  console.log(
    `   ${"TOTAL".padEnd(28)}` +
      ` in ${fmtInt(totals.inputTokens).padStart(9)}` +
      `  out ${fmtInt(totals.outputTokens).padStart(8)}` +
      `  cache r/w ${fmtInt(totals.cacheReadTokens)}/${fmtInt(totals.cacheWriteTokens)}` +
      `  Σ ${fmtInt(totals.totalTokens).padStart(10)}` +
      `  $${totals.costUsd.toFixed(4)}`
  );
  console.log(
    `   ${"".padEnd(28)} ${rows.length} run(s) · ${totals.turns} turns · ` +
      `${(totals.durationMs / 1000).toFixed(1)}s wall`
  );

  if (!writeFile) {
    log("ℹ️ ", "pass --logTokenUsage to also write this to scriptData/token-usage.json");
    return;
  }

  const section: Section = {
    generatedAt: nowISO(),
    modelsUsed: [...new Set(rows.map((r) => r.model))],
    totals,
    items: rows.map(({ label, mode, ok, model, tier, run }) => ({
      [unit]: label,
      mode,
      ok,
      model,
      ...(tier ? { tier } : {}),
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      cacheReadTokens: run.cacheReadTokens,
      cacheWriteTokens: run.cacheWriteTokens,
      totalTokens: runTotal(run),
      costUsd: Number(run.costUsd.toFixed(4)),
      turns: run.turns,
      durationMs: run.durationMs,
    })),
  };

  // Replace only this pipeline's section, so the file accumulates across runs.
  const prev = readJSON<UsageFile>(TOKEN_USAGE_FILE);
  const runs: Record<string, Section> = { ...(prev?.runs ?? {}) };
  runs[sectionKey] = section;
  const grand = emptyTotals();
  for (const s of Object.values(runs)) addTotals(grand, s.totals);
  writeJSON(TOKEN_USAGE_FILE, {
    generatedAt: nowISO(),
    totals: grand,
    runs,
  } satisfies UsageFile);
  log("💾", `token usage → ${rel(TOKEN_USAGE_FILE)}`);
}
