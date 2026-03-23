/**
 * LEGACY: content-pack dashboard unlock flow.
 * Not used by the workspace-first product path.
 */
"use server";

/**
 * Content pack unlock — grants access to the full pack (all posts in the batch),
 * not a single card.
 *
 * Integration: replace the body below with Stripe Checkout Session creation when ready.
 * On `checkout.session.completed`, set `profiles.content_pack_unlocked_at` for the customer.
 */

export type ContentPackUnlockResult =
  | { ok: true; checkoutUrl: string | null; devUnlocked: boolean }
  | { ok: false; error: string };

export async function startContentPackUnlockCheckout(): Promise<ContentPackUnlockResult> {
  console.error("[legacy-generation] startContentPackUnlockCheckout called");
  throw new Error("Legacy generation path no longer supported");
}
