/**
 * Legacy renderer retained for backwards-compatible imports.
 * Current generation flow excludes wow-doge templates before rendering.
 */
export async function renderWowDogeMemePng(): Promise<Buffer> {
  throw new Error("wow-doge renderer is disabled.");
}
