/**
 * lib/git.ts — branch, commit, push and open a PR for one unit of generated work.
 *
 * Contract the pipelines rely on:
 *   - Nothing here runs unless the repo is in a fit state (real repo, a remote,
 *     a named branch, a CLEAN working tree). Every precondition failure is
 *     reported and the whole run is aborted before anything is generated —
 *     never forced, never worked around.
 *   - One branch and one PR per unit (component / page / the token sheet),
 *     built and shipped in full before the next unit's branch is cut:
 *     branch off base → generate → commit everything → push → open the PR →
 *     back to base → repeat.
 *   - A unit that fails its own gate (build failure, drift over threshold) is
 *     abandoned on its own — its branch is discarded and the working tree is
 *     reset to base — it never blocks any other unit.
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
  // No shell: git/gh are real executables, and routing them through cmd.exe
  // on Windows re-tokenizes the argument array by whitespace — a multi-word
  // commit title/body would get shredded into bogus extra arguments.
  const r = spawnSync(cmd, args, {
    cwd: ROOT_DIR,
    encoding: "utf-8",
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
  /** A unit whose worst drift reaches this percentage is abandoned — no branch, no PR. */
  maxDriftPercent: number;
  draft: boolean;
}

export const defaultGitConfig = (): GitConfig => ({
  baseBranch: "",
  branchPrefix: "design",
  remote: "origin",
  maxDriftPercent: 20,
  draft: false,
});

export function loadGitConfig(raw: Partial<GitConfig> | undefined): GitConfig {
  const d = defaultGitConfig();
  const cfg: GitConfig = { ...d, ...(raw ?? {}) };
  if (!Number.isFinite(cfg.maxDriftPercent) || cfg.maxDriftPercent <= 0) {
    cfg.maxDriftPercent = d.maxDriftPercent;
  }
  return cfg;
}

// ─── Preconditions ─────────────────────────────────────────────────────────

export interface RepoState {
  usable: boolean;
  reason?: string;
  baseBranch: string;
  hasGh: boolean;
}

/**
 * Checks the repo is fit to branch from, requires a CLEAN working tree (so no
 * unit's `git add .` can ever sweep up unrelated work), and switches to the
 * base branch once so every unit starts from the same confirmed-clean spot.
 * Call this ONCE per run, before generating anything.
 */
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

  const status = git("status", "--porcelain");
  if (!status.ok) {
    return { ...none, reason: "could not read working-tree status" };
  }
  if (status.out.length > 0) {
    return {
      ...none,
      reason:
        "working tree is not clean — commit or stash your changes before running the pipeline",
    };
  }

  const switched = git("switch", branch);
  if (!switched.ok) {
    return { ...none, reason: `could not switch to base branch "${branch}": ${switched.err}` };
  }

  // gh is optional: without it we still push and print the compare URL.
  const hasGh = run("gh", ["--version"]).ok && run("gh", ["auth", "status"]).ok;
  return { usable: true, baseBranch: branch, hasGh };
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

export interface UnitBegin {
  branch: string;
  ok: boolean;
  reason?: string;
}

/** Branch off base for one unit. Call right before generating that unit's files. */
export function beginUnit(cfg: GitConfig, state: RepoState, kind: string, label: string): UnitBegin {
  const branch = branchName(cfg, kind, label);
  const created = git("switch", "-c", branch, state.baseBranch);
  if (!created.ok) {
    return { branch, ok: false, reason: `could not create branch: ${created.err || created.out}` };
  }
  return { branch, ok: true };
}

/**
 * A unit that failed its own gate (build failure, drift over threshold): throw
 * its branch and any generated files away, and land back on a clean base so
 * the next unit starts from the same confirmed-clean spot.
 */
export function abandonUnit(cfg: GitConfig, state: RepoState, branch: string): void {
  git("switch", state.baseBranch);
  git("branch", "-D", branch);
  git("checkout", "--", ".");
  git("clean", "-fd");
}

export interface UnitInfo {
  title: string;
  body: string;
}

export interface PrResult {
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
 * Stage and commit everything on the unit's current branch (there's nothing
 * else in the tree by construction — the unit was branched off a clean base),
 * push, open a PR, then return to base.
 */
export function shipUnit(cfg: GitConfig, state: RepoState, branch: string, unit: UnitInfo): PrResult {
  const res: PrResult = { branch, pushed: false, prUrl: null };

  const staged = git("add", ".");
  if (!staged.ok) {
    res.reason = `could not stage files: ${staged.err}`;
    abandonUnit(cfg, state, branch);
    return res;
  }

  const committed = git("commit", "-m", unit.title, "-m", unit.body);
  if (!committed.ok) {
    res.reason = `nothing committed: ${committed.out || committed.err}`;
    abandonUnit(cfg, state, branch);
    return res;
  }

  const pushed = git("push", "-u", cfg.remote, branch);
  if (!pushed.ok) {
    res.reason = `push failed: ${pushed.err || pushed.out}`;
    // The commit succeeded locally but never left this machine — not worth
    // keeping, and leaving it would carry these files onto base on switch.
    abandonUnit(cfg, state, branch);
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

/** Log a `shipUnit` result the same way for every caller. */
export function logShipResult(label: string, r: PrResult): void {
  if (r.prUrl && !r.reason) log("✅", `${label} → ${r.prUrl}`);
  else if (r.pushed) log("⚠️ ", `${label} → ${r.branch} pushed · ${r.reason ?? ""} ${r.prUrl ?? ""}`);
  else log("❌", `${label} — ${r.reason}`);
}
