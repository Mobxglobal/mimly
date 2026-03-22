"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { startContentPackUnlockCheckout } from "@/lib/actions/content-pack-unlock";
import {
  DownloadMemeButton,
  DownloadSlideshowButton,
} from "@/components/dashboard/download-meme-button";

type MemeRow = {
  id: string;
  title: string | null;
  format: string | null;
  top_text: string | null;
  bottom_text: string | null;
  post_caption: string | null;
  image_url: string | null;
  variant_metadata?: unknown;
};

function getOutputFormat(m: MemeRow): string {
  const raw = m.variant_metadata;
  if (!raw || typeof raw !== "object") return "square_image";
  const r = raw as Record<string, unknown>;
  const o = String(r.output_format ?? r.requested_output_format ?? "")
    .trim()
    .toLowerCase();
  if (
    o === "square_video" ||
    o === "vertical_slideshow" ||
    o === "square_text"
  ) {
    return o;
  }
  if (r.media_type === "slideshow") return "vertical_slideshow";
  if (r.media_type === "video") return "square_video";
  if (o === "square_image" || r.media_type === "image") return "square_image";
  if (m.image_url && /\.(mp4|webm|m4v)(\?|#|$)/i.test(m.image_url))
    return "square_video";
  return "square_image";
}

function interleaveContentPackMemes(memes: MemeRow[]): MemeRow[] {
  const buckets: Record<string, MemeRow[]> = {
    square_image: [],
    square_video: [],
    vertical_slideshow: [],
    square_text: [],
  };
  for (const m of memes) {
    const f = getOutputFormat(m);
    if (buckets[f]) buckets[f].push(m);
    else buckets.square_image.push(m);
  }
  const order = [
    "square_image",
    "square_video",
    "vertical_slideshow",
    "square_text",
  ] as const;
  const out: MemeRow[] = [];
  for (let wave = 0; wave < 3; wave++) {
    for (const f of order) {
      const b = buckets[f];
      if (b[wave]) out.push(b[wave]);
    }
  }
  for (const m of memes) {
    if (!out.includes(m)) out.push(m);
  }
  return out;
}

function getSlideshowFirstSlideUrl(m: MemeRow): string | null {
  const raw = m.variant_metadata;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.media_type !== "slideshow") return null;
  const slides = r.slides;
  if (!Array.isArray(slides) || slides.length === 0) return null;
  const first = slides[0] as Record<string, unknown>;
  const url = String(first?.image_url ?? "").trim();
  return url || null;
}

function getSlideshowSlidesForDownload(m: MemeRow): { image_url: string }[] {
  const raw = m.variant_metadata;
  if (!raw || typeof raw !== "object") return [];
  const r = raw as Record<string, unknown>;
  const slides = r.slides;
  if (!Array.isArray(slides)) return [];
  const out: { image_url: string }[] = [];
  for (const s of slides) {
    if (!s || typeof s !== "object") continue;
    const url = String((s as { image_url?: unknown }).image_url ?? "").trim();
    if (url) out.push({ image_url: url });
  }
  return out;
}

function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.(mp4|webm|m4v)(\?|#|$)/i.test(url);
}

const DL_CLASS =
  "cta-funky inline-flex items-center justify-center rounded-xl bg-indigo-500 px-3 py-2 text-xs font-medium text-white shadow-[0_10px_30px_rgba(99,102,241,0.35)] hover:bg-indigo-400";

type Props = {
  memes: MemeRow[];
  batch: 1 | 2 | 3;
  packUnlocked: boolean;
  summaryHeading: string;
  summarySubtext: string;
  postsProgressLabel: string;
};

export function ContentPackBatchPreview({
  memes,
  batch,
  packUnlocked,
  summaryHeading,
  summarySubtext,
  postsProgressLabel,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const ordered = interleaveContentPackMemes(memes);

  async function handleUnlock() {
    setErr(null);
    start(async () => {
      const res = await startContentPackUnlockCheckout();
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
        return;
      }
      router.refresh();
    });
  }

  const showNext =
    packUnlocked && batch < 3 ? (
      <Link
        href={`/dashboard/generating?mode=content_pack&batch=${batch + 1}`}
        className="cta-funky inline-flex items-center justify-center rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white shadow-[0_10px_30px_rgba(99,102,241,0.35)] hover:bg-indigo-400"
      >
        Generate next batch
      </Link>
    ) : null;

  const completedPack =
    packUnlocked && batch >= 3 ? (
      <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center">
        <h2 className="text-xl font-semibold text-white">
          Your content pack is complete
        </h2>
        <p className="mt-2 text-sm text-stone-400">
          All 36 posts are now ready.
        </p>
      </div>
    ) : null;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          {summaryHeading}
        </h1>
        <p className="mt-2 text-sm text-stone-400 sm:text-base">
          {summarySubtext}
        </p>
        <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-stone-500">
          {postsProgressLabel}
        </p>
      </div>

      {!packUnlocked && (
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <button
              type="button"
              disabled={pending}
              onClick={() => void handleUnlock()}
              className="cta-funky inline-flex items-center justify-center rounded-xl bg-indigo-500 px-5 py-3 text-sm font-medium text-white shadow-[0_10px_30px_rgba(99,102,241,0.35)] hover:bg-indigo-400 disabled:opacity-60"
            >
              Unlock your content pack
            </button>
            <p className="mt-2 text-xs text-stone-500">
              One-time payment. No subscription.
            </p>
          </div>
        </div>
      )}

      {err && (
        <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/[0.08] px-4 py-3 text-sm text-rose-300">
          {err}
        </div>
      )}

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((m, index) => {
          const locked = !packUnlocked && index > 0;
          const fmt = getOutputFormat(m);
          const slideUrl = getSlideshowFirstSlideUrl(m);
          const thumb = slideUrl ?? m.image_url;
          const video = isVideoUrl(m.image_url);

          return (
            <div
              key={m.id}
              className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-[0_20px_60px_rgba(0,0,0,0.28)]"
            >
              <div className="relative aspect-square bg-black/30">
                {fmt === "vertical_slideshow" && thumb ? (
                  <>
                    <img
                      src={thumb}
                      alt=""
                      className={
                        locked
                          ? "h-full w-full object-cover blur-sm brightness-[0.45]"
                          : "h-full w-full object-cover"
                      }
                    />
                    <span className="absolute left-2 top-2 rounded-full border border-white/15 bg-black/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-200">
                      Slideshow
                    </span>
                  </>
                ) : fmt === "square_text" ? (
                  <div
                    className={
                      locked
                        ? "flex h-full flex-col justify-center p-4 blur-sm brightness-[0.45]"
                        : "flex h-full flex-col justify-center p-4"
                    }
                  >
                    <p className="line-clamp-4 text-sm font-medium text-white">
                      {m.top_text ?? m.title ?? "Text post"}
                    </p>
                  </div>
                ) : thumb ? (
                  video ? (
                    <video
                      src={m.image_url ?? ""}
                      className={
                        locked
                          ? "h-full w-full object-cover blur-sm brightness-[0.45]"
                          : "h-full w-full object-cover"
                      }
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img
                      src={thumb}
                      alt=""
                      className={
                        locked
                          ? "h-full w-full object-cover blur-sm brightness-[0.45]"
                          : "h-full w-full object-cover"
                      }
                    />
                  )
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-stone-500">
                    Preview
                  </div>
                )}

                {locked && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void handleUnlock()}
                    className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/55 text-white backdrop-blur-[2px]"
                  >
                    <Lock className="h-6 w-6 text-indigo-200" />
                    <span className="text-sm font-semibold">Unlock</span>
                  </button>
                )}
              </div>

              {!locked && (
                <div className="space-y-2 border-t border-white/10 p-3">
                  <p className="line-clamp-2 text-xs text-stone-300">
                    {m.post_caption ?? m.title ?? "Caption"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {fmt === "vertical_slideshow" ? (
                      <DownloadSlideshowButton
                        slides={getSlideshowSlidesForDownload(m)}
                        baseFilename={m.id}
                        className={DL_CLASS}
                      />
                    ) : (
                      <DownloadMemeButton
                        imageUrl={m.image_url ?? null}
                        fallbackHref="/dashboard/memes"
                        downloadFilename={`${m.id}.${isVideoUrl(m.image_url) ? "mp4" : "png"}`}
                        className={DL_CLASS}
                      >
                        Download
                      </DownloadMemeButton>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {packUnlocked && (
        <div className="mt-10 flex flex-wrap gap-3">
          {showNext}
          <Link
            href="/dashboard/memes"
            className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-stone-200 hover:bg-white/[0.1]"
          >
            View all in Memes
          </Link>
        </div>
      )}

      {completedPack}
    </div>
  );
}
