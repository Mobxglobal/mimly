"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/actions/profile";
import { generateMockMemes } from "@/lib/actions/memes";

export type ContentPackBatchNumber = 1 | 2 | 3;

/**
 * Orchestrates one content-pack batch: 3× square_image, 3× square_video,
 * 3× vertical_slideshow, 3× square_text — all share one `generation_run_id`
 * for preview queries. Only for profiles with `generation_mode === 'content_pack'`.
 */
export async function generateContentPackBatch(
  batch: ContentPackBatchNumber
): Promise<{ error: string | null; packRunId?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const profile = await getProfile();
  if (!profile) return { error: "Missing profile. Please complete onboarding." };
  if (profile.generation_mode !== "content_pack") {
    return {
      error: "Content pack generation is not enabled for this account.",
    };
  }

  const packRunId = randomUUID();
  const shared = {
    generationRunIdOverride: packRunId,
    contentPack: { batch },
    limit: 3 as const,
  };

  const steps = [
    () => generateMockMemes(undefined, { ...shared, outputFormat: "square_image" }),
    () => generateMockMemes(undefined, { ...shared, outputFormat: "square_video" }),
    () =>
      generateMockMemes(undefined, { ...shared, outputFormat: "vertical_slideshow" }),
    () => generateMockMemes(undefined, { ...shared, outputFormat: "square_text" }),
  ];

  for (const run of steps) {
    const { error } = await run();
    if (error) return { error };
  }

  const { error: upErr } = await supabase
    .schema("public")
    .from("profiles")
    .update({
      content_pack_last_completed_batch: batch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (upErr) {
    console.error("[content-pack] profile batch update failed", upErr);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/content-pack");
  return { error: null, packRunId };
}
