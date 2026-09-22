/**
 * driftDetection render harness — served by scripts/driftDetection.ts through a
 * programmatic Vite dev server (Vite root = project root, so the relative globs
 * and imports below resolve into ../../src).
 *
 * It renders ONE story, isolated, then sets `window.__DRIFT_READY__`.
 * driftDetection.ts drives it with query parameters:
 *
 *   ?story=<id>   which story to render
 *   &w=<px>       lay the root out at exactly this width — the Figma frame width
 *   &w=full       page mode: the root fills the viewport (a page IS a screen)
 *   &fontCss=<url>  optional webfont stylesheet
 *
 * `w` is the whole reason this file exists in its current form. The root used to
 * be `display:inline-block` (shrink-to-fit), so a component styled `width:100%`
 * collapsed to its content instead of filling the Figma frame, and every
 * comparison measured the wrong box.
 */
import type { ComponentType } from "react";
import { createRoot } from "react-dom/client";

import "../../../src/designToken.css";
import "../../../src/index.css";

// Eagerly pull in every generated story file — components AND pages.
const modules = {
  ...(import.meta.glob("../../../src/components/**/*.stories.tsx", { eager: true }) as Record<
    string,
    Record<string, unknown>
  >),
  ...(import.meta.glob("../../../src/pages/**/*.stories.tsx", { eager: true }) as Record<
    string,
    Record<string, unknown>
  >),
};

interface StoryEntry {
  id: string;
  title: string;
  component: unknown;
  args: Record<string, unknown>;
}

const stories: StoryEntry[] = [];

for (const mod of Object.values(modules)) {
  const meta = mod.default as
    | { title?: string; component?: unknown; args?: Record<string, unknown> }
    | undefined;
  if (!meta || !meta.component || !meta.title) continue;

  const baseArgs = meta.args ?? {};
  for (const [name, value] of Object.entries(mod)) {
    if (name === "default") continue;
    // CSF3 story = plain object (optionally with `.args`); {} is still a valid story.
    if (typeof value !== "object" && typeof value !== "function") continue;
    if (value === null) continue;
    const storyArgs = (value as { args?: Record<string, unknown> }).args ?? {};
    stories.push({
      id: `${meta.title}/${name}`,
      title: meta.title,
      component: meta.component,
      args: { ...baseArgs, ...storyArgs },
    });
  }
}

const win = window as unknown as Record<string, unknown>;
win.__DRIFT_STORIES__ = stories.map((s) => s.id);
// Full registry (id + title + resolved args) so the driver can match variants → stories.
win.__DRIFT_REGISTRY__ = stories.map((s) => ({ id: s.id, title: s.title, args: s.args }));

// ── Deterministic rendering environment ──────────────────────────────────────
const params = new URLSearchParams(location.search);

const fontCss = params.get("fontCss");
if (fontCss) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = fontCss;
  document.head.appendChild(link);
}

/**
 * Lay the root out at the design's own width.
 *   w=<px>  a definite width, so `width:100%` children fill the Figma frame
 *   w=full  the root spans the viewport (page mode)
 *   absent  legacy shrink-to-fit
 */
const w = params.get("w");
const rootSizing =
  w === "full"
    ? "display:block;width:100%;"
    : w && Number(w) > 0
    ? `display:block;width:${Number(w)}px;`
    : "display:inline-block;";

const style = document.createElement("style");
style.textContent = `
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
    caret-color: transparent !important;
  }
  html, body { margin: 0; padding: 0; background: transparent; }
  #app { ${w === "full" ? "display:block;width:100%;" : "display:inline-block;"} }
  #drift-root { ${rootSizing} }
`;
document.head.appendChild(style);

function markReady(): void {
  const ready = () => {
    (window as unknown as Record<string, unknown>).__DRIFT_READY__ = true;
  };
  const fonts = (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts;
  Promise.resolve(fonts?.ready)
    .catch(() => undefined)
    .then(() => requestAnimationFrame(() => requestAnimationFrame(ready)));
}

const storyId = params.get("story");
const root = createRoot(document.getElementById("app")!);

try {
  if (!storyId) {
    root.render(<pre>{stories.map((s) => s.id).join("\n")}</pre>);
  } else {
    const target = stories.find((s) => s.id === storyId);
    if (!target) {
      (window as unknown as Record<string, unknown>).__DRIFT_ERROR__ =
        `story not found: ${storyId}`;
      root.render(
        <div id="drift-root" data-error="story-not-found">
          story not found: {storyId}
        </div>
      );
    } else {
      const Component = target.component as ComponentType<Record<string, unknown>>;
      root.render(
        <div id="drift-root">
          <Component {...target.args} />
        </div>
      );
    }
  }
} catch (err) {
  (window as unknown as Record<string, unknown>).__DRIFT_ERROR__ =
    (err as Error)?.message ?? String(err);
}

markReady();
