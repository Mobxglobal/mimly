"use client";

import { useMemo, useState } from "react";
import { DownloadMemeButton } from "@/components/dashboard/download-meme-button";
import { PlatformIconsRow } from "@/components/dashboard/platform-icons-row";

const ACCENTS = [
  "from-indigo-500/30 via-sky-500/10 to-transparent",
  "from-emerald-500/25 via-transparent to-transparent",
  "from-amber-500/20 via-orange-500/10 to-transparent",
] as const;

const VARIANT_LABELS = {
  standard: "Default",
  promo: "Promotion",
  important_day: "Seasonal",
} as const;

const VARIANT_ORDER = ["standard", "promo", "important_day"] as const;
type VariantType = keyof typeof VARIANT_LABELS;

type MemeRow = {
  id: string;
  template_id: string | null;
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

type TemplateGroup = {
  key: string;
  templateId: string | null;
  variants: MemeRow[];
};

type GenerationRunGroup = {
  key: string;
  generationRunId: string | null;
  batchNumber: number | null;
  templateGroups: TemplateGroup[];
};

type Props = {
  memes: MemeRow[];
};

function normalizeVariantType(value: string | null | undefined): VariantType {
  if (value === "promo" || value === "important_day") {
    return value;
  }

  return "standard";
}

function getDownloadHref(
  title: string,
  topText: string | null,
  bottomText: string | null
) {
  const top = (topText ?? "")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&/g, "&amp;");
  const bottom = (bottomText ?? "")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&/g, "&amp;");
  const safeTitle = (title ?? "")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&/g, "&amp;");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="100%" stop-color="#111827" />
        </linearGradient>
      </defs>
      <rect width="1080" height="1080" rx="44" fill="url(#bg)" />
      <rect x="40" y="40" width="1000" height="1000" rx="32" fill="#020617" stroke="#334155" />
      <text x="540" y="146" text-anchor="middle" fill="#f8fafc" font-family="Arial, Helvetica, sans-serif" font-size="48" font-weight="700">${top}</text>
      <text x="540" y="944" text-anchor="middle" fill="#e2e8f0" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="700">${bottom}</text>
      <text x="540" y="540" text-anchor="middle" fill="#64748b" font-family="Arial, Helvetica, sans-serif" font-size="36">${safeTitle}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function getDefaultVariant(variants: MemeRow[]): MemeRow {
  return (
    variants.find((variant) => normalizeVariantType(variant.variant_type) === "standard") ??
    variants[0]
  );
}

function getDisplayPostCaption(variant: MemeRow): string {
  return variant.post_caption?.trim() || "A little too real not to post.";
}

function sortVariants(variants: MemeRow[]): MemeRow[] {
  return [...variants].sort((a, b) => {
    const aIndex = VARIANT_ORDER.indexOf(normalizeVariantType(a.variant_type));
    const bIndex = VARIANT_ORDER.indexOf(normalizeVariantType(b.variant_type));

    if (aIndex !== bIndex) {
      return aIndex - bIndex;
    }

    return a.id.localeCompare(b.id);
  });
}

function groupMemesByRunAndTemplate(memes: MemeRow[]): GenerationRunGroup[] {
  const runs = new Map<
    string,
    {
      generationRunId: string | null;
      batchNumber: number | null;
      templateGroups: Map<string, TemplateGroup>;
    }
  >();

  for (const meme of memes) {
    const runKey = meme.generation_run_id ?? "legacy";
    const existingRun = runs.get(runKey);
    const run =
      existingRun ??
      {
        generationRunId: meme.generation_run_id,
        batchNumber: meme.batch_number,
        templateGroups: new Map<string, TemplateGroup>(),
      };

    const templateKey =
      meme.generation_run_id != null
        ? meme.template_id ?? meme.format ?? meme.id
        : meme.id;
    const existingTemplateGroup = run.templateGroups.get(templateKey);

    if (existingTemplateGroup) {
      existingTemplateGroup.variants.push(meme);
    } else {
      run.templateGroups.set(templateKey, {
        key: templateKey,
        templateId: meme.template_id,
        variants: [meme],
      });
    }

    if (!existingRun) {
      runs.set(runKey, run);
    }
  }

  return [...runs.entries()].map(([key, run]) => ({
    key,
    generationRunId: run.generationRunId,
    batchNumber: run.batchNumber,
    templateGroups: [...run.templateGroups.values()].map((group) => ({
      ...group,
      variants: sortVariants(group.variants),
    })),
  }));
}

function MemeTemplateCard({
  group,
  accent,
}: {
  group: TemplateGroup;
  accent: string;
}) {
  const defaultVariant = getDefaultVariant(group.variants);
  const [selectedVariantType, setSelectedVariantType] = useState<VariantType>(
    normalizeVariantType(defaultVariant.variant_type)
  );
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  const selectedVariant =
    group.variants.find(
      (variant) => normalizeVariantType(variant.variant_type) === selectedVariantType
    ) ?? defaultVariant;

  const title = selectedVariant.title ?? "Meme";
  const topText = selectedVariant.top_text ?? "";
  const bottomText = selectedVariant.bottom_text ?? "";
  const postCaption = getDisplayPostCaption(selectedVariant);
  const hasImage = Boolean(selectedVariant.image_url);

  async function handleCopyCaption() {
    try {
      await navigator.clipboard.writeText(postCaption);
      setCopyState("copied");
      window.setTimeout(() => {
        setCopyState("idle");
      }, 1500);
    } catch (error) {
      console.error("[meme-results] Failed to copy caption", {
        memeId: selectedVariant.id,
        error,
      });
    }
  }

  return (
    <div className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <div
        className={`relative aspect-square w-full bg-gradient-to-br ${accent} ${hasImage ? "p-0" : "p-5"}`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_26%)]" />
        {hasImage && (
          <img
            src={selectedVariant.image_url as string}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className="relative z-10 flex h-full flex-col justify-between">
          {!hasImage && (
            <div className="flex items-start justify-between gap-3">
              <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-stone-300">
                {selectedVariant.format ?? "Meme"}
              </span>
            </div>
          )}
          {!hasImage && (
            <div className="space-y-3">
              <p className="max-w-[18ch] text-lg font-semibold leading-tight text-white sm:text-xl">
                {topText}
              </p>
              <p className="max-w-[22ch] text-sm leading-relaxed text-stone-300">
                {bottomText}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-white/10 bg-black/20 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-white">{title}</h2>
            <p className="mt-1 text-xs text-stone-300">
              {selectedVariant.image_url ? "Image ready" : "1080 x 1080 meme export"}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] leading-relaxed text-stone-500">1080×1080</span>
              <PlatformIconsRow className="gap-1.5" />
            </div>
          </div>
          {group.variants.length > 1 && (
            <div className="flex flex-wrap items-center justify-end gap-1 rounded-full border border-white/10 bg-white/5 p-1">
              {group.variants.map((variant) => {
                const variantType = normalizeVariantType(variant.variant_type);
                const isActive = variantType === normalizeVariantType(selectedVariant.variant_type);

                return (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => {
                      setSelectedVariantType(variantType);
                      setCopyState("idle");
                    }}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                      isActive
                        ? "bg-white text-stone-950"
                        : "text-stone-300 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {VARIANT_LABELS[variantType]}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone-500">
            Caption
          </p>
          <p className="mt-2 text-sm leading-relaxed text-white">{postCaption}</p>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <button
            type="button"
            onClick={handleCopyCaption}
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-stone-200 transition hover:bg-white/[0.06] hover:text-white"
          >
            {copyState === "copied" ? "Copied" : "Copy caption"}
          </button>
          <DownloadMemeButton
            imageUrl={selectedVariant.image_url ?? null}
            fallbackHref={getDownloadHref(title, topText, bottomText)}
            downloadFilename={
              selectedVariant.image_url
                ? `${selectedVariant.id}.png`
                : `${selectedVariant.id}.svg`
            }
            className="cta-funky inline-flex items-center justify-center rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white shadow-[0_10px_30px_rgba(99,102,241,0.35)] hover:bg-indigo-400"
          >
            Download meme
          </DownloadMemeButton>
        </div>
      </div>
    </div>
  );
}

export function MemeResultsGrid({ memes }: Props) {
  const generationRuns = useMemo(() => groupMemesByRunAndTemplate(memes), [memes]);

  return (
    <div className="mt-6 space-y-8">
      {generationRuns.map((run, runIndex) => {
        const showRunHeader = generationRuns.length > 1;
        const runLabel =
          run.generationRunId == null
            ? "Earlier results"
            : runIndex === 0
              ? "Latest set"
              : `Previous set ${runIndex}`;

        return (
          <section key={run.key}>
            {showRunHeader && (
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-white">{runLabel}</h2>
                  <p className="mt-1 text-xs text-stone-400">
                    {run.templateGroups.length} template
                    {run.templateGroups.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {run.templateGroups.map((group, index) => (
                <MemeTemplateCard
                  key={group.key}
                  group={group}
                  accent={ACCENTS[index % ACCENTS.length]}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
