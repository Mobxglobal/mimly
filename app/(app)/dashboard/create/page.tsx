"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export default function CreatePage() {
  const router = useRouter();
  const [hasPromotion, setHasPromotion] = useState<"yes" | "no">("no");
  const [promotion, setPromotion] = useState("");

  return (
    <DashboardShell>
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:p-6 md:p-8">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-indigo-400/20 bg-indigo-500/15 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-indigo-300">
              Step 1
            </span>
            <span className="text-xs text-stone-500">Optional, but useful</span>
          </div>

          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white md:text-3xl">
            Are you pushing a promotion or deal right now?
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-400">
            This helps Mimly shape the meme angle and caption. You can skip it,
            but adding a promotion gives the system more context.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setHasPromotion("yes")}
              className={
                "rounded-2xl border px-4 py-4 text-left transition-colors " +
                (hasPromotion === "yes"
                  ? "border-indigo-400/40 bg-indigo-500/10 text-white"
                  : "border-white/10 bg-white/[0.03] text-stone-300 hover:border-white/15 hover:bg-white/[0.05]")
              }
            >
              <p className="text-sm font-medium">Yes, I have a promotion</p>
              <p className="mt-1 text-xs text-stone-400">
                Example: sale, launch, feature release, event, or discount.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setHasPromotion("no")}
              className={
                "rounded-2xl border px-4 py-4 text-left transition-colors " +
                (hasPromotion === "no"
                  ? "border-white/15 bg-white/[0.06] text-white"
                  : "border-white/10 bg-white/[0.03] text-stone-300 hover:border-white/15 hover:bg-white/[0.05]")
              }
            >
              <p className="text-sm font-medium">No, skip for now</p>
              <p className="mt-1 text-xs text-stone-400">
                We’ll create a more general brand-led meme instead.
              </p>
            </button>
          </div>

          {hasPromotion === "yes" && (
            <div className="mt-5 rounded-2xl border border-indigo-400/20 bg-indigo-500/[0.06] p-4">
              <label
                htmlFor="create-promotion"
                className="block text-sm font-medium text-stone-200"
              >
                What are you promoting?
              </label>
              <textarea
                id="create-promotion"
                value={promotion}
                onChange={(e) => setPromotion(e.target.value)}
                rows={4}
                placeholder="e.g. 50% off all plans this weekend, launching our new nutrition coaching package, free trial ending Friday"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-stone-100 placeholder:text-stone-500 focus:border-indigo-400/50 focus:outline-none focus:ring-1 focus:ring-indigo-400/40"
              />
              <p className="mt-2 text-xs text-stone-500">
                The clearer this is, the easier it is to generate a relevant meme.
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-stone-500">
              Next we’ll use this context to shape your meme direction.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-stone-300 transition-colors hover:bg-white/[0.05] hover:text-white"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  const params = new URLSearchParams();
                  if (promotion.trim()) params.set("promotion", promotion.trim());
                  router.push(`/dashboard/generating${params.toString() ? `?${params.toString()}` : ""}`);
                }}
                className="cta-funky rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white shadow-[0_10px_30px_rgba(99,102,241,0.35)] hover:bg-indigo-400"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
