/**
 * lib/types.ts — the shape of the version files every script reads and writes.
 *
 *   readyToCreate  no successful build recorded for this node
 *   readyToUpdate  built before, but the Figma content hash has moved since
 *   created        built, and the hash still matches what it was built from
 *
 * `codeStatus` is derived purely from `builtAgainstHash`, which only a
 * successful Claude run writes back.
 */

export type CodeStatus = "readyToCreate" | "readyToUpdate" | "created";

export interface VariantInfo {
  name: string;
  nodeId: string;
  props: Record<string, string>;
  figmaUrl: string;
  /**
   * The variant's own Figma frame size. driftDetection lays the rendered
   * component out at this width — without it a `width:100%` component
   * shrink-wraps to its content and every comparison is noise.
   */
  width: number;
  height: number;
}

export interface ComponentInfo {
  name: string;
  nodeId: string;
  page: string | null;
  figmaUrl: string;
  /** Hash of the component's whole Figma subtree — see lib/hash.ts. */
  figmaHash: string;
  width: number;
  height: number;
  variantProps: Record<string, string[]>;
  variants: VariantInfo[];
  dependsOn: string[];
  description: string;
}

export interface ComponentEntry extends ComponentInfo {
  codeStatus: CodeStatus;
  /** The `figmaHash` the code was last successfully built from. */
  builtAgainstHash: string | null;
  builtAt: string | null;
  builtWithModel: string | null;
  /** Project-relative location of the generated code. */
  targetDir: string | null;
  /**
   * The `figmaHash` the Storybook .mdx docs page was last authored from. Docs
   * cost a Claude turn, so they are only rewritten when the design actually
   * moved — not on every run.
   */
  docsBuiltAgainstHash?: string | null;
}

export interface ComponentsVersionFile {
  figmaFileKey: string;
  /** Figma's own file version — the cheap gate for "did anything change at all". */
  figmaVersion: string;
  lastModified: string;
  updatedAt: string;
  components: ComponentEntry[];
}

// ─── Pages ─────────────────────────────────────────────────────────────────

export interface ScreenVariant {
  name: string;
  nodeId: string;
  figmaUrl: string;
  width: number;
  height: number;
  breakpoint: string;
  media: string;
  props: Record<string, string>;
}

export interface PageDependency {
  name: string;
  identifier: string;
  importPath: string | null;
  uses: number;
}

export interface PageEntry {
  name: string;
  identifier: string;
  nodeId: string;
  canvas: string;
  figmaUrl: string;
  figmaHash: string;
  width: number;
  height: number;
  isVariantSet: boolean;
  /** Where the screen designs came from — drives the responsive contract. */
  screenSource: "variants" | "siblings" | "single";
  screens: ScreenVariant[];
  dependsOn: PageDependency[];
  bespokeSections: string[];
  description: string;
  fetchedAt: string;
  codeStatus: CodeStatus;
  builtAgainstHash: string | null;
  builtAt: string | null;
  builtWithModel: string | null;
  targetDir: string | null;
  /** See ComponentEntry.docsBuiltAgainstHash. */
  docsBuiltAgainstHash?: string | null;
}

export interface PagesVersionFile {
  figmaFileKey: string;
  canvas: string;
  figmaVersion: string;
  lastModified: string;
  updatedAt: string;
  pages: PageEntry[];
}
