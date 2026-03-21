"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, LoaderCircle } from "lucide-react";
import { regenerateTemplateIdea } from "@/lib/actions/memes";
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
  variant_metadata?: unknown;
};

function isVideoAssetUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  // Path or query may carry the extension; some CDNs omit obvious suffixes.
  return /\.(mp4|webm|m4v)(\?|#|$)/i.test(url) || /\/object\/(?:public|sign)\/[^/]+\/.*\.(mp4|webm)/i.test(url);
}

function getVariantMediaType(variant: MemeRow): "video" | "image" | null {
  const raw = variant.variant_metadata;
  if (!raw || typeof raw !== "object" || !("media_type" in raw)) {
    return null;
  }
  const mt = String((raw as { media_type?: unknown }).media_type ?? "")
    .trim()
    .toLowerCase();
  if (mt === "video" || mt === "image") return mt;
  return null;
}

function isVideoMemeVariant(variant: MemeRow): boolean {
  const fromMeta = getVariantMediaType(variant);
  if (fromMeta === "video") return true;
  if (fromMeta === "image") return false;
  return isVideoAssetUrl(variant.image_url);
}

type IdeaGroup = {
  key: string;
  ideaGroupId: string | null;
  variants: MemeRow[];
};

type TemplateGroup = {
  key: string;
  templateId: string | null;
  ideaGroups: IdeaGroup[];
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

function hasPromoVariant(rows: MemeRow[]): boolean {
  return rows.some((row) => normalizeVariantType(row.variant_type) === "promo");
}

function groupMemesByTemplateAndIdea(memes: MemeRow[]): TemplateGroup[] {
  const templateGroups = new Map<
    string,
    {
      templateId: string | null;
      ideaGroups: Map<string, IdeaGroup>;
    }
  >();

  for (const meme of memes) {
    const templateKey = meme.template_id ?? meme.format ?? meme.id;
    const ideaKey = meme.idea_group_id ?? meme.id;
    const existingTemplateGroup = templateGroups.get(templateKey);
    const templateGroup =
      existingTemplateGroup ??
      {
        templateId: meme.template_id,
        ideaGroups: new Map<string, IdeaGroup>(),
      };

    const existingIdeaGroup = templateGroup.ideaGroups.get(ideaKey);
    if (existingIdeaGroup) {
      existingIdeaGroup.variants.push(meme);
    } else {
      templateGroup.ideaGroups.set(ideaKey, {
        key: ideaKey,
        ideaGroupId: meme.idea_group_id,
        variants: [meme],
      });
    }

    if (!existingTemplateGroup) {
      templateGroups.set(templateKey, templateGroup);
    }
  }

  return [...templateGroups.entries()].map(([key, group]) => ({
    key,
    templateId: group.templateId,
    ideaGroups: [...group.ideaGroups.values()].map((ideaGroup) => ({
      ...ideaGroup,
      variants: sortVariants(ideaGroup.variants),
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
  const router = useRouter();
  const [isRegenerating, startRegeneration] = useTransition();
  const defaultIdeaGroup = group.ideaGroups[0];
  const [selectedIdeaGroupKey, setSelectedIdeaGroupKey] = useState<string>(
    defaultIdeaGroup?.key ?? ""
  );
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  useEffect(() => {
    if (group.ideaGroups[0]?.key) {
      setSelectedIdeaGroupKey(group.ideaGroups[0].key);
      setCopyState("idle");
    }
  }, [group.ideaGroups.length, group.ideaGroups[0]?.key]);

  const selectedIdeaGroup =
    group.ideaGroups.find((ideaGroup) => ideaGroup.key === selectedIdeaGroupKey) ??
    defaultIdeaGroup;
  const defaultVariant = getDefaultVariant(selectedIdeaGroup?.variants ?? []);
  const [selectedVariantType, setSelectedVariantType] = useState<VariantType>(
    normalizeVariantType(defaultVariant?.variant_type)
  );

  useEffect(() => {
    if (selectedIdeaGroup) {
      setSelectedVariantType(
        normalizeVariantType(getDefaultVariant(selectedIdeaGroup.variants).variant_type)
      );
      setCopyState("idle");
    }
  }, [selectedIdeaGroup?.key]);

  const selectedVariant =
    selectedIdeaGroup?.variants.find(
      (variant) => normalizeVariantType(variant.variant_type) === selectedVariantType
    ) ?? defaultVariant;

  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!selectedVariant?.image_url || !isVideoMemeVariant(selectedVariant)) return;
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    void el.play().catch(() => {
      /* autoplay may be blocked until user uses controls */
    });
  }, [selectedVariant?.id, selectedVariant?.image_url]);

  if (!selectedIdeaGroup || !defaultVariant || !selectedVariant) {
    return null;
  }

  const title = selectedVariant.title ?? "Meme";
  const topText = selectedVariant.top_text ?? "";
  const bottomText = selectedVariant.bottom_text ?? "";
  const postCaption = getDisplayPostCaption(selectedVariant);
  const hasImage = Boolean(selectedVariant.image_url);
  const isVideoAsset = isVideoMemeVariant(selectedVariant);
  const templateHasPromoIdea = group.ideaGroups.some((ideaGroup) =>
    hasPromoVariant(ideaGroup.variants)
  );
  const selectedIdeaIsPromo = hasPromoVariant(selectedIdeaGroup.variants);

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

  function handleMoreIdeas() {
    if (!group.templateId) return;
    const outputFormat: "square_image" | "square_video" = isVideoAsset
      ? "square_video"
      : "square_image";

    startRegeneration(async () => {
      const result = await regenerateTemplateIdea(
        group.templateId as string,
        outputFormat
      );
      if (result.error) {
        console.error("[meme-results] More ideas failed", {
          templateId: group.templateId,
          outputFormat,
          error: result.error,
        });
        return;
      }

      router.refresh();
    });
  }

  return (
    <div
      className={`group overflow-hidden rounded-3xl border bg-white/[0.04] shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl ${
        templateHasPromoIdea
          ? "border-emerald-400/30 shadow-[0_20px_60px_rgba(16,185,129,0.14)]"
          : "border-white/10"
      }`}
    >
      <div
        className={`relative aspect-square w-full bg-gradient-to-br ${accent} ${hasImage ? "p-0" : "p-5"}`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_26%)]" />
        {hasImage &&
          (isVideoAsset ? (
            <video
              ref={videoRef}
              key={`${selectedVariant.id}-${selectedVariant.image_url}`}
              src={selectedVariant.image_url as string}
              className="absolute inset-0 z-[1] h-full w-full object-cover"
              playsInline
              muted
              loop
              controls
              preload="auto"
              aria-label={`Video preview: ${title}`}
            />
          ) : (
            <img
              src={selectedVariant.image_url as string}
              alt={title}
              className="absolute inset-0 z-[1] h-full w-full object-cover"
            />
          ))}
        {!hasImage && (
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-stone-300">
                {selectedVariant.format ?? "Meme"}
              </span>
            </div>
            <div className="space-y-3">
              <p className="max-w-[18ch] text-lg font-semibold leading-tight text-white sm:text-xl">
                {topText}
              </p>
              <p className="max-w-[22ch] text-sm leading-relaxed text-stone-300">
                {bottomText}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-white/10 bg-black/20 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-white">{title}</h2>
            <p className="mt-1 text-xs text-stone-300">
              {selectedVariant.image_url
                ? isVideoAsset
                  ? "Video ready"
                  : "Image ready"
                : "1080 x 1080 meme export"}
            </p>
            {templateHasPromoIdea && (
              <p
                className={`mt-2 text-xs font-medium ${
                  selectedIdeaIsPromo ? "text-emerald-300" : "text-emerald-400/80"
                }`}
              >
                {selectedIdeaIsPromo
                  ? "Promotion-informed idea"
                  : "Promo idea available in this template"}
              </p>
            )}
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] leading-relaxed text-stone-500">1080×1080</span>
              <PlatformIconsRow className="gap-1.5" />
            </div>
          </div>
          {selectedIdeaGroup.variants.length > 1 && (
            <div className="flex flex-wrap items-center justify-end gap-1 rounded-full border border-white/10 bg-white/5 p-1">
              {selectedIdeaGroup.variants.map((variant) => {
                const variantType = normalizeVariantType(variant.variant_type);
                const isActive =
                  variantType === normalizeVariantType(selectedVariant.variant_type);

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

        {group.ideaGroups.length > 1 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {group.ideaGroups.map((ideaGroup, index) => {
              const isActive = ideaGroup.key === selectedIdeaGroup.key;
              const ideaIsPromo = hasPromoVariant(ideaGroup.variants);

              return (
                <button
                  key={ideaGroup.key}
                  type="button"
                  onClick={() => setSelectedIdeaGroupKey(ideaGroup.key)}
                  className={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                    isActive
                      ? "border-white bg-white text-stone-950"
                      : "border-white/10 bg-white/[0.03] text-stone-300 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  {ideaIsPromo ? `Idea ${index + 1} · Promo` : `Idea ${index + 1}`}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone-500">
              Caption
            </p>
            <button
              type="button"
              onClick={handleCopyCaption}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
                copyState === "copied"
                  ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                  : "border-white/10 bg-white/[0.03] text-stone-400 hover:bg-white/[0.06] hover:text-white"
              }`}
              aria-label={copyState === "copied" ? "Caption copied" : "Copy caption"}
              title={copyState === "copied" ? "Copied" : "Copy caption"}
            >
              {copyState === "copied" ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-white">{postCaption}</p>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleMoreIdeas}
              disabled={isRegenerating || !group.templateId}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-stone-200 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isRegenerating && <LoaderCircle className="h-4 w-4 animate-spin" />}
              {isRegenerating ? "Generating..." : "More ideas"}
            </button>
            <DownloadMemeButton
              imageUrl={selectedVariant.image_url ?? null}
              fallbackHref={getDownloadHref(title, topText, bottomText)}
              downloadFilename={
                selectedVariant.image_url
                  ? `${selectedVariant.id}.${isVideoAsset ? "mp4" : "png"}`
                  : `${selectedVariant.id}.svg`
              }
              className="cta-funky inline-flex items-center justify-center rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white shadow-[0_10px_30px_rgba(99,102,241,0.35)] hover:bg-indigo-400"
            >
              Download meme
            </DownloadMemeButton>
          </div>
          {isRegenerating && (
            <p className="text-xs text-stone-500">Generating a new idea for this template...</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function MemeResultsGrid({ memes }: Props) {
  const templateGroups = useMemo(() => groupMemesByTemplateAndIdea(memes), [memes]);

  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {templateGroups.map((group, index) => (
        <MemeTemplateCard
          key={group.key}
          group={group}
          accent={ACCENTS[index % ACCENTS.length]}
        />
      ))}
    </div>
  );
}
