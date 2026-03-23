"use server";

export type ContentPackBatchNumber = 1 | 2 | 3;

/**
 * LEGACY: content-pack dashboard flow.
 * Not used by the workspace-first product path.
 */
export async function generateContentPackBatch(
  batch: ContentPackBatchNumber
): Promise<{ error: string | null; packRunId?: string }> {
  console.error("[legacy-generation] generateContentPackBatch called", { batch });
  throw new Error("Legacy generation path no longer supported");
}
