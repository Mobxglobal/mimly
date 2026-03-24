import { createWorkspaceAdminClient } from "@/lib/workspace/auth";
import { getVerticalSlideshowImageUrls } from "@/lib/share/vertical-slideshow-urls";

export type PublicShareErrorReason =
  | "missing"
  | "revoked"
  | "expired"
  | "not_found"
  | "unavailable";

export type PublicSharePayload =
  | { ok: false; reason: PublicShareErrorReason }
  | {
      ok: true;
      slideshowUrls: string[];
      mediaUrl: string | null;
      mediaType: "image" | "video";
    };

function mediaTypeFromUrl(url: string): "video" | "image" {
  return /\.(mp4|webm|m4v)(\?|#|$)/i.test(url) ? "video" : "image";
}

export async function loadPublicSharePayload(rawToken: unknown): Promise<PublicSharePayload> {
  const token = String(rawToken ?? "").trim();
  if (!token || token.length > 200) {
    return { ok: false, reason: "missing" };
  }

  const admin = createWorkspaceAdminClient();
  const { data: link } = await admin
    .schema("public")
    .from("share_links")
    .select("revoked_at, expires_at, generated_meme_id")
    .eq("token", token)
    .maybeSingle();

  if (!link) return { ok: false, reason: "missing" };
  if (link.revoked_at) return { ok: false, reason: "revoked" };
  const exp = link.expires_at as string | null;
  if (exp) {
    const t = new Date(exp).getTime();
    if (!Number.isNaN(t) && t <= Date.now()) {
      return { ok: false, reason: "expired" };
    }
  }

  const memeId = String(link.generated_meme_id ?? "").trim();
  const { data: meme } = await admin
    .schema("public")
    .from("generated_memes")
    .select("image_url, variant_metadata")
    .eq("id", memeId)
    .maybeSingle();

  if (!meme) return { ok: false, reason: "not_found" };

  const variantMeta =
    meme.variant_metadata && typeof meme.variant_metadata === "object"
      ? (meme.variant_metadata as Record<string, unknown>)
      : null;
  const slideshowUrls = getVerticalSlideshowImageUrls(variantMeta);
  if (slideshowUrls.length > 0) {
    return { ok: true, slideshowUrls, mediaUrl: null, mediaType: "image" };
  }

  const mediaUrl = String((meme as { image_url?: unknown }).image_url ?? "").trim();
  if (!mediaUrl) return { ok: false, reason: "unavailable" };

  return {
    ok: true,
    slideshowUrls: [],
    mediaUrl,
    mediaType: mediaTypeFromUrl(mediaUrl),
  };
}
