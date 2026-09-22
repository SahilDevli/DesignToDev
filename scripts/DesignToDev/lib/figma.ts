/** lib/figma.ts — every Figma REST call the pipeline makes, in one place. */

import { API_BASE_URL, FIGMA_FILE_KEY, FIGMA_TOKEN, FIGMA_URL } from "./env.js";
import { delay } from "./io.js";

// ─── Node shapes (only the fields the pipeline reads are typed) ────────────

export interface FigmaPaint {
  type?: string;
  visible?: boolean;
  opacity?: number;
  color?: { r: number; g: number; b: number; a?: number };
  gradientStops?: Array<{ position?: number; color?: unknown }>;
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  componentId?: string;
  characters?: string;
  opacity?: number;
  visible?: boolean;
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  cornerRadius?: number;
  rectangleCornerRadii?: number[];
  layoutMode?: string;
  layoutWrap?: string;
  itemSpacing?: number;
  counterAxisSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  effects?: Array<{ type?: string; visible?: boolean; radius?: number; color?: unknown }>;
  style?: Record<string, unknown>;
  absoluteBoundingBox?: { x?: number; y?: number; width?: number; height?: number };
  componentPropertyDefinitions?: Record<string, unknown>;
}

export interface FigmaFileTree {
  name: string;
  version: string;
  lastModified: string;
  document: { children: FigmaNode[] };
}

/** The `components` / `componentSets` maps that ride along with a /nodes fetch. */
export interface NodeLookups {
  components: Record<string, { name: string; componentSetId?: string }>;
  componentSets: Record<string, { name: string }>;
}

// ─── Transport ─────────────────────────────────────────────────────────────

/** Figma's CDN drops the odd connection; a retry keeps unattended runs honest. */
export async function figmaGet<T>(url: string, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { headers: { "X-Figma-Token": FIGMA_TOKEN } });
      if (!res.ok) {
        throw new Error(`Figma API ${res.status} ${res.statusText} — ${await res.text()}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (i < attempts) await delay(1000 * i);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Canonical file URL, always built around the known file key so deep links stay
 * valid when FIGMA_URL is missing or truncated.
 */
export function figmaFileBase(): string {
  const m = FIGMA_URL.match(/figma\.com\/(?:design|file)\/[A-Za-z0-9]+\/([^/?#]+)/);
  return `https://www.figma.com/design/${FIGMA_FILE_KEY}/${m ? m[1] : "design"}`;
}

/** Deep link to one node, e.g. …?node-id=12-345&m=dev */
export const nodeLink = (nodeId: string): string =>
  `${figmaFileBase()}?node-id=${nodeId.replace(/:/g, "-")}&m=dev`;

// ─── Document ──────────────────────────────────────────────────────────────

/**
 * The cheap gate: ~1.3KB whatever the file size. If `version` is unchanged,
 * nothing in the file was edited and the full scan can be skipped entirely.
 */
export async function fetchFileStamp(): Promise<{ version: string; lastModified: string }> {
  const j = await figmaGet<{ version: string; lastModified: string }>(
    `${API_BASE_URL}/files/${FIGMA_FILE_KEY}?depth=1`
  );
  return { version: String(j.version), lastModified: j.lastModified };
}

/**
 * ONE call returns every node in the document. Hashing therefore costs a single
 * request whether the file holds 8 components or 100 — there are no
 * per-component requests anywhere in this pipeline.
 */
export const fetchFileTree = (): Promise<FigmaFileTree> =>
  figmaGet<FigmaFileTree>(`${API_BASE_URL}/files/${FIGMA_FILE_KEY}`);

/** Shallow tree (canvases + their direct children) — enough to find page roots. */
export const fetchFileOutline = (): Promise<FigmaFileTree> =>
  figmaGet<FigmaFileTree>(`${API_BASE_URL}/files/${FIGMA_FILE_KEY}?depth=2`);

/** Full subtree for one node, plus the component/componentSet name lookups. */
export async function fetchNode(
  nodeId: string
): Promise<(NodeLookups & { document: FigmaNode }) | null> {
  const res = await figmaGet<{
    nodes: Record<string, { document: FigmaNode } & Partial<NodeLookups>>;
  }>(`${API_BASE_URL}/files/${FIGMA_FILE_KEY}/nodes?ids=${encodeURIComponent(nodeId)}`);
  const entry = res.nodes?.[nodeId];
  if (!entry) return null;
  return {
    document: entry.document,
    components: entry.components ?? {},
    componentSets: entry.componentSets ?? {},
  };
}

/** Bounding boxes for many nodes in one request (depth=0 keeps it small). */
export async function fetchNodeBoxes(
  nodeIds: string[]
): Promise<Map<string, { width: number; height: number }>> {
  const out = new Map<string, { width: number; height: number }>();
  const unique = [...new Set(nodeIds)];
  const CHUNK = 50;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const ids = unique.slice(i, i + CHUNK);
    const res = await figmaGet<{
      nodes: Record<string, { document?: FigmaNode } | null>;
    }>(
      `${API_BASE_URL}/files/${FIGMA_FILE_KEY}/nodes` +
        `?ids=${encodeURIComponent(ids.join(","))}&depth=0`
    );
    for (const id of ids) {
      const b = res.nodes?.[id]?.document?.absoluteBoundingBox;
      if (b?.width && b?.height) {
        out.set(id, { width: Math.round(b.width), height: Math.round(b.height) });
      }
    }
  }
  return out;
}

// ─── Node helpers ──────────────────────────────────────────────────────────

/** "Type=Primary, State=Hover" -> { Type: "Primary", State: "Hover" } */
export function parseVariantProps(name: string): Record<string, string> {
  const props: Record<string, string> = {};
  if (!name.includes("=")) return props;
  for (const part of name.split(",")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    if (k) props[k] = part.slice(i + 1).trim();
  }
  return props;
}

export const nodeW = (n: FigmaNode): number => Math.round(n.absoluteBoundingBox?.width ?? 0);
export const nodeH = (n: FigmaNode): number => Math.round(n.absoluteBoundingBox?.height ?? 0);

/** Every INSTANCE in a subtree, resolved to its owning component-set name. */
export function collectInstances(root: FigmaNode, lookups: NodeLookups): Map<string, number> {
  const out = new Map<string, number>();
  (function walk(n: FigmaNode) {
    if (n.type === "INSTANCE" && n.componentId) {
      const c = lookups.components[n.componentId];
      const setName = c?.componentSetId ? lookups.componentSets[c.componentSetId]?.name : undefined;
      const label = (setName ?? c?.name ?? n.name).trim();
      out.set(label, (out.get(label) ?? 0) + 1);
    }
    for (const ch of n.children ?? []) walk(ch);
  })(root);
  return out;
}

// ─── Images (drift baselines) ──────────────────────────────────────────────

/**
 * Rendered PNGs for the given nodes.
 *
 * `useAbsoluteBounds` renders each node at its own bounding box instead of its
 * render bounds. Without it a drop shadow inflates the export — Product Card's
 * Hover variant came back 348px wide against 304px for its siblings — and the
 * baseline then no longer matches the box the DOM element actually occupies.
 */
export async function fetchImageUrls(
  nodeIds: string[],
  scale: number,
  useAbsoluteBounds: boolean
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(nodeIds)];
  const CHUNK = 50;

  for (let i = 0; i < unique.length; i += CHUNK) {
    let pending = unique.slice(i, i + CHUNK);
    let attempt = 0;
    while (pending.length && attempt < 4) {
      const url =
        `${API_BASE_URL}/images/${FIGMA_FILE_KEY}` +
        `?ids=${encodeURIComponent(pending.join(","))}&format=png&scale=${scale}` +
        (useAbsoluteBounds ? "&use_absolute_bounds=true" : "");
      const data = await figmaGet<{
        images: Record<string, string | null>;
        err: string | null;
      }>(url);
      if (data.err) throw new Error(`Figma images API error: ${data.err}`);
      const next: string[] = [];
      for (const id of pending) {
        const u = data.images?.[id];
        if (u) out.set(id, u);
        else next.push(id);
      }
      pending = next;
      if (pending.length) {
        attempt++;
        await delay(1500 * attempt); // Figma may still be rendering
      }
    }
  }
  return out;
}

export async function downloadBuffer(url: string, attempts = 3): Promise<Buffer> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`image download ${res.status} ${res.statusText}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastErr = err;
      if (i < attempts) await delay(800 * i);
    }
  }
  throw new Error(
    `image download failed after ${attempts} attempts — ${(lastErr as Error).message}`
  );
}
