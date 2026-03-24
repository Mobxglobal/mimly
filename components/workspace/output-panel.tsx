"use client";

import { useRef, useState } from "react";
import {
  createOrGetShareLinkForWorkspaceOutput,
  type WorkspaceJob,
  type WorkspaceOutput,
} from "@/lib/actions/workspace";
import { getVerticalSlideshowImageUrls } from "@/lib/share/vertical-slideshow-urls";
import { BlockedAuthCard } from "@/components/workspace/blocked-auth-card";
import { BlockedPaymentCard } from "@/components/workspace/blocked-payment-card";
import canvas2Background from "@/assets/canvas2.jpg";
import pinIcon from "@/assets/icons/pin.png";

type ShareOutputState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "copied" }
  | { kind: "error"; message?: string };

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

function slideshowUrlsForOutput(output: WorkspaceOutput): string[] {
  const meta =
    output.variant_metadata && typeof output.variant_metadata === "object"
      ? (output.variant_metadata as Record<string, unknown>)
      : null;
  return getVerticalSlideshowImageUrls(meta);
}

export function OutputPanel({
  latestJob,
  outputs,
  workspaceId,
  pinnedCount,
  gateState,
  onTogglePin,
  onDeleteOutput,
  onPlanUnlocked,
}: {
  latestJob: WorkspaceJob | null;
  outputs: WorkspaceOutput[];
  workspaceId: string;
  pinnedCount: number;
  gateState: "anonymous_blocked" | "authenticated_plan_required" | "unlocked";
  onTogglePin?: (outputId: string, shouldPin: boolean) => void | Promise<void>;
  onDeleteOutput?: (outputId: string) => void | Promise<void>;
  onPlanUnlocked?: () => void | Promise<void>;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [shareByOutput, setShareByOutput] = useState<Record<string, ShareOutputState>>({});
  const slideTrackRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [zoomedSlideshow, setZoomedSlideshow] = useState<{
    outputId: string;
    slideUrls: string[];
    index: number;
  } | null>(null);
  const [zoomedOutput, setZoomedOutput] = useState<{
    url: string;
    mediaType: "video" | "image";
  } | null>(null);

  async function handleShareOutput(output: WorkspaceOutput) {
    const id = output.id;
    setShareByOutput((prev) => ({ ...prev, [id]: { kind: "loading" } }));

    const result = await createOrGetShareLinkForWorkspaceOutput(workspaceId, id);
    if (result.error) {
      setShareByOutput((prev) => ({
        ...prev,
        [id]: { kind: "error", message: result.error ?? undefined },
      }));
      setTimeout(() => {
        setShareByOutput((prev) => ({ ...prev, [id]: { kind: "idle" } }));
      }, 2800);
      return;
    }

    const shareUrl = result.url?.trim() ?? "";
    if (!shareUrl) {
      setShareByOutput((prev) => ({
        ...prev,
        [id]: { kind: "error", message: "Could not create a share link." },
      }));
      setTimeout(() => {
        setShareByOutput((prev) => ({ ...prev, [id]: { kind: "idle" } }));
      }, 2800);
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareByOutput((prev) => ({ ...prev, [id]: { kind: "copied" } }));
      setTimeout(() => {
        setShareByOutput((prev) => ({ ...prev, [id]: { kind: "idle" } }));
      }, 2000);
    } catch {
      setShareByOutput((prev) => ({
        ...prev,
        [id]: { kind: "error", message: "Could not copy link." },
      }));
      setTimeout(() => {
        setShareByOutput((prev) => ({ ...prev, [id]: { kind: "idle" } }));
      }, 2800);
    }
  }

  function scrollSlideshow(outputId: string, direction: "prev" | "next") {
    const track = slideTrackRefs.current[outputId];
    if (!track) return;
    const card = track.querySelector("[data-slide-card='true']") as HTMLElement | null;
    const step = card?.offsetWidth ? card.offsetWidth + 8 : Math.round(track.clientWidth * 0.8);
    const delta = direction === "next" ? step : -step;
    track.scrollBy({ left: delta, behavior: "smooth" });
  }

  async function handleDownloadAllSlides(
    slideUrls: string[],
    outputId: string
  ): Promise<void> {
    if (slideUrls.length === 0) return;
    setNotice("Preparing zip download...");
    try {
      const response = await fetch(
        `/api/workspace/slideshow-zip?workspaceId=${encodeURIComponent(
          workspaceId
        )}&outputId=${encodeURIComponent(outputId)}`,
        { method: "GET" }
      );
      if (!response.ok) {
        const message = await response.text().catch(() => "");
        throw new Error(message || "Could not create zip download.");
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `mimly-${outputId}-slides.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);

      setNotice(`Downloaded ${slideUrls.length} slides as zip.`);
      setTimeout(() => setNotice(null), 1800);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not download slides."
      );
      setTimeout(() => setNotice(null), 2200);
    }
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
          const slideshowSlideUrls = slideshowUrlsForOutput(output);
          const isSlideshow = slideshowSlideUrls.length > 0;
          const mediaType = url ? mediaTypeFromUrl(url) : "image";
          const shareState = shareByOutput[output.id] ?? { kind: "idle" as const };
          const shareLabel =
            shareState.kind === "loading"
              ? "…"
              : shareState.kind === "copied"
                ? "Copied!"
                : shareState.kind === "error"
                  ? shareState.message?.toLowerCase().includes("sign in")
                    ? "Sign in to share"
                    : "Couldn't share"
                  : "Share";
          const shareButtonClass =
            shareState.kind === "idle"
              ? "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
              : shareState.kind === "loading"
                ? "cursor-wait border-stone-200 bg-stone-50 text-stone-400"
                : shareState.kind === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800";
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
                        className="min-w-[82%] snap-start overflow-hidden rounded-xl border border-stone-200 bg-stone-100 sm:min-w-[68%]"
                      >
                        <div className="aspect-[9/16]">
                          <button
                            type="button"
                            onClick={() =>
                              setZoomedSlideshow({
                                outputId: output.id,
                                slideUrls: slideshowSlideUrls,
                                index: slideIndex,
                              })
                            }
                            className="h-full w-full"
                            title="Open slide"
                          >
                            <img
                              src={slideUrl}
                              alt={`Slide ${slideIndex + 1}`}
                              className="h-full w-full object-cover transition hover:scale-[1.01]"
                            />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="relative aspect-square bg-stone-100">
                  {url ? (
                    mediaType === "video" ? (
                      <>
                        <video src={url} controls className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() =>
                            setZoomedOutput({
                              url,
                              mediaType,
                            })
                          }
                          className="absolute right-2 top-2 rounded-full border border-white/70 bg-black/45 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm transition hover:bg-black/60"
                          title="Open fullscreen"
                        >
                          Zoom
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setZoomedOutput({
                            url,
                            mediaType,
                          })
                        }
                        className="h-full w-full"
                        title="Open fullscreen"
                      >
                        <img src={url} alt={output.title ?? "Generated output"} className="h-full w-full object-cover transition hover:scale-[1.01]" />
                      </button>
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
                  {isSlideshow ? (
                    <button
                      type="button"
                      onClick={() =>
                        void handleDownloadAllSlides(slideshowSlideUrls, output.id)
                      }
                      className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-medium text-stone-700 transition hover:bg-stone-100"
                    >
                      Download slides
                    </button>
                  ) : (
                    <a
                      href={url || "#"}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-medium text-stone-700 transition hover:bg-stone-100"
                    >
                      Download
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={shareState.kind === "loading"}
                    aria-busy={shareState.kind === "loading"}
                    title={
                      shareState.kind === "error" && shareState.message
                        ? shareState.message
                        : undefined
                    }
                    onClick={() => void handleShareOutput(output)}
                    className={`inline-flex min-w-[5.25rem] items-center justify-center rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${shareButtonClass}`}
                  >
                    {shareLabel}
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
                  <button
                    type="button"
                    onClick={async () => {
                      if (!onDeleteOutput) return;
                      const confirmed = window.confirm(
                        "Delete this result from your workspace?"
                      );
                      if (!confirmed) return;
                      await onDeleteOutput(output.id);
                    }}
                    aria-label="Delete output"
                    title="Delete output"
                    className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-medium text-rose-700 transition hover:bg-rose-50"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6M14 11v6" />
                    </svg>
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {zoomedSlideshow ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4"
          onClick={() => setZoomedSlideshow(null)}
        >
          <div
            className="relative w-full max-w-3xl rounded-2xl border border-white/20 bg-black/30 p-3 backdrop-blur"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between text-xs text-white/80">
              <span>
                Slide {zoomedSlideshow.index + 1} of {zoomedSlideshow.slideUrls.length}
              </span>
              <button
                type="button"
                onClick={() => setZoomedSlideshow(null)}
                className="rounded-full border border-white/30 px-2 py-0.5 text-white transition hover:bg-white/10"
              >
                Close
              </button>
            </div>
            <div className="relative mx-auto max-h-[82vh] max-w-[68vh] overflow-hidden rounded-xl border border-white/20 bg-black">
              <img
                src={zoomedSlideshow.slideUrls[zoomedSlideshow.index] ?? ""}
                alt={`Zoomed slide ${zoomedSlideshow.index + 1}`}
                className="h-full w-full object-contain"
              />
            </div>
            <div className="mt-3 flex items-center justify-center gap-2">
              <button
                type="button"
                disabled={zoomedSlideshow.index <= 0}
                onClick={() =>
                  setZoomedSlideshow((current) =>
                    current
                      ? { ...current, index: Math.max(0, current.index - 1) }
                      : current
                  )
                }
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/30 text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ←
              </button>
              <button
                type="button"
                disabled={zoomedSlideshow.index >= zoomedSlideshow.slideUrls.length - 1}
                onClick={() =>
                  setZoomedSlideshow((current) =>
                    current
                      ? {
                          ...current,
                          index: Math.min(
                            current.slideUrls.length - 1,
                            current.index + 1
                          ),
                        }
                      : current
                  )
                }
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/30 text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                →
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {zoomedOutput ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4"
          onClick={() => setZoomedOutput(null)}
        >
          <div
            className="relative w-full max-w-4xl rounded-2xl border border-white/20 bg-black/30 p-3 backdrop-blur"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-end text-xs text-white/80">
              <button
                type="button"
                onClick={() => setZoomedOutput(null)}
                className="rounded-full border border-white/30 px-2 py-0.5 text-white transition hover:bg-white/10"
              >
                Close
              </button>
            </div>
            <div className="relative mx-auto max-h-[84vh] overflow-hidden rounded-xl border border-white/20 bg-black">
              {zoomedOutput.mediaType === "video" ? (
                <video
                  src={zoomedOutput.url}
                  controls
                  autoPlay
                  className="max-h-[80vh] w-full object-contain"
                />
              ) : (
                <img
                  src={zoomedOutput.url}
                  alt="Zoomed output"
                  className="max-h-[80vh] w-full object-contain"
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
