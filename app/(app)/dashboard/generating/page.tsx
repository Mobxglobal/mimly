"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { generateMockMemes } from "@/lib/actions/memes";

const STEPS = [
  "Reading your brand context",
  "Matching the best meme formats",
  "Writing tailored captions",
  "Preparing your download-ready memes",
];

export default function GeneratingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const promotion = searchParams.get("promotion");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { error: err } = await generateMockMemes(promotion ?? undefined);
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
  }, [router, promotion]);

  return (
    <DashboardShell>
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:p-8">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-indigo-400/20 bg-indigo-500/15 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-indigo-300">
              Generating
            </span>
          </div>

          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white md:text-3xl">
            We&apos;re building your memes
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-400">
            Mimly is combining your brand context with current meme formats to
            generate a set of ready-to-post ideas.
          </p>

          {error && (
            <p className="mt-4 text-sm text-rose-400">{error}</p>
          )}

          <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/5">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-indigo-500 via-sky-400 to-emerald-400" />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {STEPS.map((step, index) => (
              <div
                key={step}
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/8 text-xs font-medium text-stone-300">
                    {index + 1}
                  </span>
                  <p className="text-sm font-medium text-stone-200">{step}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
