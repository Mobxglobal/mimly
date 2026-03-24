import type { Metadata } from "next";
import { PublicShareViewer } from "@/components/share/public-share-viewer";
import {
  loadPublicSharePayload,
  type PublicShareErrorReason,
} from "@/lib/share/load-public-share";

export const metadata: Metadata = {
  title: "Shared on Mimly",
  description: "View shared content from Mimly.",
  robots: { index: false, follow: false },
};

function errorCopy(reason: PublicShareErrorReason): string {
  switch (reason) {
    case "missing":
      return "This link is invalid or incomplete.";
    case "revoked":
      return "This share link is no longer available.";
    case "expired":
      return "This share link has expired.";
    case "not_found":
      return "This content is no longer available.";
    case "unavailable":
      return "This content could not be loaded.";
    default:
      return "Something went wrong.";
  }
}

export default async function PublicSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const payload = await loadPublicSharePayload(token);

  if (!payload.ok) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-stone-100 px-6 text-center">
        <p className="max-w-sm text-sm text-stone-700">{errorCopy(payload.reason)}</p>
        <p className="mt-8 text-[11px] font-medium tracking-wide text-stone-400">Mimly</p>
      </div>
    );
  }

  return (
    <PublicShareViewer
      slideshowUrls={payload.slideshowUrls}
      mediaUrl={payload.mediaUrl}
      mediaType={payload.mediaType}
    />
  );
}
