"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

type Variant =
  | "hero"      // soft sky / powder blue, mesh
  | "gallery"   // light cream / soft gray
  | "features"  // pale mint / soft
  | "founder"   // muted peach / warm
  | "pricing"   // soft lavender / neutral
  | "faq"       // very light, quiet
  | "footer"    // dark charcoal / ink (site footer)
  | "showcase"; // softer charcoal (homepage product walkthrough)

interface SectionBackgroundProps {
  variant: Variant;
  className?: string;
  children?: React.ReactNode;
  /** When set with variant `hero`, full-bleed cover image behind content (homepage). */
  heroBackgroundSrc?: string | null;
}

export function SectionBackground({
  variant,
  className,
  children,
  heroBackgroundSrc,
}: SectionBackgroundProps) {
  const heroPhoto = variant === "hero" && heroBackgroundSrc;

  return (
    <div
      className={cn("absolute inset-0 overflow-hidden", className)}
      aria-hidden
    >
      {heroPhoto ? (
        <Image
          src={heroBackgroundSrc}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
      ) : null}
      {/* Base gradient per variant */}
      <div
        className={cn(
          "absolute inset-0",
          variant === "hero" &&
            !heroPhoto &&
            "bg-gradient-to-b from-sky-200/85 via-sky-100/90 to-sky-50/95",
          variant === "gallery" && "bg-gradient-to-b from-stone-50/98 to-amber-50/30",
          variant === "features" && "bg-gradient-to-b from-emerald-200/85 via-green-100/90 to-emerald-50/95",
          variant === "founder" && "bg-gradient-to-b from-orange-50/30 via-amber-50/20 to-white/95",
          variant === "pricing" && "bg-gradient-to-b from-amber-100/90 via-yellow-50/90 to-amber-50/85",
          variant === "faq" && "bg-gradient-to-b from-slate-50/50 to-white/98",
          variant === "footer" && "bg-gradient-to-b from-stone-900 to-stone-950",
          variant === "showcase" &&
            "bg-gradient-to-b from-stone-800 via-stone-800 to-stone-900"
        )}
      />
      {/* Decorative blurred shapes */}
      {variant === "hero" && !heroPhoto && (
        <>
          <div className="absolute -left-20 top-1/4 h-72 w-72 rounded-full bg-sky-200/40 blur-3xl" />
          <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-sky-200/45 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-sky-100/50 blur-3xl" />
          {/* Subtle clouds – top half only */}
          <div className="absolute left-[10%] top-6 h-20 w-48 rounded-full bg-white/30 blur-2xl" />
          <div className="absolute right-[15%] top-4 h-16 w-40 rounded-full bg-white/25 blur-2xl" />
          <div className="absolute left-1/2 top-16 -translate-x-1/2 h-14 w-56 rounded-full bg-sky-50/40 blur-2xl" />
          <div className="absolute right-[30%] top-20 h-12 w-32 rounded-full bg-white/20 blur-xl" />
        </>
      )}
      {variant === "gallery" && (
        <>
          <div className="absolute -right-16 top-1/4 h-56 w-56 rounded-full bg-amber-100/50 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-40 w-40 rounded-full bg-stone-200/30 blur-2xl" />
        </>
      )}
      {variant === "features" && (
        <>
          <div className="absolute -left-20 top-1/4 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl" />
          <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-green-200/45 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-emerald-100/50 blur-3xl" />
          <div className="absolute left-[15%] top-8 h-20 w-48 rounded-full bg-white/25 blur-2xl" />
          <div className="absolute right-[20%] top-6 h-16 w-40 rounded-full bg-amber-50/30 blur-2xl" />
        </>
      )}
      {variant === "founder" && (
        <>
          <div className="absolute right-0 top-1/3 h-52 w-52 rounded-full bg-orange-100/40 blur-3xl" />
        </>
      )}
      {variant === "pricing" && (
        <>
          <div className="absolute -left-12 top-0 h-44 w-44 rounded-full bg-amber-200/45 blur-3xl" />
          <div className="absolute bottom-0 right-1/4 h-36 w-36 rounded-full bg-yellow-100/40 blur-3xl" />
        </>
      )}
      {variant === "footer" && (
        <>
          <div className="absolute left-1/4 top-0 h-80 w-80 rounded-full bg-stone-800/60 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-stone-800/40 blur-3xl" />
          {/* subtle noise overlay */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(148,163,184,0.5) 1px, transparent 0)",
              backgroundSize: "6px 6px",
            }}
          />
        </>
      )}
      {variant === "showcase" && (
        <>
          <div className="absolute left-1/4 top-0 h-80 w-80 rounded-full bg-stone-700/45 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-stone-700/35 blur-3xl" />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(148,163,184,0.45) 1px, transparent 0)",
              backgroundSize: "6px 6px",
            }}
          />
        </>
      )}
      {children}
    </div>
  );
}
