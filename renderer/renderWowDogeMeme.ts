/**
 * Legacy renderer retained for backwards-compatible imports.
 * Current generation flow excludes wow-doge templates before rendering.
 */
type WowDogeRenderArgs = {
  baseImageBuffer: Buffer;
  phrases: string[];
};

export async function renderWowDogeMemePng(_args?: WowDogeRenderArgs): Promise<Buffer> {
  throw new Error("wow-doge renderer is disabled.");
}
