"use client";

import { useRef, useState } from "react";
import type { WorkspaceJob, WorkspaceOutput } from "@/lib/actions/workspace";
import { BlockedAuthCard } from "@/components/workspace/blocked-auth-card";
import { BlockedPaymentCard } from "@/components/workspace/blocked-payment-card";
import canvas2Background from "@/assets/canvas2.jpg";
import pinIcon from "@/assets/icons/pin.png";

function mediaTypeFromUrl(url: string): "video" | "image" {
  return /\.(mp4|webm|m4v)(\?|#|$)/i.test(url) ? "video" : "image";
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(d);
}

type SlideshowMetaSlide = {
  image_url?: unknown;
};

function getSlideshowSlideUrls(output: WorkspaceOutput): string[] {
  const meta =
    output.variant_metadata && typeof output.variant_metadata === "object"
      ? (output.variant_metadata as Record<string, unknown>)
      : null;
  if (!meta) return [];
  const outputFormat = String(meta.output_format ?? "").trim().toLowerCase();
  if (outputFormat !== "vertical_slideshow") return [];

  const slides = Array.isArray(meta.slides)
    ? (meta.slides as SlideshowMetaSlide[])
    : [];
  return slides
    .map((slide) =>
      slide && typeof slide === "object"
        ? String(slide.image_url ?? "").trim()
        : ""
    )
    .filter(Boolean);
}

export function OutputPanel({
  latestJob,
  outputs,
  workspaceId,
  pinnedCount,
  gateState,
  onTogglePin,
  onPlanUnlocked,
}: {
  latestJob: WorkspaceJob | null;
  outputs: WorkspaceOutput[];
  workspaceId: string;
  pinnedCount: number;
  gateState: "anonymous_blocked" | "authenticated_plan_required" | "unlocked";
  onTogglePin?: (outputId: string, shouldPin: boolean) => void | Promise<void>;
  onPlanUnlocked?: () => void | Promise<void>;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const slideTrackRefs = useRef<Record<string, HTMLDivElement | null>>({});

  async function copyText(value: string, successText: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(successText);
      setTimeout(() => setNotice(null), 1600);
    } catch {
      setNotice("Could not copy right now.");
      setTimeout(() => setNotice(null), 1600);
    }
  }

  async function handleShare(url: string, title: string) {
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Fall through to clipboard fallback.
      }
    }
    await copyText(url, "Link copied.");
  }

  function scrollSlideshow(outputId: string, direction: "prev" | "next") {
    const track = slideTrackRefs.current[outputId];
    if (!track) return;
    const card = track.querySelector("[data-slide-card='true']") as HTMLElement | null;
    const step = card?.offsetWidth ? card.offsetWidth + 8 : Math.round(track.clientWidth * 0.8);
    const delta = direction === "next" ? step : -step;
    track.scrollBy({ left: delta, behavior: "smooth" });
  }

  if (!latestJob) {
    return (
      <div className="flex min-h-[44vh] items-center justify-center rounded-3xl border border-stone-200 bg-stone-50 p-5 text-sm text-stone-500 sm:min-h-[52vh] lg:min-h-[66vh]">
        Waiting for your first generation request.
      </div>
    );
  }

  if ((latestJob.status === "queued" || latestJob.status === "running") && outputs.length === 0) {
    return (
      <div className="flex min-h-[44vh] items-center justify-center rounded-3xl border border-stone-200 bg-stone-50 p-5 text-center text-sm text-stone-600 sm:min-h-[52vh] lg:min-h-[66vh]">
        <div className="max-w-md">
          <div className="relative mx-auto mb-5 h-14 w-14">
            <div className="absolute inset-0 rounded-full border border-sky-200/70 bg-sky-100/30 animate-pulse" />
            <div className="absolute inset-1 rounded-full border border-sky-300/80 bg-white/80" />
            <div className="absolute inset-[14px] rounded-full bg-gradient-to-b from-sky-400 to-indigo-400 opacity-90 animate-pulse" />
          </div>
          <p className="text-2xl font-semibold tracking-tight text-stone-800">
            I&apos;m generating some ideas for you.
          </p>
          <p className="mt-2 text-stone-500">
            Once they&apos;re in, we can refine the tone and generate more formats.
          </p>
        </div>
      </div>
    );
  }

  const isGenerating = latestJob.status === "queued" || latestJob.status === "running";

  if (gateState === "anonymous_blocked") {
    return (
      <div
        className="relative flex min-h-[44vh] items-center justify-center overflow-hidden rounded-3xl border border-stone-200 p-5 sm:min-h-[52vh] lg:min-h-[66vh] lg:p-6"
        style={{
          backgroundImage: "url('/assets/canvas.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="relative w-full max-w-xl">
          <BlockedAuthCard />
        </div>
      </div>
    );
  }

  if (gateState === "authenticated_plan_required") {
    return (
      <div
        className="relative flex min-h-[44vh] items-center justify-center overflow-hidden rounded-3xl border border-stone-200 p-5 sm:min-h-[52vh] lg:min-h-[66vh] lg:p-6"
        style={{
          backgroundImage: `url('${canvas2Background.src}')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="relative w-full max-w-xl">
          <BlockedPaymentCard workspaceId={workspaceId} onUnlocked={onPlanUnlocked} />
        </div>
      </div>
    );
  }

  if (latestJob.status === "failed") {
    return (
      <div className="flex min-h-[44vh] items-center justify-center rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700 sm:min-h-[52vh] lg:min-h-[66vh] lg:p-6">
        <div className="max-w-xl text-center">
          <p className="text-base font-semibold">Generation failed</p>
          <p className="mt-1 text-rose-700/90">
            {latestJob.error_message ?? "Please try again."}
          </p>
        </div>
      </div>
    );
  }

  if (outputs.length === 0) {
    return (
      <div className="flex min-h-[44vh] items-center justify-center rounded-3xl border border-stone-200 bg-stone-50 p-5 text-sm text-stone-500 sm:min-h-[52vh] lg:min-h-[66vh] lg:p-6">
        <div className="max-w-xl text-center">
          <p className="font-semibold text-stone-800">Generation completed.</p>
          <p className="mt-1">No outputs were linked to this job.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {isGenerating ? (
        <p className="mb-4 text-xs text-sky-700">
          Creating more options now. New outputs will appear below.
        </p>
      ) : (
        <p className="mb-4 text-xs text-stone-500">
          Latest completed: {formatDateTime(latestJob.completed_at) || "just now"}
        </p>
      )}
      {notice ? (
        <p className="mb-3 text-xs font-medium text-stone-600">{notice}</p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {outputs.map((output) => {
          const url = output.image_url?.trim() ?? "";
          const slideshowSlideUrls = getSlideshowSlideUrls(output);
          const isSlideshow = slideshowSlideUrls.length > 0;
          const mediaType = url ? mediaTypeFromUrl(url) : "image";
          return (
            <article
              key={output.id}
              className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_8px_22px_rgba(16,24,40,0.06)]"
            >
              {isSlideshow ? (
                <div className="space-y-2 p-2.5">
                  <div className="flex items-center justify-between px-0.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-stone-500">
                      Slideshow
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] text-stone-500">
                        {slideshowSlideUrls.length} slides
                      </p>
                      <button
                        type="button"
                        aria-label="Previous slide"
                        onClick={() => scrollSlideshow(output.id, "prev")}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 transition hover:bg-stone-50"
                      >
                        <span className="text-xs leading-none">←</span>
                      </button>
                      <button
                        type="button"
                        aria-label="Next slide"
                        onClick={() => scrollSlideshow(output.id, "next")}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 transition hover:bg-stone-50"
                      >
                        <span className="text-xs leading-none">→</span>
                      </button>
                    </div>
                  </div>
                  <p className="px-0.5 text-[10px] text-stone-400">Swipe or use arrows</p>
                  <div
                    ref={(el) => {
                      slideTrackRefs.current[output.id] = el;
                    }}
                    className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1"
                  >
                    {slideshowSlideUrls.map((slideUrl, slideIndex) => (
                      <div
                        key={`${output.id}-slide-${slideIndex}`}
                        data-slide-card="true"
                        className="min-w-[72%] snap-start overflow-hidden rounded-xl border border-stone-200 bg-stone-100 sm:min-w-[58%]"
                      >
                        <div className="aspect-[9/16]">
                          <img
                            src={slideUrl}
                            alt={`Slide ${slideIndex + 1}`}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="aspect-square bg-stone-100">
                  {url ? (
                    mediaType === "video" ? (
                      <video src={url} controls className="h-full w-full object-cover" />
                    ) : (
                      <img src={url} alt={output.title ?? "Generated output"} className="h-full w-full object-cover" />
                    )
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-stone-500">
                      No media preview
                    </div>
                  )}
                </div>
              )}
              <div className="p-3.5">
                <div className="flex flex-wrap gap-2">
                  <a
                    href={url || "#"}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-medium text-stone-700 transition hover:bg-stone-100"
                  >
                    Download
                  </a>
                  <button
                    type="button"
                    onClick={() =>
                      void handleShare(url, output.title ?? "Mimly output")
                    }
                    className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-700 transition hover:bg-stone-50"
                  >
                    Share
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!onTogglePin) return;
                      const shouldPin = !output.is_pinned;
                      if (shouldPin && pinnedCount >= 3) {
                        setNotice("You can pin up to 3 templates.");
                        setTimeout(() => setNotice(null), 1800);
                        return;
                      }
                      await onTogglePin(output.id, shouldPin);
                    }}
                    aria-label={output.is_pinned ? "Unpin template" : "Pin template"}
                    title={output.is_pinned ? "Unpin template" : "Pin template"}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                      output.is_pinned
                        ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                        : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                    }`}
                  >
                    <img
                      src={pinIcon.src}
                      alt=""
                      className={`h-3.5 w-3.5 object-contain ${
                        output.is_pinned ? "opacity-100" : "opacity-80"
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
