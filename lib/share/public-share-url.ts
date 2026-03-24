import { headers } from "next/headers";

/**
 * Builds an absolute URL for a share path (e.g. /s/abc) for Web Share / clipboard.
 */
export async function absoluteUrlForSharePath(path: string): Promise<string> {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0]?.trim();
  const protoRaw = (h.get("x-forwarded-proto") ?? "https").split(",")[0]?.trim();
  const proto = protoRaw === "http" || protoRaw === "https" ? protoRaw : "https";
  if (host) {
    return `${proto}://${host}${normalized}`;
  }
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  if (base) {
    return `${base}${normalized}`;
  }
  return normalized;
}
