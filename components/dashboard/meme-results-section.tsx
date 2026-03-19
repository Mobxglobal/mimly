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
  onGenerateMore: () => void;
};

function GenerateMoreButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="cta-funky inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white shadow-[0_10px_30px_rgba(99,102,241,0.35)] transition disabled:cursor-not-allowed disabled:opacity-80 hover:bg-indigo-400"
    >
      {pending && <LoaderCircle className="h-4 w-4 animate-spin" />}
      {pending ? "Generating more..." : "Generate more"}
    </button>
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

export function MemeResultsSection({ memes, onGenerateMore }: Props) {
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
          <GenerateMoreButton />
        </div>
      </div>

      <GenerateMorePendingState />
      <MemeResultsGrid memes={memes} />
    </form>
  );
}
