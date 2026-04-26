"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { generateMockMemes } from "@/lib/actions/memes";
import { generateContentPackBatch } from "@/lib/actions/content-pack";

const inflightGenerationRuns = new Map<
  string,
  Promise<{ error: string | null }>
>();

const inflightContentPackBatches = new Map<
  string,
  Promise<{ error: string | null; packRunId?: string }>
>();

type OutputFormat = "square_image" | "square_video" | "square_text";

function parseContentPackBatch(raw: string | null): 1 | 2 | 3 {
  if (raw === "2") return 2;
  if (raw === "3") return 3;
  return 1;
}

export default function GeneratingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  const mode = searchParams.get("mode");
  const isContentPack = mode === "content_pack";
  const cpBatch = parseContentPackBatch(searchParams.get("batch"));

  const promotion = searchParams.get("promotion");
  const formatParam = searchParams.get("format");
  const format: OutputFormat =
    formatParam === "square_video"
      ? "square_video"
      : formatParam === "square_text"
        ? "square_text"
        : "square_image";
  const hasPromotion = Boolean(promotion?.trim());
  const generationKey = `format:${format}|promotion:${promotion?.trim() ?? "__none__"}`;
  const contentPackKey = `batch:${cpBatch}`;

  useEffect(() => {
    if (isContentPack) return;
    let cancelled = false;

    (async () => {
      const existingRun = inflightGenerationRuns.get(generationKey);
      const runPromise =
        existingRun ??
        generateMockMemes(promotion ?? undefined, {
          outputFormat: format,
        }).finally(() => {
          inflightGenerationRuns.delete(generationKey);
        });

      if (!existingRun) {
        inflightGenerationRuns.set(generationKey, runPromise);
      }

      const { error: err } = await runPromise;
      if (cancelled) return;
      if (err) {
        setError(err);
        return;
      }
      router.replace("/dashboard/memes");
    })();

    return () => {
      cancelled = true;
    };
  }, [format, generationKey, router, promotion, isContentPack]);

  useEffect(() => {
    if (!isContentPack) return;
    let cancelled = false;

    (async () => {
      const existing = inflightContentPackBatches.get(contentPackKey);
      const runPromise =
        existing ??
        generateContentPackBatch(cpBatch).finally(() => {
          inflightContentPackBatches.delete(contentPackKey);
        });

      if (!existing) {
        inflightContentPackBatches.set(contentPackKey, runPromise);
      }

      const { error: err, packRunId } = await runPromise;
      if (cancelled) return;
      if (err) {
        setError(err);
        return;
      }
      if (!packRunId) {
        setError("Content pack run id missing. Please try again.");
        return;
      }
      router.replace(
        `/dashboard/content-pack?run=${encodeURIComponent(packRunId)}&batch=${cpBatch}`
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [isContentPack, contentPackKey, cpBatch, router]);

  const packFooter =
    cpBatch === 1
      ? "Creating the first 12 posts in your 36-post test pack now."
      : cpBatch === 2
        ? "Creating the next 12 posts in your 36-post test pack now."
        : "Creating the final 12 posts in your 36-post test pack now.";

  return (
    <DashboardShell>
      <div className="mx-auto flex min-h-[70vh] w-full max-w-3xl items-center justify-center">
        <div className="w-full rounded-[28px] border border-white/10 bg-white/[0.04] p-8 text-center shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:p-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-indigo-400/20 bg-indigo-500/10 text-indigo-300">
            <LoaderCircle className="h-8 w-8 animate-spin" />
          </div>

          {isContentPack ? (
            <>
              <h1 className="mt-6 text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Creating your content pack
              </h1>
              <p className="mt-3 text-sm text-stone-400 sm:text-base">
                We&apos;re generating a custom mix of memes, videos, and text posts
                for your brand.
              </p>
              <p className="mt-1 text-sm text-stone-500">
                We&apos;re also preparing caption suggestions so everything is
                ready for social media.
              </p>

              <div className="mx-auto mt-8 max-w-md">
                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-indigo-500 via-sky-400 to-emerald-400" />
                </div>
                <p className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-stone-500">
                  BUILDING YOUR CONTENT PACK
                </p>
              </div>

              {error && (
                <div className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-500/[0.08] p-4 text-sm text-rose-300">
                  {error}
                </div>
              )}

              <p className="mt-8 text-xs text-stone-500">{packFooter}</p>
            </>
          ) : (
            <>
              <h1 className="mt-6 text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Generating your memes
              </h1>
              <p className="mt-3 text-sm text-stone-400 sm:text-base">
                We&apos;re creating your meme set now.
              </p>
              <p className="mt-1 text-sm text-stone-500">
                This usually only takes a moment.
              </p>

              <div className="mx-auto mt-8 max-w-md">
                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-indigo-500 via-sky-400 to-emerald-400" />
                </div>
                <p className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-stone-500">
                  Building your first batch...
                </p>
              </div>

              {error && (
                <div className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-500/[0.08] p-4 text-sm text-rose-300">
                  {error}
                </div>
              )}

              <p className="mt-8 text-xs text-stone-500">
                {hasPromotion
                  ? "Using your promotion where it improves the meme."
                  : format === "square_text"
                    ? "Generating your square text meme set now."
                    : `Generating a ${format === "square_video" ? "video" : "brand-led"} set for you now.`}
              </p>
            </>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
