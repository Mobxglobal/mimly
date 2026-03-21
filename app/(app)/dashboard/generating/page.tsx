"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { generateMockMemes } from "@/lib/actions/memes";

const inflightGenerationRuns = new Map<string, Promise<{ error: string | null }>>();
type OutputFormat = "square_image" | "square_video" | "vertical_short";

export default function GeneratingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const promotion = searchParams.get("promotion");
  const formatParam = searchParams.get("format");
  const format: OutputFormat =
    formatParam === "square_video"
      ? "square_video"
      : formatParam === "vertical_short"
        ? "vertical_short"
        : "square_image";
  const hasPromotion = Boolean(promotion?.trim());
  const generationKey = `format:${format}|promotion:${promotion?.trim() ?? "__none__"}`;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const existingRun = inflightGenerationRuns.get(generationKey);
      const runPromise =
        existingRun ??
        generateMockMemes(promotion ?? undefined, { outputFormat: format }).finally(() => {
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
  }, [format, generationKey, router, promotion]);

  return (
    <DashboardShell>
      <div className="mx-auto flex min-h-[70vh] w-full max-w-3xl items-center justify-center">
        <div className="w-full rounded-[28px] border border-white/10 bg-white/[0.04] p-8 text-center shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:p-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-indigo-400/20 bg-indigo-500/10 text-indigo-300">
            <LoaderCircle className="h-8 w-8 animate-spin" />
          </div>

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
              : `Generating a ${format === "square_video" ? "video" : "brand-led"} set for you now.`}
          </p>
        </div>
      </div>
    </DashboardShell>
  );
}
