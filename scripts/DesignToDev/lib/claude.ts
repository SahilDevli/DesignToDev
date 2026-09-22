/**
 * lib/claude.ts — headless Claude CLI runner.
 *
 * `claude -p` prints nothing until the whole turn finishes, which reads exactly
 * like a hang. `--output-format stream-json --verbose` gives a live NDJSON feed
 * instead: Claude's own statements are echoed as they arrive, and the final
 * `result` event carries the token usage and cost this pipeline reports on.
 * tool_use blocks are deliberately NOT printed — they are noise at this level.
 */

import { spawn, spawnSync } from "node:child_process";
import { CLAUDE_BIN, CLAUDE_TIMEOUT_MS, ROOT_DIR } from "./env.js";
import { log } from "./io.js";

export interface RunResult {
  code: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  turns: number;
  durationMs: number;
  usageAvailable: boolean;
}

export const emptyRun = (): RunResult => ({
  code: 1,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costUsd: 0,
  turns: 0,
  durationMs: 0,
  usageAvailable: false,
});

export const runTotal = (r: RunResult): number =>
  r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens;

interface StreamEvent {
  type?: string;
  message?: { content?: Array<{ type?: string; text?: string }> };
  usage?: Record<string, number>;
  total_cost_usd?: number;
  num_turns?: number;
  duration_ms?: number;
  result?: unknown;
}

export function runClaude(
  prompt: string,
  label: string,
  model: string,
  timeoutMs: number = CLAUDE_TIMEOUT_MS
): Promise<RunResult> {
  return new Promise((resolve) => {
    const args = [
      "-p",
      "--permission-mode",
      "bypassPermissions",
      "--output-format",
      "stream-json",
      "--verbose",
    ];
    if (model) args.push("--model", model);

    log("✳", `${CLAUDE_BIN} -p …${model ? ` --model ${model}` : ""} (${label})`);

    const proc = spawn(CLAUDE_BIN, args, {
      cwd: ROOT_DIR,
      stdio: ["pipe", "pipe", "inherit"],
      shell: process.platform === "win32",
    });

    const result = emptyRun();
    let buf = "";

    const handleLine = (line: string): void => {
      const text = line.trim();
      if (!text) return;
      let ev: StreamEvent;
      try {
        ev = JSON.parse(text) as StreamEvent;
      } catch {
        return;
      }
      if (ev.type === "assistant" && ev.message?.content) {
        for (const b of ev.message.content) {
          if (b.type === "text" && b.text?.trim()) {
            process.stdout.write(`   ${b.text.trim()}\n`);
          }
        }
      } else if (ev.type === "result") {
        const u = ev.usage ?? {};
        result.inputTokens = u.input_tokens ?? 0;
        result.outputTokens = u.output_tokens ?? 0;
        result.cacheReadTokens = u.cache_read_input_tokens ?? 0;
        result.cacheWriteTokens = u.cache_creation_input_tokens ?? 0;
        result.costUsd = ev.total_cost_usd ?? 0;
        result.turns = ev.num_turns ?? 0;
        result.durationMs = ev.duration_ms ?? 0;
        result.usageAvailable = Boolean(ev.usage);
        if (typeof ev.result === "string" && ev.result.trim()) {
          process.stdout.write(`\n${ev.result.trim()}\n`);
        }
      }
    };

    proc.stdout?.setEncoding("utf-8");
    proc.stdout?.on("data", (chunk: string) => {
      buf += chunk;
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        handleLine(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
      }
    });

    let settled = false;
    const done = (code: number): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (buf.trim()) handleLine(buf);
      result.code = code;
      resolve(result);
    };

    const timer = setTimeout(() => {
      console.error(
        `\n⏱  Timeout after ${Math.round(timeoutMs / 60_000)}m — killing claude for ${label}`
      );
      // On Windows with shell:true, proc.kill() only stops the cmd wrapper.
      if (process.platform === "win32" && proc.pid) {
        spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        proc.kill("SIGKILL");
      }
      done(124);
    }, timeoutMs);

    proc.on("error", (err) => {
      console.error(`\n⚠️  Could not spawn "${CLAUDE_BIN}" (${err.message}).`);
      console.error("   Install the Claude CLI and put it on PATH, or set CLAUDE_BIN.");
      done(127);
    });
    proc.on("close", (code) => done(code ?? 1));

    proc.stdin?.write(prompt);
    proc.stdin?.end();
  });
}
