"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Clapperboard, ImageIcon, Smartphone } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { PlatformIconsRow } from "@/components/dashboard/platform-icons-row";

const FORMAT_OPTIONS = [
  {
    id: "square_image",
    label: "Square Image",
    subtitle: "1080×1080",
    helper: "Static meme",
    showPlatformIcons: true,
    available: true,
    Icon: ImageIcon,
  },
  {
    id: "square_video",
    label: "Square Video",
    subtitle: "1080×1080",
    helper: "Animated/video meme",
    showPlatformIcons: false,
    available: false,
    Icon: Clapperboard,
  },
  {
    id: "vertical_short",
    label: "Vertical Short",
    subtitle: "1080×1920",
    helper: "Reels / TikTok",
    showPlatformIcons: false,
    available: false,
    Icon: Smartphone,
  },
] as const;

type OutputFormat = (typeof FORMAT_OPTIONS)[number]["id"];

export default function CreatePage() {
  const router = useRouter();
  const [format, setFormat] = useState<OutputFormat>("square_image");
  const [promotion, setPromotion] = useState("");

  return (
    <DashboardShell>
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:p-6 md:p-7">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Create memes
            </h1>
            <p className="mt-2 text-sm text-stone-400">
              Pick an output format, optionally add a promotion, then generate.
            </p>
          </div>

          <div className="mt-8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">Choose format</p>
                <p className="mt-1 text-xs text-stone-500">
                  Square Image is live now. More formats are coming soon.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {FORMAT_OPTIONS.map((option) => {
                const isSelected = format === option.id;
                const isDisabled = !option.available;
                const Icon = option.Icon;

                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => {
                      if (!isDisabled) setFormat(option.id);
                    }}
                    className={
                      "rounded-[22px] border p-4 text-left transition-all " +
                      (isSelected
                        ? "border-indigo-400/40 bg-indigo-500/10 shadow-[0_12px_30px_rgba(99,102,241,0.14)]"
                        : isDisabled
                          ? "cursor-not-allowed border-white/10 bg-white/[0.02] opacity-60"
                          : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]")
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-stone-300" />
                          <p className="text-sm font-medium text-white">{option.label}</p>
                        </div>
                        <p className="mt-2 text-xs font-medium uppercase tracking-[0.12em] text-stone-400">
                          {option.subtitle}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">{option.helper}</p>
                        {option.showPlatformIcons && (
                          <div className="mt-2">
                            <PlatformIconsRow />
                          </div>
                        )}
                      </div>
                      {isDisabled && (
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-stone-400">
                          Coming soon
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-8 rounded-[24px] border border-white/10 bg-black/20 p-4 sm:p-5">
            <div>
              <label
                htmlFor="create-promotion"
                className="block text-sm font-medium text-stone-100"
              >
                Promotion (optional)
              </label>
              <p className="mt-1 text-xs text-stone-500">
                Add a live offer, launch, or deadline if you want the generator to
                consider it.
              </p>
            </div>

            <textarea
              id="create-promotion"
              value={promotion}
              onChange={(e) => setPromotion(e.target.value)}
              rows={3}
              placeholder="e.g. 20% off this weekend"
              className="mt-4 w-full rounded-[22px] border border-white/10 bg-black/30 px-4 py-3 text-sm text-stone-100 placeholder:text-stone-500 focus:border-indigo-400/50 focus:outline-none focus:ring-1 focus:ring-indigo-400/40"
            />

            <div className="mt-3 flex flex-col gap-1 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between">
              <p>Leave blank to generate broader brand-led memes.</p>
              <p>Be specific if you want promo-aware output.</p>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                router.push(
                  `/dashboard/generating${params.toString() ? `?${params.toString()}` : ""}`
                );
              }}
              className="cta-funky inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white shadow-[0_10px_30px_rgba(99,102,241,0.35)] hover:bg-indigo-400"
            >
              Generate memes
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
