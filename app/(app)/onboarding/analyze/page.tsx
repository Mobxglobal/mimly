"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";

const STEPS = [
  "Scanning website content",
  "Understanding your brand",
  "Identifying your audience",
  "Preparing your meme engine",
];

export default function OnboardingAnalyzePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [visibleCount, setVisibleCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const website = searchParams.get("website");
  const PREMIUM_REDIRECT_DELAY_MS = 900;

  useEffect(() => {
    if (!website) {
      router.replace("/onboarding/manual");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ website }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error ?? "Failed to scan website");
          return;
        }

        const extracted = data.extracted ?? {};
        const next = new URLSearchParams();
        next.set("website", data.website ?? website);
        if (extracted.brand_name) next.set("brand_name", extracted.brand_name);
        if (extracted.what_you_do) next.set("what_you_do", extracted.what_you_do);
        if (extracted.audience) next.set("audience", extracted.audience);
        if (extracted.country) next.set("country", extracted.country);

        // Make the transition feel intentional/premium (let the UI "land").
        setVisibleCount(STEPS.length);
        setTimeout(() => {
          if (cancelled) return;
          router.replace(`/onboarding/confirm?${next.toString()}`);
        }, PREMIUM_REDIRECT_DELAY_MS);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to scan website");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  useEffect(() => {
    if (visibleCount >= STEPS.length) return;
    const t = setTimeout(() => setVisibleCount((c) => c + 1), 400);
    return () => clearTimeout(t);
  }, [visibleCount]);

  return (
    <OnboardingShell>
      <div className="rounded-3xl border border-stone-200/70 bg-white/85 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-sky-200/80 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-900">
              Scan
            </span>
            <span className="text-xs font-medium text-stone-500">
              ~10 seconds
            </span>
          </div>
          <div className="h-2 w-2 rounded-full bg-emerald-400/80 shadow-[0_0_0_4px_rgba(52,211,153,0.18)]" aria-hidden />
        </div>

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-stone-900 md:text-3xl">
          Analyzing your website
        </h1>
        <p className="marketing-copy mt-2 text-stone-700">
          We&apos;ll extract your brand details and prefill your meme engine setup.
        </p>

        {website && (
          <p className="mt-3 truncate text-xs text-stone-500">
            Scanning: <span className="font-medium text-stone-700">{website}</span>
          </p>
        )}

        <div className="mt-5 overflow-hidden rounded-full bg-stone-200/60">
          <div
            className="h-2 w-2/3 animate-pulse rounded-full bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-500"
            aria-hidden
          />
        </div>

        {error && (
          <div className="mt-5 rounded-2xl border border-rose-200/80 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <p className="font-medium">We couldn&apos;t scan that website.</p>
            <p className="mt-1 text-sm text-rose-700/90">
              {error}
            </p>
            <button
              type="button"
              onClick={() => router.replace("/onboarding/manual")}
              className="mt-3 inline-flex rounded-full bg-stone-900 px-4 py-2 text-xs font-medium text-white hover:bg-stone-800 transition-colors"
            >
              Continue manually
            </button>
          </div>
        )}

        <div className="mt-6 space-y-3" aria-label="Progress">
          {STEPS.map((label, i) => {
            const done = i < visibleCount;
            return (
              <div
                key={label}
                className={
                  "flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all " +
                  (done
                    ? "border-stone-200/70 bg-white"
                    : "border-stone-200/40 bg-white/60 opacity-70")
                }
              >
                <span
                  className={
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold " +
                    (done
                      ? "bg-stone-900 text-white"
                      : "bg-stone-200 text-stone-600")
                  }
                  aria-hidden
                >
                  {done ? "✓" : i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stone-800">{label}</p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {i === 0 && "Fetching and cleaning key site pages."}
                    {i === 1 && "Summarizing what you do and your tone."}
                    {i === 2 && "Inferring who the content is for."}
                    {i === 3 && "Preparing your personalized setup."}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </OnboardingShell>
  );
}

