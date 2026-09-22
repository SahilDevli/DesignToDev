/**
 * lib/git.ts — branch, commit, push and open a PR for generated work.
 *
 * Contract the pipelines rely on:
 *   - Nothing here runs unless the repo is in a fit state (real repo, a remote,
 *     a named branch). Every precondition failure is reported and skipped, never
 *     forced.
 *   - Files that were ALREADY dirty before the run are never staged. The dev's
 *     in-progress work is not ours to commit.
 *   - One branch and one PR per unit (component / page / the token sheet).
 *   - The run is atomic: if any unit fails the drift gate, NO branch and NO PR
 *     is created for any of them — everything is left in the working tree.
 *
 * End state of a successful flow: you are back on the base branch with a clean
 * tree, and each unit's work lives on its own pushed branch behind its own PR.
 *
 * PRs are opened with the GitHub CLI (`gh pr create`). If `gh` is missing or not
 * authenticated the branch is still pushed and the compare URL is printed, so no
 * work is ever lost to a missing tool.
 */

import { spawnSync } from "node:child_process";
import { ROOT_DIR } from "./env.js";
import { log } from "./io.js";

// ─── Shell ─────────────────────────────────────────────────────────────────

interface Run {
  ok: boolean;
  code: number;
  out: string;
  err: string;
}

function run(cmd: string, args: string[]): Run {
  const r = spawnSync(cmd, args, {
    cwd: ROOT_DIR,
    encoding: "utf-8",
    shell: process.platform === "win32",
  });
  return {
    ok: r.status === 0,
    code: r.status ?? 1,
    out: (r.stdout ?? "").trim(),
    err: (r.stderr ?? "").trim(),
  };
}

const git = (...args: string[]): Run => run("git", args);

// ─── Config ────────────────────────────────────────────────────────────────

export interface GitConfig {
  /** "" → whatever branch the run started on. */
  baseBranch: string;
  branchPrefix: string;
  remote: string;
  /** A unit whose worst drift reaches this percentage blocks the whole run. */
  maxDriftPercent: number;
  /**
   * Generated pipeline state. Excluded by default: it is one file per pipeline
   * that every unit touches, so including it would make every PR after the
   * first conflict with its siblings.
   */
  excludePaths: string[];
  draft: boolean;
}

export const defaultGitConfig = (): GitConfig => ({
  baseBranch: "",
  branchPrefix: "design",
  remote: "origin",
  maxDriftPercent: 20,
  excludePaths: ["scripts/DesignToDev/scriptData/"],
  draft: false,
});

export function loadGitConfig(raw: Partial<GitConfig> | undefined): GitConfig {
  const d = defaultGitConfig();
  const cfg: GitConfig = { ...d, ...(raw ?? {}) };
  if (!Number.isFinite(cfg.maxDriftPercent) || cfg.maxDriftPercent <= 0) {
    cfg.maxDriftPercent = d.maxDriftPercent;
  }
  if (!Array.isArray(cfg.excludePaths)) cfg.excludePaths = d.excludePaths;
  return cfg;
}

// ─── Preconditions ─────────────────────────────────────────────────────────

export interface RepoState {
  usable: boolean;
  reason?: string;
  baseBranch: string;
  hasGh: boolean;
}

export function inspectRepo(cfg: GitConfig): RepoState {
  const none = { usable: false, baseBranch: "", hasGh: false };

  if (!run("git", ["--version"]).ok) {
    return { ...none, reason: "git is not installed or not on PATH" };
  }
  if (!git("rev-parse", "--is-inside-work-tree").ok) {
    return { ...none, reason: `${ROOT_DIR} is not a git repository` };
  }
  const remotes = git("remote");
  if (!remotes.ok || !remotes.out.split(/\s+/).includes(cfg.remote)) {
    return {
      ...none,
      reason: `no git remote named "${cfg.remote}" — push and PR need one`,
    };
  }

  const head = git("rev-parse", "--abbrev-ref", "HEAD");
  const branch = cfg.baseBranch || head.out;
  if (!branch || branch === "HEAD") {
    return { ...none, reason: "HEAD is detached — check out a branch first" };
  }

  // gh is optional: without it we still push and print the compare URL.
  const hasGh = run("gh", ["--version"]).ok && run("gh", ["auth", "status"]).ok;
  return { usable: true, baseBranch: branch, hasGh };
}

// ─── Working-tree inspection ───────────────────────────────────────────────

/**
 * Repo-relative paths git currently reports as changed, including untracked.
 * Renames are reported as their destination path, which is what we want to stage.
 */
export function changedPaths(): Set<string> {
  const r = git("status", "--porcelain=v1", "-z", "--untracked-files=all");
  if (!r.ok) return new Set();
  const out = new Set<string>();
  // NUL-separated; a rename entry is "XY old\0new\0", so the code must consume
  // the extra field or every later path shifts by one.
  const parts = r.out.split("\0").filter((p) => p.length > 0);
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    const code = entry.slice(0, 2);
    const p = entry.slice(3);
    if (code[0] === "R" || code[1] === "R") {
      out.add(p);
      i++; // skip the rename's source path
      continue;
    }
    out.add(p);
  }
  return out;
}

const isExcluded = (p: string, cfg: GitConfig): boolean =>
  cfg.excludePaths.some((x) => p.replace(/\\/g, "/").startsWith(x.replace(/\\/g, "/")));

/**
 * Paths that appeared or changed between two snapshots, minus anything that was
 * already dirty before the run and anything configured as excluded.
 */
export function attributePaths(
  before: Set<string>,
  after: Set<string>,
  preexisting: Set<string>,
  cfg: GitConfig
): string[] {
  const out: string[] = [];
  for (const p of after) {
    if (before.has(p)) continue;
    if (preexisting.has(p)) continue;
    if (isExcluded(p, cfg)) continue;
    out.push(p);
  }
  return out.sort();
}

// ─── Branch / commit / push / PR ───────────────────────────────────────────

export const branchName = (cfg: GitConfig, kind: string, label: string): string => {
  const slug =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "change";
  const stamp = new Date().toISOString().slice(0, 10);
  return `${cfg.branchPrefix}/${kind}-${slug}-${stamp}`;
};

export interface PrUnit {
  /** "component" | "page" | "tokens" */
  kind: string;
  /** Display name — Button, Home Page, Design tokens. */
  label: string;
  /** Repo-relative paths this unit owns. */
  paths: string[];
  title: string;
  body: string;
}

export interface PrResult {
  label: string;
  branch: string;
  pushed: boolean;
  prUrl: string | null;
  reason?: string;
}

/** Derive a browser compare URL from the remote, for when gh is unavailable. */
function compareUrl(cfg: GitConfig, branch: string): string | null {
  const r = git("remote", "get-url", cfg.remote);
  if (!r.ok) return null;
  const m = r.out.match(/(?:git@|https:\/\/)([^:/]+)[:/](.+?)(?:\.git)?$/);
  if (!m) return null;
  return `https://${m[1]}/${m[2]}/compare/${branch}?expand=1`;
}

/**
 * Branch from base, stage only this unit's paths, commit, push, open a PR, then
 * return to base. The working tree keeps every OTHER unit's changes, so the
 * caller can repeat this for each unit in turn.
 */
function shipUnit(unit: PrUnit, cfg: GitConfig, state: RepoState): PrResult {
  const branch = branchName(cfg, unit.kind, unit.label);
  const res: PrResult = { label: unit.label, branch, pushed: false, prUrl: null };

  const created = git("switch", "-c", branch, state.baseBranch);
  if (!created.ok) {
    res.reason = `could not create branch: ${created.err || created.out}`;
    return res;
  }

  const staged = git("add", "--", ...unit.paths);
  if (!staged.ok) {
    res.reason = `could not stage files: ${staged.err}`;
    git("switch", state.baseBranch);
    git("branch", "-D", branch);
    return res;
  }

  // --only: commit exactly what we staged, never anything else in the tree.
  const committed = git("commit", "--only", "-m", unit.title, "-m", unit.body, "--", ...unit.paths);
  if (!committed.ok) {
    res.reason = `nothing committed: ${committed.out || committed.err}`;
    git("switch", state.baseBranch);
    git("branch", "-D", branch);
    return res;
  }

  const pushed = git("push", "-u", cfg.remote, branch);
  if (!pushed.ok) {
    res.reason = `push failed: ${pushed.err || pushed.out}`;
    git("switch", state.baseBranch);
    return res;
  }
  res.pushed = true;

  if (state.hasGh) {
    const args = [
      "pr",
      "create",
      "--base",
      state.baseBranch,
      "--head",
      branch,
      "--title",
      unit.title,
      "--body",
      unit.body,
    ];
    if (cfg.draft) args.push("--draft");
    const pr = run("gh", args);
    if (pr.ok) {
      res.prUrl = pr.out.split(/\s+/).find((t) => t.startsWith("http")) ?? pr.out;
    } else {
      res.reason = `branch pushed, but gh pr create failed: ${pr.err || pr.out}`;
      res.prUrl = compareUrl(cfg, branch);
    }
  } else {
    res.reason = "branch pushed; gh CLI unavailable, open the PR from this link";
    res.prUrl = compareUrl(cfg, branch);
  }

  git("switch", state.baseBranch);
  return res;
}

export interface FlowInput {
  units: PrUnit[];
  /** Units held back by the drift gate: label → worst mismatch ratio. */
  blocked: Array<{ label: string; worst: number }>;
  cfg: GitConfig;
}

/**
 * Run the whole git flow for one pipeline run.
 *
 * The drift gate is checked FIRST and applies to the entire run: a single unit
 * over the threshold stops every branch and PR, because a half-shipped design
 * sync is harder to reason about than none at all.
 */
export function runGitFlow(input: FlowInput): PrResult[] {
  const { units, blocked, cfg } = input;

  console.log("─".repeat(64));
  log("🔀", "git flow");

  if (units.length === 0) {
    log("✓ ", "nothing was created or edited — no branch, no PR");
    return [];
  }

  if (blocked.length > 0) {
    log(
      "🛑",
      `visual regression gate: ${blocked.length} unit(s) at or above ${cfg.maxDriftPercent}% drift — ` +
        "no branch and no PR for this run"
    );
    for (const b of blocked) {
      log("  •", `${b.label} — ${(b.worst * 100).toFixed(2)}% (limit ${cfg.maxDriftPercent}%)`);
    }
    log(
      "  ",
      "All changes are left in the working tree. Fix the drift, re-run, and the " +
        "flow will ship them."
    );
    return [];
  }

  const state = inspectRepo(cfg);
  if (!state.usable) {
    log("⚠️ ", `git flow skipped — ${state.reason}`);
    log("  ", "Your generated files are untouched in the working tree.");
    return [];
  }
  if (!state.hasGh) {
    log("⚠️ ", "gh CLI not available/authenticated — branches will push, PRs need a click");
  }
  log("🌿", `base branch "${state.baseBranch}" · ${units.length} branch(es) to raise`);

  const results: PrResult[] = [];
  for (const unit of units) {
    const r = shipUnit(unit, cfg, state);
    results.push(r);
    if (r.prUrl && !r.reason) log("✅", `${r.label} → ${r.prUrl}`);
    else if (r.pushed) log("⚠️ ", `${r.label} → ${r.branch} pushed · ${r.reason ?? ""} ${r.prUrl ?? ""}`);
    else log("❌", `${r.label} — ${r.reason}`);
  }

  return results;
}
