"use server";

import { createClient } from "@/lib/supabase/server";

const MOCK_MEMES = [
  {
    title: "Productivity chaos",
    format: "Drake format",
    top_text: "Posting generic brand content",
    bottom_text: "Posting memes your audience actually shares",
  },
  {
    title: "Weekend discount push",
    format: "Change My Mind",
    top_text: "50% off this weekend only",
    bottom_text: "People who wait until Monday missed the meme and the sale",
  },
  {
    title: "Feature launch angle",
    format: "Two buttons",
    top_text: "Announce the feature normally",
    bottom_text: "Turn the launch into a meme and get engagement too",
  },
];

export async function generateMockMemes(promotionContext?: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const rows = MOCK_MEMES.map((m) => ({
    user_id: user.id,
    title: m.title,
    format: m.format,
    top_text: m.top_text,
    bottom_text: m.bottom_text,
    image_url: null,
    template_id: null,
  }));

  const { error } = await supabase.from("generated_memes").insert(rows);
  return { error: error?.message ?? null };
}
