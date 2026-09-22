/**
 * lib/hash.ts — content hashing, the pipeline's change signal.
 *
 * Figma exposes NO per-node edit timestamp. `/v1/files/:key/components` carries
 * an `updated_at`, but that is the *publish* time of the library: on this file it
 * read five weeks stale while the design had been edited minutes earlier, so a
 * changed Button was never listed for update. Hashing a normalised projection of
 * the node's own subtree is therefore the authoritative signal.
 */

import crypto from "node:crypto";
import type { FigmaNode, FigmaPaint } from "./figma.js";

const r2 = (n: unknown): number | undefined =>
  typeof n === "number" ? Math.round(n * 100) / 100 : undefined;

const visiblePaints = (a: FigmaPaint[] | undefined) =>
  (a ?? [])
    .filter((p) => p.visible !== false)
    .map((p) => ({
      t: p.type,
      c: p.color
        ? [r2(p.color.r), r2(p.color.g), r2(p.color.b), r2(p.color.a ?? 1)]
        : undefined,
      o: r2(p.opacity),
      g: p.gradientStops?.map((s) => [r2(s.position), s.color]),
    }));

/**
 * Normalised view of a node. Deliberately EXCLUDES node ids and canvas position
 * (`absoluteBoundingBox` x/y, `absoluteRenderBounds`) so moving a component
 * around the canvas — or Figma re-minting an id — is not mistaken for a design
 * change. Children are included recursively, which is what makes an added,
 * removed or recoloured variant detectable.
 */
function projectNode(n: FigmaNode): unknown {
  const b = n.absoluteBoundingBox;
  return {
    n: n.name,
    t: n.type,
    w: r2(b?.width),
    h: r2(b?.height),
    f: visiblePaints(n.fills),
    s: visiblePaints(n.strokes),
    sw: r2(n.strokeWeight),
    cr: n.cornerRadius,
    rr: n.rectangleCornerRadii,
    op: r2(n.opacity),
    lm: n.layoutMode,
    lw: n.layoutWrap,
    is: r2(n.itemSpacing),
    cs: r2(n.counterAxisSpacing),
    p: [n.paddingTop, n.paddingRight, n.paddingBottom, n.paddingLeft].map(r2),
    pa: n.primaryAxisAlignItems,
    ca: n.counterAxisAlignItems,
    e: (n.effects ?? [])
      .filter((x) => x.visible !== false)
      .map((x) => ({ t: x.type, r: r2(x.radius), c: x.color })),
    ty: n.style,
    ch: n.characters,
    pd: n.componentPropertyDefinitions
      ? Object.keys(n.componentPropertyDefinitions)
      : undefined,
    k: (n.children ?? []).map(projectNode),
  };
}

export const hashNode = (n: FigmaNode): string =>
  crypto.createHash("sha1").update(JSON.stringify(projectNode(n))).digest("hex").slice(0, 16);
