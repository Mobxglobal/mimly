"use client";

import { useState } from "react";
import type { WorkspaceJob, WorkspaceOutput } from "@/lib/actions/workspace";
import { BlockedAuthCard } from "@/components/workspace/blocked-auth-card";
import { BlockedPaymentCard } from "@/components/workspace/blocked-payment-card";

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

export function OutputPanel({
  latestJob,
  outputs,
  workspaceId,
  gateState,
  onPlanUnlocked,
}: {
  latestJob: WorkspaceJob | null;
  outputs: WorkspaceOutput[];
  workspaceId: string;
  gateState: "anonymous_blocked" | "authenticated_plan_required" | "unlocked";
  onPlanUnlocked?: () => void | Promise<void>;
}) {
  const [notice, setNotice] = useState<string | null>(null);

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

  if (!latestJob) {
    return (
      <div className="flex min-h-[66vh] items-center justify-center rounded-3xl border border-stone-200 bg-stone-50 p-6 text-sm text-stone-500">
        Waiting for your first generation request.
      </div>
    );
  }

  if ((latestJob.status === "queued" || latestJob.status === "running") && outputs.length === 0) {
    return (
      <div className="flex min-h-[66vh] items-center justify-center rounded-3xl border border-stone-200 bg-stone-50 p-6 text-center text-sm text-stone-600">
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
        className="relative flex min-h-[66vh] items-center justify-center overflow-hidden rounded-3xl border border-stone-200 p-6"
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
      <div className="flex min-h-[66vh] items-center justify-center rounded-3xl border border-stone-200 bg-stone-50 p-6">
        <div className="w-full max-w-xl">
          <BlockedPaymentCard workspaceId={workspaceId} onUnlocked={onPlanUnlocked} />
        </div>
      </div>
    );
  }

  if (latestJob.status === "failed") {
    return (
      <div className="flex min-h-[66vh] items-center justify-center rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
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
      <div className="flex min-h-[66vh] items-center justify-center rounded-3xl border border-stone-200 bg-stone-50 p-6 text-sm text-stone-500">
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
          const mediaType = url ? mediaTypeFromUrl(url) : "image";
          return (
            <article
              key={output.id}
              className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_8px_22px_rgba(16,24,40,0.06)]"
            >
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
                    onClick={() =>
                      copyText(
                        `Remix this direction: ${output.title ?? "Untitled output"} (${url || "no media url"})`,
                        "Remix prompt copied."
                      )
                    }
                    className="rounded-full border border-sky-200 bg-sky-50/70 px-2.5 py-1 text-[11px] font-medium text-sky-700 transition hover:bg-sky-100"
                  >
                    Remix
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
