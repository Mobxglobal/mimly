"use client";

import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";
import { MemeResultsGrid } from "@/components/dashboard/meme-results-grid";

type MemeRow = {
  id: string;
  template_id: string | null;
  idea_group_id: string | null;
  title: string | null;
  format: string | null;
  top_text: string | null;
  bottom_text: string | null;
  post_caption: string | null;
  image_url: string | null;
  variant_type: string | null;
  generation_run_id: string | null;
  batch_number: number | null;
};

type Props = {
  memes: MemeRow[];
  defaultContinuationFormat: "square_image" | "square_video";
  onGenerateMore: () => void;
  onGenerateMoreImages: () => void;
  onGenerateMoreVideos: () => void;
};

function GenerateMoreButton({
  defaultContinuationFormat,
  onGenerateMoreImages,
  onGenerateMoreVideos,
}: {
  defaultContinuationFormat: "square_image" | "square_video";
  onGenerateMoreImages: () => void;
  onGenerateMoreVideos: () => void;
}) {
  const { pending } = useFormStatus();

  return (
    <div className="relative inline-flex items-stretch rounded-xl shadow-[0_10px_30px_rgba(99,102,241,0.35)]">
      <button
        type="submit"
        disabled={pending}
        className="cta-funky inline-flex items-center justify-center gap-2 rounded-l-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-80 hover:bg-indigo-400"
      >
        {pending && <LoaderCircle className="h-4 w-4 animate-spin" />}
        {pending ? "Generating more..." : "Generate more"}
      </button>
      <details className="group">
        <summary
          className="cta-funky inline-flex h-full cursor-pointer items-center justify-center rounded-r-xl border-l border-indigo-300/40 bg-indigo-500 px-2.5 text-sm text-white transition hover:bg-indigo-400"
          aria-label={`Generate more options (default: ${
            defaultContinuationFormat === "square_video" ? "videos" : "images"
          })`}
          title={`Default: ${
            defaultContinuationFormat === "square_video" ? "videos" : "images"
          }`}
        >
          ▾
        </summary>
        <div className="absolute right-0 top-[calc(100%+8px)] z-20 min-w-48 rounded-xl border border-white/10 bg-black/90 p-1 shadow-xl backdrop-blur">
          <button
            type="submit"
            formAction={onGenerateMoreImages}
            disabled={pending}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-stone-200 transition hover:bg-white/10 disabled:opacity-70"
          >
            Generate more images
          </button>
          <button
            type="submit"
            formAction={onGenerateMoreVideos}
            disabled={pending}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-stone-200 transition hover:bg-white/10 disabled:opacity-70"
          >
            Generate more videos
          </button>
        </div>
      </details>
    </div>
  );
}

function GenerateMorePendingState() {
  const { pending } = useFormStatus();

  if (!pending) {
    return null;
  }

  return (
    <div className="mt-6">
      <p className="text-sm text-stone-400">Creating more meme ideas...</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-[0_20px_60px_rgba(0,0,0,0.2)] backdrop-blur-xl"
          >
            <div className="aspect-square animate-pulse bg-gradient-to-br from-white/10 via-white/[0.04] to-transparent" />
            <div className="space-y-3 border-t border-white/10 bg-black/20 p-4">
              <div className="h-4 w-2/3 animate-pulse rounded-full bg-white/10" />
              <div className="h-3 w-full animate-pulse rounded-full bg-white/10" />
              <div className="h-3 w-5/6 animate-pulse rounded-full bg-white/10" />
              <div className="h-10 w-full animate-pulse rounded-xl bg-white/10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MemeResultsSection({
  memes,
  defaultContinuationFormat,
  onGenerateMore,
  onGenerateMoreImages,
  onGenerateMoreVideos,
}: Props) {
  return (
    <form action={onGenerateMore}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
            Your memes are ready
          </h1>
          <p className="mt-1 text-sm text-stone-400">
            Review your generated set and download the ones you want to post.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <span className="rounded-full border border-emerald-400/20 bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
            {memes.length} meme{memes.length !== 1 ? "s" : ""} generated
          </span>
          <GenerateMoreButton
            defaultContinuationFormat={defaultContinuationFormat}
            onGenerateMoreImages={onGenerateMoreImages}
            onGenerateMoreVideos={onGenerateMoreVideos}
          />
        </div>
      </div>

      <GenerateMorePendingState />
      <MemeResultsGrid memes={memes} />
    </form>
  );
}
