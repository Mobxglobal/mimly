"use client";

import { cn } from "@/lib/utils";
import { SectionBackground } from "./section-background";

export type FramedSectionVariant =
  | "hero"     // largest frame, nav inside
  | "onboarding" // compact, narrow onboarding/auth card
  | "default"  // mid-width (gallery, features, founder, pricing, faq)
  | "footer"   // wide, dark (site footer)
  | "showcase"; // wide, softer charcoal (homepage product walkthrough)

type SectionBackgroundVariant =
  | "hero"
  | "gallery"
  | "features"
  | "founder"
  | "pricing"
  | "faq"
  | "footer"
  | "showcase";

interface FramedSectionProps {
  variant: FramedSectionVariant;
  /** Background variant for SectionBackground (defaults from section variant) */
  backgroundVariant?: SectionBackgroundVariant;
  /** Homepage hero only: optional cover image under sky tint (see `HERO_BACKGROUND_IMAGE_SRC`). */
  heroBackgroundSrc?: string | null;
  children: React.ReactNode;
  className?: string;
  /** Merged onto the framed inner container (e.g. override max-width / padding). */
  frameClassName?: string;
  /** Section id for anchor links */
  id?: string;
  /** Optional aria label */
  "aria-labelledby"?: string;
}

const variantStyles: Record<
  FramedSectionVariant,
  { maxWidth: string; padding: string; radius: string; shadow: string; border: string }
> = {
  hero: {
    // Let hero span full content width (within page shell gutters)
    maxWidth: "max-w-none",
    // Top padding smaller than page gutters so nav–frame gap < site–frame gap
    padding: "px-4 pt-1.5 pb-8 sm:px-6 sm:pt-2 sm:pb-10 md:px-8 md:pt-3 md:pb-12 lg:px-8 lg:pt-4 lg:pb-16",
    radius: "rounded-3xl sm:rounded-[2rem] md:rounded-[2.25rem]",
    shadow: "shadow-xl shadow-black/5",
    border: "border border-stone-200/80",
  },
  onboarding: {
    maxWidth: "max-w-lg",
    padding: "px-4 pt-4 pb-5 sm:px-5 sm:pt-5 sm:pb-6",
    radius: "rounded-2xl sm:rounded-3xl",
    shadow: "shadow-lg shadow-black/[0.04]",
    border: "border border-stone-200/60",
  },
  default: {
    maxWidth: "max-w-[1200px]",
    padding: "px-6 py-12 sm:px-8 sm:py-16 md:px-10 md:py-20",
    radius: "rounded-2xl sm:rounded-3xl",
    shadow: "shadow-lg shadow-black/[0.04]",
    border: "border border-stone-200/60",
  },
  footer: {
    maxWidth: "max-w-[1600px]",
    // Compact footer shell for a tighter, minimal visual rhythm.
    padding: "px-4 pt-4 pb-5 sm:px-6 sm:pt-5 sm:pb-6 md:px-8 md:pt-6 md:pb-8 lg:px-10 lg:pt-7 lg:pb-9",
    radius: "rounded-3xl sm:rounded-[2rem] md:rounded-[2.25rem]",
    shadow: "shadow-2xl shadow-black/10",
    border: "border border-stone-700/50",
  },
  showcase: {
    maxWidth: "max-w-[1600px]",
    padding: "px-4 pt-6 pb-8 sm:px-6 sm:pt-8 sm:pb-10 md:px-8 md:pt-10 md:pb-12 lg:px-10 lg:pt-12 lg:pb-16",
    radius: "rounded-3xl sm:rounded-[2rem] md:rounded-[2.25rem]",
    shadow: "shadow-2xl shadow-black/[0.08]",
    border: "border border-stone-600/40",
  },
};

export function FramedSection({
  variant,
  backgroundVariant,
  heroBackgroundSrc,
  children,
  className,
  frameClassName,
  id,
  "aria-labelledby": ariaLabelledby,
}: FramedSectionProps) {
  const styles = variantStyles[variant];
  const bgVariant: SectionBackgroundVariant =
    backgroundVariant ??
    (variant === "default"
      ? "gallery"
      : variant === "onboarding"
        ? "features"
        : variant);

  return (
    <section
      id={id}
      aria-labelledby={ariaLabelledby}
      className={cn("w-full", id && "scroll-mt-24", className)}
    >
      <div
        className={cn(
          "relative mx-auto w-full overflow-hidden",
          styles.maxWidth,
          styles.radius,
          styles.shadow,
          styles.border,
          styles.padding,
          variant === "footer" && "bg-stone-900/95 text-stone-100",
          variant === "showcase" && "bg-stone-800/88 text-stone-100",
          frameClassName
        )}
      >
        <SectionBackground variant={bgVariant} heroBackgroundSrc={heroBackgroundSrc} />
        {variant === "hero" ? (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 -bottom-1 z-[1] h-20 bg-gradient-to-b from-transparent via-stone-100/70 to-stone-100"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-8 -bottom-3 z-[1] h-8 rounded-full bg-stone-200/40 blur-2xl"
            />
          </>
        ) : null}
        <div className="relative z-10">{children}</div>
      </div>
    </section>
  );
}
