import type { MemeOutputFormat } from "@/lib/memes/meme-output-formats";

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function resolveWorkspaceOutputFormat(params: {
  prompt: string;
  businessUrl?: string | null;
}): MemeOutputFormat {
  const prompt = String(params.prompt ?? "").toLowerCase();
  const withUrlHint = `${prompt} ${String(params.businessUrl ?? "").toLowerCase()}`;

  if (
    hasAny(withUrlHint, [
      /\b(slideshow|slides|carousel)\b/,
      /\b(tiktok\s*slides|instagram\s*carousel)\b/,
    ])
  ) {
    return "vertical_slideshow";
  }

  if (
    hasAny(withUrlHint, [
      /\b(video|videos|reel|reels|shorts)\b/,
      /\bmp4\b/,
    ])
  ) {
    return "square_video";
  }

  if (
    hasAny(withUrlHint, [
      /\btext[-\s]?only\b/,
      /\btext post\b/,
      /\bquote card\b/,
      /\bword[-\s]?only\b/,
    ])
  ) {
    return "square_text";
  }

  return "square_image";
}
