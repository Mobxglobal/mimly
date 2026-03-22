"use server";

/**
 * Content pack unlock — grants access to the full pack (all posts in the batch),
 * not a single card.
 *
 * Integration: replace the body below with Stripe Checkout Session creation when ready.
 * On `checkout.session.completed`, set `profiles.content_pack_unlocked_at` for the customer.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ContentPackUnlockResult =
  | { ok: true; checkoutUrl: string | null; devUnlocked: boolean }
  | { ok: false; error: string };

export async function startContentPackUnlockCheckout(): Promise<ContentPackUnlockResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  // --- Stripe integration point (content pack product) ---
  // if (process.env.STRIPE_SECRET_KEY) {
  //   const session = await stripe.checkout.sessions.create({ ... });
  //   return { ok: true, checkoutUrl: session.url, devUnlocked: false };
  // }

  const { error } = await supabase
    .schema("public")
    .from("profiles")
    .update({
      content_pack_unlocked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    console.error("[content-pack-unlock] unlock failed", error);
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard/content-pack");
  revalidatePath("/dashboard");
  return { ok: true, checkoutUrl: null, devUnlocked: true };
}
