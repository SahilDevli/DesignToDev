/**
 * driftDetection.ts — Script 4 of 5 : does the code still look like the design?
 * ---------------------------------------------------------------------------
 * Renders every generated component variant and page from its own *.stories.tsx
 * in headless Chromium, pulls the matching frame from the Figma images API, and
 * diffs the two with pixelmatch. Writes one rolling report — report.html and
 * report.md — plus the raw expected/actual/diff PNGs, under scriptData/drift/.
 *
 * There is no report.json: report.html embeds its own result rows as an inert
 * <script type="application/json"> block, which is what a later --merge run and
 * the two build pipelines read back. One artefact, not two.
 *
 * It never mutates a version file — it only reports.
 *
 * LAYOUT WIDTH — why this used to lie
 *   The harness root used to be `display:inline-block` in a fixed 1400px viewport,
 *   which is shrink-to-fit. Any component sized from its container (width:100%,
 *   flex:1, max-width) therefore collapsed to its CONTENT width instead of the
 *   Figma frame width, and the whole comparison became noise: Card's three
 *   variants rendered at 135/200/300px against one 324px Figma frame, Footer at
 *   1111px against 1440px.
 *   Now every item is laid out at the width Figma actually draws it:
 *     component  root width = the variant's frame width;
 *                viewport   = max(frame width, 1440) so a 94px Button is still
 *                             evaluated as a DESKTOP button and mobile media
 *                             queries do not fire on it
 *     page       root width = 100%;
 *                viewport   = the page's own design width — a page IS a screen,
 *                             so its media queries must run at that width
 *   Baselines are requested with use_absolute_bounds so a drop shadow cannot
 *   inflate the expected PNG past the box the DOM element occupies.
 *
 * Usage:
 *   npm run driftDetection                 components + pages
 *   npm run driftDetection:components
 *   npm run driftDetection:pages
 *   npm run driftDetection:dry             list what would be compared, no work
 *   npx tsx scripts/driftDetection.ts --only=Button --merge
 *   npx tsx scripts/driftDetection.ts --report-only    # recompute from cached PNGs
 *
 * `--merge` keeps the rows already in the report for targets this run did not
 * check, so the pipelines can prove one component at a time and still end up
 * with a single cumulative report. The exit code only ever reflects this run.
 *
 * First run needs the browser binary:  npx playwright install chromium
 *
 * Config: the "drift" key of package.json
 *   { scale, pageScale, threshold, pageThreshold, pagesFailBuild,
 *     diffColorThreshold, useAbsoluteBounds, fontCss, components: { <name>: { threshold } } }
 */

import fs from "node:fs";
import path from "node:path";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium, type Browser, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

import {
  COMPONENTS_VERSION_FILE,
  DRIFT_DIR,
  DRIFT_PROOF_DIR,
  DRIFT_REPORT_HTML,
  DRIFT_REPORT_MD,
  FIGMA_FILE_KEY as ENV_FILE_KEY,
  FIGMA_TOKEN,
  HARNESS_HTML,
  PAGES_VERSION_FILE,
  ROOT_DIR,
} from "./lib/env.js";
import { ensureDir, log, normId, nowISO, readJSON, rel, slug } from "./lib/io.js";
import { embedPayload, readPayload } from "./lib/driftReport.js";
import { downloadBuffer, fetchImageUrls, fetchNodeBoxes } from "./lib/figma.js";
import { DESKTOP_VIEWPORT } from "./lib/screens.js";
import type { ComponentsVersionFile, PagesVersionFile } from "./lib/types.js";

// ─── Flags ─────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const opt = (n: string) => argv.find((a) => a.startsWith(`${n}=`))?.slice(n.length + 1);

const WANT_COMPONENTS = flag("--components");
const WANT_PAGES = flag("--pages");
/** Neither named → check both. */
const DO_COMPONENTS = WANT_COMPONENTS || !WANT_PAGES;
const DO_PAGES = WANT_PAGES || !WANT_COMPONENTS;

const DRY_RUN = flag("--dry") || flag("--dry-run");
const REPORT_ONLY = flag("--report-only");
const FAIL_ON_MISSING = flag("--fail-on-missing");
const MERGE = flag("--merge");
const ONLY = (opt("--only") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const CLI_SCALE = opt("--scale") ? Number(opt("--scale")) : undefined;
const CLI_THRESHOLD = opt("--threshold") ? Number(opt("--threshold")) : undefined;

let FIGMA_FILE_KEY = ENV_FILE_KEY;

// ─── Config ────────────────────────────────────────────────────────────────

interface DriftConfig {
  scale: number;
  pageScale: number;
  threshold: number;
  pageThreshold: number;
  pagesFailBuild: boolean;
  diffColorThreshold: number;
  useAbsoluteBounds: boolean;
  fontCss: string;
  components: Record<string, { threshold?: number }>;
}

/**
 * Thresholds are mismatch RATIOS (0.01 = 1%). A ratio above 1 can never be
 * exceeded, so a value > 1 is read as a percentage instead — `10` means 10%, not
 * 1000%. Keeps a hand-written config from silently disabling the whole gate.
 */
function normalizeThreshold(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value < 0) return fallback;
  return value > 1 ? value / 100 : value;
}

function loadConfig(): DriftConfig {
  const pkg = readJSON<Record<string, Partial<DriftConfig>>>(path.join(ROOT_DIR, "package.json"));
  const raw = pkg?.drift ?? pkg?.pixelproof ?? {};
  const cfg: DriftConfig = {
    scale: CLI_SCALE ?? raw.scale ?? 2,
    // Pages are whole screens; 1× keeps a 1440×5000 diff out of gigabyte territory.
    pageScale: raw.pageScale ?? 1,
    threshold: normalizeThreshold(CLI_THRESHOLD ?? raw.threshold ?? 0.005, 0.005),
    pageThreshold: normalizeThreshold(raw.pageThreshold ?? 0.25, 0.25),
    pagesFailBuild: raw.pagesFailBuild ?? false,
    diffColorThreshold: raw.diffColorThreshold ?? 0.1,
    useAbsoluteBounds: raw.useAbsoluteBounds ?? true,
    fontCss: (raw.fontCss ?? "").trim(),
    components: raw.components ?? {},
  };
  if (!Number.isFinite(cfg.scale) || cfg.scale < 1 || cfg.scale > 4) cfg.scale = 2;
  if (!Number.isFinite(cfg.pageScale) || cfg.pageScale < 1 || cfg.pageScale > 4) cfg.pageScale = 1;
  // pixelmatch's per-pixel colour tolerance is 0..1 — a larger value makes every
  // pixel "equal" and the diff meaningless.
  if (
    !Number.isFinite(cfg.diffColorThreshold) ||
    cfg.diffColorThreshold < 0 ||
    cfg.diffColorThreshold > 1
  ) {
    cfg.diffColorThreshold = 0.1;
  }
  return cfg;
}

const cfg = loadConfig();

// ─── Work model ────────────────────────────────────────────────────────────

type Kind = "component" | "page";
type ResultStatus = "pass" | "fail" | "no-story" | "errored";

interface WorkItem {
  kind: Kind;
  /** Component name, or page identifier. */
  target: string;
  /** Variant name, or breakpoint label for a page. */
  variant: string;
  nodeId: string;
  props: Record<string, string>;
  designWidth: number;
  designHeight: number;
  /**
   * This design IS a screen size, so its media queries must be evaluated at its
   * own width — true for pages, and for a component set whose variants are drawn
   * at different widths ("Footer-Desktop" 1440 / "Footer-Laptop" 1024).
   */
  screenScoped: boolean;
  threshold: number;
}

interface DriftResult {
  kind: Kind;
  target: string;
  variant: string;
  nodeId: string;
  story: string | null;
  status: ResultStatus;
  threshold: number;
  designWidth: number;
  viewportWidth: number;
  mismatchRatio: number;
  mismatchPixels: number;
  comparedSize: { w: number; h: number } | null;
  expectedSize: { w: number; h: number } | null;
  actualSize: { w: number; h: number } | null;
  images: { expected: string | null; actual: string | null; diff: string | null };
  notes: string[];
}

interface RegistryEntry {
  id: string;
  title: string;
  args: Record<string, unknown>;
}

const wanted = new Set(ONLY.map(normId));
const isWanted = (name: string) => wanted.size === 0 || wanted.has(normId(name));

function thresholdFor(kind: Kind, name: string): number {
  if (kind === "page") return cfg.pageThreshold;
  const own = cfg.components[name]?.threshold;
  return own === undefined ? cfg.threshold : normalizeThreshold(own, cfg.threshold);
}

function buildWorkList(): WorkItem[] {
  const items: WorkItem[] = [];

  if (DO_COMPONENTS) {
    const file = readJSON<ComponentsVersionFile>(COMPONENTS_VERSION_FILE);
    for (const c of file?.components ?? []) {
      if (!isWanted(c.name)) continue;
      const variants =
        c.variants?.length > 0
          ? c.variants
          : [
              {
                name: c.name,
                nodeId: c.nodeId,
                props: {},
                figmaUrl: c.figmaUrl,
                width: c.width ?? 0,
                height: c.height ?? 0,
              },
            ];
      // Variants drawn at different widths are screen designs, not states.
      const screenScoped = new Set(variants.map((v) => v.width).filter(Boolean)).size > 1;
      for (const v of variants) {
        items.push({
          kind: "component",
          target: c.name,
          variant: v.name,
          nodeId: v.nodeId,
          props: v.props ?? {},
          designWidth: v.width ?? c.width ?? 0,
          designHeight: v.height ?? c.height ?? 0,
          screenScoped,
          threshold: thresholdFor("component", c.name),
        });
      }
    }
  }

  if (DO_PAGES) {
    const file = readJSON<PagesVersionFile>(PAGES_VERSION_FILE);
    for (const p of file?.pages ?? []) {
      if (!isWanted(p.identifier) && !isWanted(p.name)) continue;
      // Only compare a page that actually has code.
      if (p.codeStatus === "readyToCreate") continue;
      for (const s of p.screens ?? []) {
        items.push({
          kind: "page",
          target: p.identifier,
          variant: s.breakpoint,
          nodeId: s.nodeId,
          props: s.props ?? {},
          designWidth: s.width,
          designHeight: s.height,
          screenScoped: true, // a page IS a screen
          threshold: thresholdFor("page", p.identifier),
        });
      }
    }
  }

  return items;
}

/**
 * Version files written before per-variant sizes were stored have no width. One
 * batched /nodes call fills them in rather than failing or guessing.
 */
async function backfillSizes(items: WorkItem[]): Promise<void> {
  const missing = items.filter((i) => !i.designWidth).map((i) => i.nodeId);
  if (missing.length === 0) return;
  log("📐", `${new Set(missing).size} node(s) have no stored size — fetching bounding boxes…`);
  const boxes = await fetchNodeBoxes(missing);
  for (const i of items) {
    if (i.designWidth) continue;
    const b = boxes.get(i.nodeId);
    if (b) {
      i.designWidth = b.width;
      i.designHeight = b.height;
    }
  }
}

/**
 * The viewport a design should be evaluated in.
 *
 * A design that IS a screen (a page, or a "Footer-Laptop" 1024px variant) must
 * run at its own width or its media queries never fire and the desktop layout
 * gets measured inside a narrow box. Everything else — a 94px Button, a 300px
 * Card — is a desktop design, so it runs at 1440 and mobile rules stay off.
 */
const viewportFor = (i: WorkItem): number =>
  i.screenScoped
    ? Math.max(i.designWidth, 320)
    : Math.max(i.designWidth, DESKTOP_VIEWPORT);

// ─── Variant → story matching ──────────────────────────────────────────────

const lastSeg = (title: string) => title.split("/").pop() ?? title;

function argsCoverProps(
  storyArgs: Record<string, unknown>,
  props: Record<string, string>
): boolean {
  const flat = new Map<string, string>();
  for (const [k, v] of Object.entries(storyArgs)) {
    flat.set(k.toLowerCase(), String(v).toLowerCase());
  }
  for (const [k, v] of Object.entries(props)) {
    if (flat.get(k.toLowerCase()) !== String(v).toLowerCase()) return false;
  }
  return true;
}

function pickStory(item: WorkItem, registry: RegistryEntry[]): RegistryEntry | null {
  const candidates = registry.filter((r) => normId(lastSeg(r.title)) === normId(item.target));
  if (candidates.length === 0) return null;

  if (item.kind === "page") {
    // Pages export one story per designed breakpoint — match on that name.
    const byName = candidates.find((c) => normId(lastSeg(c.id)).includes(normId(item.variant)));
    return byName ?? candidates.find((c) => /\/(default|desktop)$/i.test(c.id)) ?? candidates[0];
  }

  if (Object.keys(item.props).length === 0) {
    return candidates.find((c) => /\/default$/i.test(c.id)) ?? candidates[0] ?? null;
  }

  const matches = candidates
    .filter((c) => argsCoverProps(c.args, item.props))
    .sort((a, b) => Object.keys(a.args).length - Object.keys(b.args).length);
  return matches[0] ?? null;
}

// ─── Diff ──────────────────────────────────────────────────────────────────

function padTo(src: PNG, W: number, H: number): Uint8Array {
  if (src.width === W && src.height === H) return src.data;
  const out = new Uint8Array(W * H * 4); // zeroed = transparent
  const rowLen = Math.min(src.width, W) * 4;
  const rows = Math.min(src.height, H);
  for (let y = 0; y < rows; y++) {
    out.set(src.data.subarray(y * src.width * 4, y * src.width * 4 + rowLen), y * W * 4);
  }
  return out;
}

interface DiffOutcome {
  W: number;
  H: number;
  mismatchPixels: number;
  diffPng: PNG;
  expectedSize: { w: number; h: number };
  actualSize: { w: number; h: number };
}

function diffPair(expectedBuf: Buffer, actualBuf: Buffer): DiffOutcome {
  const e = PNG.sync.read(expectedBuf);
  const a = PNG.sync.read(actualBuf);
  const W = Math.max(e.width, a.width);
  const H = Math.max(e.height, a.height);
  const diffPng = new PNG({ width: W, height: H });
  const mismatchPixels = pixelmatch(padTo(e, W, H), padTo(a, W, H), diffPng.data, W, H, {
    threshold: cfg.diffColorThreshold,
    includeAA: false,
    alpha: 0.35,
    diffColor: [255, 0, 255],
  });
  return {
    W,
    H,
    mismatchPixels,
    diffPng,
    expectedSize: { w: e.width, h: e.height },
    actualSize: { w: a.width, h: a.height },
  };
}

// ─── Result helpers ────────────────────────────────────────────────────────

function blankResult(item: WorkItem): DriftResult {
  return {
    kind: item.kind,
    target: item.target,
    variant: item.variant,
    nodeId: item.nodeId,
    story: null,
    status: "errored",
    threshold: item.threshold,
    designWidth: item.designWidth,
    viewportWidth: viewportFor(item),
    mismatchRatio: 0,
    mismatchPixels: 0,
    comparedSize: null,
    expectedSize: null,
    actualSize: null,
    images: { expected: null, actual: null, diff: null },
    notes: [],
  };
}

function proofPaths(item: WorkItem) {
  const relDir = `proof/${item.kind}s/${slug(item.target)}`;
  const dir = path.join(DRIFT_DIR, relDir);
  ensureDir(dir);
  const stem = slug(item.variant);
  return {
    expectedAbs: path.join(dir, `${stem}.expected.png`),
    actualAbs: path.join(dir, `${stem}.actual.png`),
    diffAbs: path.join(dir, `${stem}.diff.png`),
    expectedRel: `${relDir}/${stem}.expected.png`,
    actualRel: `${relDir}/${stem}.actual.png`,
    diffRel: `${relDir}/${stem}.diff.png`,
  };
}

function finishResult(
  base: DriftResult,
  outcome: DiffOutcome,
  paths: ReturnType<typeof proofPaths>
): DriftResult {
  const ratio = outcome.mismatchPixels / (outcome.W * outcome.H);
  const notes: string[] = [];
  const dW = outcome.actualSize.w - outcome.expectedSize.w;
  const dH = outcome.actualSize.h - outcome.expectedSize.h;
  if (dW || dH) {
    notes.push(
      `actual ${Math.abs(dW)}px ${dW > 0 ? "wider" : "narrower"}, ` +
        `${Math.abs(dH)}px ${dH > 0 ? "taller" : dH < 0 ? "shorter" : "same"} — padded before compare`
    );
  }
  return {
    ...base,
    status: ratio <= base.threshold ? "pass" : "fail",
    mismatchRatio: ratio,
    mismatchPixels: outcome.mismatchPixels,
    comparedSize: { w: outcome.W, h: outcome.H },
    expectedSize: outcome.expectedSize,
    actualSize: outcome.actualSize,
    images: { expected: paths.expectedRel, actual: paths.actualRel, diff: paths.diffRel },
    notes,
  };
}

const summarize = (results: DriftResult[]) => ({
  total: results.length,
  passed: results.filter((r) => r.status === "pass").length,
  failed: results.filter((r) => r.status === "fail").length,
  noStory: results.filter((r) => r.status === "no-story").length,
  errored: results.filter((r) => r.status === "errored").length,
});

// ─── Harness ───────────────────────────────────────────────────────────────

async function withHarness<T>(
  run: (baseUrl: string, browser: Browser) => Promise<T>
): Promise<T> {
  let server: ViteDevServer | undefined;
  let browser: Browser | undefined;
  try {
    server = await createServer({
      root: ROOT_DIR,
      configFile: false,
      appType: "mpa",
      logLevel: "warn",
      plugins: [react()],
      server: { port: 0, host: "127.0.0.1", fs: { allow: [ROOT_DIR] } },
    });
    await server.listen();
    const localUrl =
      server.resolvedUrls?.local?.[0] ??
      `http://127.0.0.1:${(server.httpServer?.address() as { port: number }).port}/`;
    const baseUrl = new URL(HARNESS_HTML, localUrl).toString();
    log("🌐", `harness → ${baseUrl}`);

    try {
      browser = await chromium.launch();
    } catch (err) {
      throw new Error(
        `Could not launch Chromium (${(err as Error).message}).\n` +
          "   Install the browser once with:  npx playwright install chromium"
      );
    }
    return await run(baseUrl, browser);
  } finally {
    await browser?.close().catch(() => undefined);
    await server?.close().catch(() => undefined);
  }
}

function storyUrl(baseUrl: string, item: WorkItem, storyId: string): string {
  const params = new URLSearchParams({ story: storyId });
  // The whole point of the width fix: tell the harness how wide the design is.
  params.set("w", item.kind === "page" ? "full" : String(item.designWidth));
  if (cfg.fontCss) params.set("fontCss", cfg.fontCss);
  return `${baseUrl}?${params.toString()}`;
}

async function captureActual(page: Page, item: WorkItem): Promise<Buffer> {
  const el = page.locator("#drift-root");
  await el.waitFor({ state: "visible", timeout: 5000 });
  if (item.kind === "page") {
    // A page is a full screen: capture everything below the fold too.
    return page.screenshot({ fullPage: true });
  }
  return el.screenshot({ omitBackground: true });
}

// ─── Live run ──────────────────────────────────────────────────────────────

async function runLive(work: WorkItem[]): Promise<DriftResult[]> {
  if (!FIGMA_TOKEN) {
    throw new Error("Missing FIGMA_TOKEN / FIGMA_PAT in .env (needed to fetch Figma baselines).");
  }
  if (!FIGMA_FILE_KEY) {
    throw new Error("No Figma file key (set FIGMA_FILE_KEY / FILE_KEY, or run a version phase).");
  }

  return withHarness(async (baseUrl, browser) => {
    const results: DriftResult[] = [];

    // Separate contexts per kind: deviceScaleFactor is fixed at creation, and a
    // full-page 1440×5000 diff at 2× is needlessly enormous.
    const pages = new Map<Kind, Page>();
    const pageFor = async (kind: Kind): Promise<Page> => {
      const existing = pages.get(kind);
      if (existing) return existing;
      const p = await browser.newPage({
        viewport: { width: DESKTOP_VIEWPORT, height: 1200 },
        deviceScaleFactor: kind === "page" ? cfg.pageScale : cfg.scale,
      });
      await p.emulateMedia({ reducedMotion: "reduce" });
      pages.set(kind, p);
      return p;
    };

    const probe = await pageFor("component");
    await probe.goto(baseUrl, { waitUntil: "load" });
    const registry = (await probe.evaluate(
      () => (globalThis as { __DRIFT_REGISTRY__?: unknown[] }).__DRIFT_REGISTRY__ ?? []
    )) as RegistryEntry[];
    log("📚", `${registry.length} stories discovered in src/components/** and src/pages/**`);

    // Resolve stories first so we only ask Figma for nodes we can compare.
    const planned = work.map((w) => ({ item: w, story: pickStory(w, registry) }));

    for (const kind of ["component", "page"] as Kind[]) {
      const mine = planned.filter((p) => p.item.kind === kind);
      if (mine.length === 0) continue;

      const ids = mine.filter((p) => p.story).map((p) => p.item.nodeId);
      const scale = kind === "page" ? cfg.pageScale : cfg.scale;
      log("🖼 ", `requesting ${new Set(ids).size} Figma ${kind} image(s) at ${scale}×…`);
      const imageUrls = ids.length
        ? await fetchImageUrls(ids, scale, cfg.useAbsoluteBounds)
        : new Map<string, string>();

      const page = await pageFor(kind);

      for (let i = 0; i < mine.length; i++) {
        const { item, story } = mine[i];
        const label = `${item.target} · ${item.variant}`;
        const base = blankResult(item);

        if (!story) {
          log("⚠ ", `[${i + 1}/${mine.length}] ${label} — no matching story`);
          results.push({
            ...base,
            status: "no-story",
            notes: ["no story matched this variant"],
          });
          continue;
        }
        base.story = story.id;

        try {
          await page.setViewportSize({
            width: viewportFor(item),
            height: kind === "page" ? 1200 : Math.max(600, Math.min(item.designHeight + 200, 2400)),
          });
          await page.goto(storyUrl(baseUrl, item, story.id), { waitUntil: "load" });
          await page.waitForFunction(
            () => (globalThis as { __DRIFT_READY__?: boolean }).__DRIFT_READY__ === true,
            undefined,
            { timeout: 15000 }
          );
          const renderErr = (await page.evaluate(
            () => (globalThis as { __DRIFT_ERROR__?: string }).__DRIFT_ERROR__ ?? null
          )) as string | null;
          if (renderErr) throw new Error(`render error: ${renderErr}`);

          const actualBuf = await captureActual(page, item);

          const imgUrl = imageUrls.get(item.nodeId);
          if (!imgUrl) throw new Error(`Figma returned no image for node ${item.nodeId}`);
          const expectedBuf = await downloadBuffer(imgUrl);

          const paths = proofPaths(item);
          fs.writeFileSync(paths.expectedAbs, expectedBuf);
          fs.writeFileSync(paths.actualAbs, actualBuf);

          const outcome = diffPair(expectedBuf, actualBuf);
          fs.writeFileSync(paths.diffAbs, PNG.sync.write(outcome.diffPng));

          const r = finishResult(base, outcome, paths);
          results.push(r);
          log(
            r.status === "pass" ? "✅" : "❌",
            `[${i + 1}/${mine.length}] ${label} — ${(r.mismatchRatio * 100).toFixed(2)}% ` +
              `(design ${item.designWidth}px · viewport ${r.viewportWidth}px)`
          );
        } catch (err) {
          log("💥", `[${i + 1}/${mine.length}] ${label} — ${(err as Error).message}`);
          results.push({ ...base, status: "errored", notes: [(err as Error).message] });
        }
      }
    }

    for (const p of pages.values()) await p.close().catch(() => undefined);
    return results;
  });
}

// ─── Report-only: recompute from cached PNGs ───────────────────────────────

function runReportOnly(work: WorkItem[]): DriftResult[] {
  return work.map((item) => {
    const base = blankResult(item);
    const paths = proofPaths(item);
    if (!fs.existsSync(paths.expectedAbs) || !fs.existsSync(paths.actualAbs)) {
      return { ...base, status: "errored" as const, notes: ["no cached PNGs — run a full pass first"] };
    }
    try {
      const outcome = diffPair(
        fs.readFileSync(paths.expectedAbs),
        fs.readFileSync(paths.actualAbs)
      );
      fs.writeFileSync(paths.diffAbs, PNG.sync.write(outcome.diffPng));
      return finishResult(base, outcome, paths);
    } catch (err) {
      return { ...base, status: "errored" as const, notes: [(err as Error).message] };
    }
  });
}

// ─── Reports ───────────────────────────────────────────────────────────────

const rankStatus = (s: ResultStatus): number =>
  s === "fail" ? 3 : s === "errored" ? 2 : s === "no-story" ? 1 : 0;

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  );

function toDataUri(absPath: string | null): string | null {
  if (!absPath) return null;
  try {
    return `data:image/png;base64,${fs.readFileSync(absPath).toString("base64")}`;
  } catch {
    return null;
  }
}

const sorted = (results: DriftResult[]) =>
  [...results].sort(
    (a, b) => rankStatus(b.status) - rankStatus(a.status) || b.mismatchRatio - a.mismatchRatio
  );

function buildHtml(results: DriftResult[], payload: unknown): string {
  const sum = summarize(results);
  const blocking = results.filter(
    (r) => r.status === "fail" && (r.kind === "component" || cfg.pagesFailBuild)
  ).length;
  const overall = blocking === 0 ? "PASS" : "FAIL";

  const cards = sorted(results)
    .map((r, i) => {
      const exp = toDataUri(r.images.expected && path.join(DRIFT_DIR, r.images.expected));
      const act = toDataUri(r.images.actual && path.join(DRIFT_DIR, r.images.actual));
      const dif = toDataUri(r.images.diff && path.join(DRIFT_DIR, r.images.diff));
      const pct = (r.mismatchRatio * 100).toFixed(2);
      const dW = r.actualSize && r.expectedSize ? r.actualSize.w - r.expectedSize.w : 0;
      const dH = r.actualSize && r.expectedSize ? r.actualSize.h - r.expectedSize.h : 0;
      const sizeDelta =
        dW || dH ? `Δ ${dW >= 0 ? "+" : ""}${dW}×${dH >= 0 ? "+" : ""}${dH}px` : "exact";
      const imgs =
        exp && act
          ? `
        <div class="stage">
          <div class="pair">
            <div class="onion">
              <img src="${exp}" alt="expected">
              <img src="${act}" alt="actual" class="top" id="ov${i}">
            </div>
            <figure class="difffig"><figcaption>diff (magenta = changed)</figcaption>
              <img src="${dif ?? ""}" alt="diff"></figure>
          </div>
          <label class="slider">expected&nbsp;
            <input type="range" min="0" max="100" value="100"
              oninput="document.getElementById('ov${i}').style.opacity=this.value/100">
            &nbsp;actual</label>
        </div>`
          : `<p class="muted">${
              r.status === "no-story"
                ? "No matching story."
                : "No images — " + (r.notes[0] ?? "not compared") + "."
            }</p>`;

      return `
    <details class="card ${r.status}" data-status="${r.status}" data-kind="${r.kind}" ${
        r.status === "fail" ? "open" : ""
      }>
      <summary>
        <span class="badge ${r.status}">${r.status.toUpperCase()}</span>
        <span class="kind">${r.kind}</span>
        <span class="name">${escapeHtml(r.target)}</span>
        <span class="variant">${escapeHtml(r.variant)}</span>
        <span class="metric">${pct}%</span>
        <span class="metric muted">${r.mismatchPixels.toLocaleString()} px</span>
        <span class="metric muted">${sizeDelta}</span>
      </summary>
      <div class="body">
        <div class="meta">
          node <code>${escapeHtml(r.nodeId)}</code> · story <code>${escapeHtml(
            r.story ?? "—"
          )}</code> · design ${r.designWidth}px · viewport ${r.viewportWidth}px ·
          threshold ${(r.threshold * 100).toFixed(2)}%
          ${r.notes.length ? `<ul>${r.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>` : ""}
        </div>
        ${imgs}
      </div>
    </details>`;
    })
    .join("\n");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>driftDetection report</title>
<style>
  :root{color-scheme:light dark}
  *{box-sizing:border-box}
  body{margin:0;font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
       background:#f6f7f9;color:#1b1f24}
  @media (prefers-color-scheme:dark){body{background:#0d1117;color:#e6edf3}}
  header{padding:20px 24px;border-bottom:1px solid #8883}
  h1{margin:0 0 6px;font-size:18px}
  .chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
  .chip{padding:3px 10px;border-radius:999px;border:1px solid #8886;font-size:12px}
  .chip.pill-pass{background:#1a7f37;color:#fff;border:0}
  .chip.pill-fail{background:#cf222e;color:#fff;border:0}
  main{padding:16px 24px;max-width:1100px;margin:0 auto}
  .toolbar{display:flex;gap:12px;align-items:center;margin:8px 0 16px}
  select{padding:4px 8px}
  .card{border:1px solid #8884;border-radius:10px;margin:10px 0;background:#fff}
  @media (prefers-color-scheme:dark){.card{background:#161b22}}
  .card.fail{border-color:#cf222e}
  summary{display:flex;gap:12px;align-items:center;padding:10px 14px;cursor:pointer;list-style:none}
  summary::-webkit-details-marker{display:none}
  .badge{font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px}
  .badge.pass{background:#1a7f3722;color:#1a7f37}
  .badge.fail{background:#cf222e22;color:#cf222e}
  .badge.no-story{background:#9a6d0022;color:#9a6d00}
  .badge.errored{background:#8886;color:inherit}
  .kind{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#8a8f98}
  .name{font-weight:600}
  .variant{color:#8a8f98}
  .metric{margin-left:auto;font-variant-numeric:tabular-nums}
  .metric+.metric{margin-left:12px}
  .muted{color:#8a8f98}
  .body{padding:0 14px 14px}
  .meta{font-size:12px;color:#8a8f98;margin:4px 0 12px}
  code{background:#8882;padding:1px 5px;border-radius:4px}
  .pair{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start}
  .onion,.difffig img{border:1px solid #8884;
    background:repeating-conic-gradient(#0000 0 25%,#8881 0 50%) 0 0/16px 16px}
  .onion{position:relative;display:inline-block}
  .onion img{display:block;max-width:100%}
  .onion img.top{position:absolute;inset:0}
  .difffig{margin:0}
  .difffig figcaption{font-size:11px;color:#8a8f98;margin-bottom:4px}
  .difffig img{display:block;max-width:100%;cursor:zoom-in}
  .difffig img.zoom{cursor:zoom-out;transform-origin:top left;image-rendering:pixelated;
    position:relative;z-index:5}
  .slider{display:flex;gap:8px;align-items:center;font-size:12px;color:#8a8f98;margin:10px 0 4px}
  .slider input{flex:1;max-width:360px}
  footer{padding:16px 24px;color:#8a8f98;font-size:12px;border-top:1px solid #8883}
</style></head><body>
<header>
  <h1>driftDetection &nbsp;<span class="chip ${
    overall === "PASS" ? "pill-pass" : "pill-fail"
  }">${overall}</span></h1>
  <div class="muted">${nowISO()} · file <code>${escapeHtml(FIGMA_FILE_KEY)}</code> ·
    components ${cfg.scale}× @ ${(cfg.threshold * 100).toFixed(2)}% ·
    pages ${cfg.pageScale}× @ ${(cfg.pageThreshold * 100).toFixed(2)}%${
      cfg.pagesFailBuild ? "" : " (report-only)"
    }</div>
  <div class="chips">
    <span class="chip">total ${sum.total}</span>
    <span class="chip">✅ pass ${sum.passed}</span>
    <span class="chip">❌ fail ${sum.failed}</span>
    <span class="chip">⚠ no-story ${sum.noStory}</span>
    <span class="chip">💥 errored ${sum.errored}</span>
  </div>
</header>
<main>
  <div class="toolbar">
    <label>Status
      <select id="filter" onchange="applyFilter()">
        <option value="all">all</option>
        <option value="fail">fail</option>
        <option value="pass">pass</option>
        <option value="no-story">no-story</option>
        <option value="errored">errored</option>
      </select>
    </label>
    <label>Kind
      <select id="kind" onchange="applyFilter()">
        <option value="all">all</option>
        <option value="component">components</option>
        <option value="page">pages</option>
      </select>
    </label>
  </div>
  <div id="list">
${cards}
  </div>
</main>
<footer>
  Baseline = Figma REST <code>/images</code> render (use_absolute_bounds); actual = the
  generated stories rendered in headless Chromium at the design's own width. Renderer AA
  differs — a correct build can still show a small non-zero %.
</footer>
<script>
  function applyFilter(){
    var s=document.getElementById('filter').value, k=document.getElementById('kind').value;
    document.querySelectorAll('#list .card').forEach(function(c){
      var ok = (s==='all'||c.dataset.status===s) && (k==='all'||c.dataset.kind===k);
      c.style.display = ok ? '' : 'none';
    });
  }
  document.addEventListener('click',function(e){
    var t=e.target;
    if(t.tagName==='IMG' && t.closest('.difffig')){
      if(t.classList.contains('zoom')){t.classList.remove('zoom');t.style.transform='';}
      else{t.classList.add('zoom');t.style.transform='scale(3)';}
    }
  });
</script>
${embedPayload(payload)}
</body></html>`;
}

function buildMarkdown(results: DriftResult[]): string {
  const sum = summarize(results);
  const blocking = results.filter(
    (r) => r.status === "fail" && (r.kind === "component" || cfg.pagesFailBuild)
  ).length;
  const rows = sorted(results)
    .map((r) => {
      const dW = r.actualSize && r.expectedSize ? r.actualSize.w - r.expectedSize.w : 0;
      const dH = r.actualSize && r.expectedSize ? r.actualSize.h - r.expectedSize.h : 0;
      const size = dW || dH ? `${dW >= 0 ? "+" : ""}${dW}×${dH >= 0 ? "+" : ""}${dH}` : "—";
      const icon =
        r.status === "pass" ? "✅" : r.status === "fail" ? "❌" : r.status === "no-story" ? "⚠️" : "💥";
      return `| ${r.kind} | ${r.target} | ${r.variant} | ${icon} ${r.status} | ${(
        r.mismatchRatio * 100
      ).toFixed(2)}% | ${r.designWidth}px | ${size} |`;
    })
    .join("\n");

  return `## driftDetection — ${blocking === 0 ? "✅ PASS" : "❌ FAIL"}

${nowISO()} · file \`${FIGMA_FILE_KEY}\` · components ${cfg.scale}× @ ${(
    cfg.threshold * 100
  ).toFixed(2)}% · pages ${cfg.pageScale}× @ ${(cfg.pageThreshold * 100).toFixed(2)}%${
    cfg.pagesFailBuild ? "" : " (report-only)"
  }

**${sum.passed} passed · ${sum.failed} failed · ${sum.noStory} no-story · ${sum.errored} errored** (of ${sum.total})

| Kind | Target | Variant | Status | Mismatch | Design width | Size Δ (w×h px) |
| --- | --- | --- | --- | --- | --- | --- |
${rows}

Full visual report: \`${rel(DRIFT_REPORT_HTML)}\`
`;
}

/** Fresh rows win; targets not checked this run keep their previous row. */
function mergeResults(fresh: DriftResult[]): DriftResult[] {
  const prev = readPayload<{ results?: DriftResult[] }>(DRIFT_REPORT_HTML)?.results ?? [];
  const key = (r: DriftResult) => `${r.kind}|${normId(r.target)}|${r.nodeId}|${r.variant}`;
  const merged = new Map<string, DriftResult>();
  for (const r of prev) merged.set(key(r), r);
  for (const r of fresh) merged.set(key(r), r);
  return [...merged.values()];
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const scope = [DO_COMPONENTS && "components", DO_PAGES && "pages"].filter(Boolean).join(" + ");
  console.log(`\n=== Script 4 · driftDetection (${scope}) ===\n`);

  if (!FIGMA_FILE_KEY) {
    FIGMA_FILE_KEY =
      readJSON<ComponentsVersionFile>(COMPONENTS_VERSION_FILE)?.figmaFileKey?.trim() ?? "";
  }

  const work = buildWorkList();
  if (work.length === 0) {
    log(
      "✓ ",
      ONLY.length ? `Nothing matches --only=${ONLY.join(",")}` : "Nothing built yet to check."
    );
    return;
  }

  const targets = new Set(work.map((w) => `${w.kind}:${w.target}`));
  log(
    "🎯",
    `${work.length} item(s) across ${targets.size} target(s)` +
      `${REPORT_ONLY ? " · report-only" : ""}${DRY_RUN ? " · DRY RUN" : ""}`
  );

  if (DRY_RUN) {
    for (const w of work) {
      console.log(
        `   - ${w.kind.padEnd(9)} ${`${w.target} · ${w.variant}`.padEnd(40)} ` +
          `design ${String(w.designWidth || "?").padStart(5)}px → viewport ${viewportFor(w)}px ` +
          `· threshold ${(w.threshold * 100).toFixed(2)}%`
      );
    }
    console.log("\n✅  Done (dry run — nothing rendered, nothing fetched).\n");
    return;
  }

  ensureDir(DRIFT_PROOF_DIR);
  if (!REPORT_ONLY) await backfillSizes(work);

  const fresh = REPORT_ONLY ? runReportOnly(work) : await runLive(work);
  const results = MERGE ? mergeResults(fresh) : fresh;

  const sum = summarize(results);
  // The rows ride inside report.html (see lib/driftReport.ts) — no report.json.
  const payload = {
    generatedAt: nowISO(),
    figmaFileKey: FIGMA_FILE_KEY,
    engine: "pixelmatch",
    config: {
      scale: cfg.scale,
      pageScale: cfg.pageScale,
      threshold: cfg.threshold,
      pageThreshold: cfg.pageThreshold,
      pagesFailBuild: cfg.pagesFailBuild,
      useAbsoluteBounds: cfg.useAbsoluteBounds,
    },
    summary: sum,
    results,
  };
  ensureDir(DRIFT_DIR);
  fs.writeFileSync(DRIFT_REPORT_HTML, buildHtml(results, payload), "utf-8");
  fs.writeFileSync(DRIFT_REPORT_MD, buildMarkdown(results), "utf-8");

  console.log("");
  log("📄", `report  → ${rel(DRIFT_REPORT_HTML)}`);
  log("📄", `md      → ${rel(DRIFT_REPORT_MD)}`);
  log(
    "📊",
    `pass ${sum.passed} · fail ${sum.failed} · no-story ${sum.noStory} · errored ${sum.errored}` +
      (MERGE ? `  (${fresh.length} checked this run, ${results.length} in report)` : "")
  );

  for (const r of results.filter((x) => x.status === "fail")) {
    log(
      r.kind === "page" && !cfg.pagesFailBuild ? "🟡" : "❌",
      `${r.kind} ${r.target} · ${r.variant} — ${(r.mismatchRatio * 100).toFixed(2)}% > ` +
        `${(r.threshold * 100).toFixed(2)}%${
          r.kind === "page" && !cfg.pagesFailBuild ? " (report-only)" : ""
        }`
    );
  }

  // Only this run's results decide the exit code — stale rows from other targets
  // must not fail a targeted --only run. Pages are report-only by default.
  const blocking = fresh.filter(
    (r) =>
      (r.status === "fail" || (FAIL_ON_MISSING && r.status === "no-story")) &&
      (r.kind === "component" || cfg.pagesFailBuild)
  );
  if (blocking.length > 0) process.exitCode = 1;
  console.log();
}

void main().catch((err) => {
  console.error("\n❌  driftDetection failed:", (err as Error).message);
  process.exitCode = 1;
});
