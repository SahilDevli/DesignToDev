/** lib/io.ts — logging, JSON state files, name normalisation, disk lookups. */

import fs from "node:fs";
import path from "node:path";
import { ROOT_DIR } from "./env.js";

export const log = (emoji: string, msg: string): void => console.log(`${emoji}  ${msg}`);
export const nowISO = (): string => new Date().toISOString();
export const rel = (p: string): string => path.relative(ROOT_DIR, p).replace(/\\/g, "/");
export const delay = (ms: number): Promise<void> =>
  new Promise<void>((r) => setTimeout(r, ms));

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function writeJSON(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export function readJSON<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

/** Case/space/punctuation-insensitive identity key: "nav bar" === "NavBar". */
export const normId = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** "Product Card" -> "ProductCard" — safe as a filename, dir and TS identifier. */
export const pascalId = (s: string, fallback = "Component"): string =>
  s
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("") || fallback;

/** "Type=Primary, State=Hover" -> "type-primary-state-hover" */
export const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "default";

export function fileMTime(p: string): string {
  try {
    return fs.statSync(p).mtime.toISOString();
  } catch {
    return nowISO();
  }
}

/** File names directly inside `dir`; [] when missing or unreadable. */
export function listFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter((f) => {
      try {
        return fs.statSync(path.join(dir, f)).isFile();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

/**
 * Find the directory that actually holds generated code for `name`: a folder
 * whose name matches (ignoring case and punctuation) and that contains a
 * matching `<Name>.tsx`. Used everywhere a lost build record must not cause a
 * needless — and billable — rebuild.
 */
export function findGeneratedDir(searchRoot: string, name: string): string | null {
  if (!fs.existsSync(searchRoot)) return null;
  const target = normId(name);
  const stack = [searchRoot];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const full = path.join(dir, e.name);
      if (normId(e.name) === target) {
        try {
          const hit = fs
            .readdirSync(full)
            .some((f) => /\.tsx$/i.test(f) && normId(f.replace(/\.tsx$/i, "")) === target);
          if (hit) return full;
        } catch {
          /* unreadable — keep looking */
        }
      }
      stack.push(full);
    }
  }
  return null;
}

/**
 * Drop a prompt file once its run succeeded — the file only exists so a FAILED
 * run leaves the exact prompt behind to inspect or re-feed.
 *
 * This deliberately does NOT remove the parent directory. It used to, and that
 * broke every multi-target run: the first success emptied the dir, the helper
 * deleted it, and writing the next target's prompt failed with ENOENT. Call
 * `removeDirIfEmpty` once the whole loop is finished instead.
 */
export function consumePrompt(promptPath: string): void {
  try {
    fs.unlinkSync(promptPath);
  } catch {
    /* ignore */
  }
}

/** Tidy a transient directory away, but only when nothing is left in it. */
export function removeDirIfEmpty(dir: string): void {
  try {
    if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  } catch {
    /* missing or non-empty — nothing to do */
  }
}
