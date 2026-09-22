/**
 * lib/driftReport.ts — the drift report's machine-readable payload.
 *
 * There is no report.json. The HTML report already embeds every PNG as a data
 * URI, so it is the single self-contained artefact; its result rows ride along
 * inside it as an inert <script type="application/json"> block. That is what
 * lets a later run merge with an earlier one, and what lets componentPipeline /
 * pagePipeline read back the rows for the component they just built — without a
 * second file on disk.
 */

import fs from "node:fs";

const DATA_ID = "drift-data";
const OPEN = `<script type="application/json" id="${DATA_ID}">`;
const CLOSE = "</script>";

/**
 * Serialise for embedding in HTML. `<` is escaped so a "</script>" inside any
 * string (a note, a story id) cannot close the block early.
 */
export function embedPayload(payload: unknown): string {
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `${OPEN}${json}${CLOSE}`;
}

/** Read the payload back out of a previously written report. */
export function readPayload<T>(htmlPath: string): T | null {
  let html: string;
  try {
    html = fs.readFileSync(htmlPath, "utf-8");
  } catch {
    return null;
  }
  const start = html.indexOf(OPEN);
  if (start === -1) return null;
  const from = start + OPEN.length;
  const end = html.indexOf(CLOSE, from);
  if (end === -1) return null;
  try {
    return JSON.parse(html.slice(from, end)) as T;
  } catch {
    return null;
  }
}
