"use client";

import { useEffect, useRef, useState } from "react";
import { FramedSection } from "./framed-section";
import { cn } from "@/lib/utils";

const STATS = [
  {
    id: "shares",
    number: "10x",
    label: "More shares",
    description: "Memes are built for tagging, sharing, and instant reactions.",
  },
  {
    id: "engagement",
    number: "2–3x",
    label: "Higher engagement",
    description: "Humour and simple relatable formats help people stop scrolling.",
  },
  {
    id: "users",
    number: "60%+",
    label: "Users engage with memes",
    description: "Meme culture is now a native part of how people communicate online.",
  },
] as const;

function useInViewOnce() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { root: null, rootMargin: "0px 0px -10% 0px", threshold: 0.12 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

export function OrganicStatsSection() {
  const header = useInViewOnce();
  const grid = useInViewOnce();

  return (
    <FramedSection
      variant="default"
      backgroundVariant="gallery"
      id="organic-stats-heading"
      aria-labelledby="organic-stats-title"
      className="w-full"
    >
      <div
        ref={header.ref}
        className={cn(
          "mx-auto max-w-3xl text-center transition-all duration-700 ease-out",
          header.visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        )}
      >
        <span className="inline-flex rounded-full border border-stone-200/80 bg-white/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-stone-600">
          The data is clear
        </span>
        <h2
          id="organic-stats-title"
          className="mt-5 text-4xl font-bold tracking-normal text-stone-900 md:text-6xl"
        >
          The internet runs on memes
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-stone-600 md:text-base">
          Memes and engagement posts earn attention and organic reach. Mimly turns your ideas into
          content people engage with.
        </p>
      </div>

      <div
        ref={grid.ref}
        className={cn(
          "mx-auto mt-10 max-w-5xl rounded-[2rem] border border-stone-200/70 bg-gradient-to-b from-stone-100/90 via-white/80 to-stone-50/50 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] sm:p-6 md:p-8",
          grid.visible ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0",
          "transition-all duration-700 ease-out motion-reduce:translate-y-0 motion-reduce:opacity-100"
        )}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {STATS.map((stat, index) => (
            <article
              key={stat.id}
              className={cn(
                "group relative flex flex-col overflow-hidden rounded-[1.35rem] border border-stone-200/90 bg-white/95",
                "shadow-[0_12px_36px_rgba(15,23,42,0.07),0_1px_0_rgba(255,255,255,0.9)_inset]",
                "cursor-default transition-[transform,opacity,box-shadow,border-color] duration-500 ease-out will-change-transform",
                "ring-0 ring-transparent ring-offset-2 ring-offset-stone-100/80",
                "hover:-translate-y-1 hover:border-stone-300/90 hover:shadow-[0_24px_52px_rgba(15,23,42,0.1),0_1px_0_rgba(255,255,255,1)_inset]",
                "hover:ring-stone-300/50",
                "active:translate-y-0 active:scale-[0.99] active:shadow-md",
                grid.visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
                "motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none"
              )}
              style={{
                transitionDelay: grid.visible ? `${80 + index * 100}ms` : "0ms",
              }}
            >
              <div
                className="pointer-events-none absolute inset-0 rounded-[1.35rem] bg-stone-100/0 transition-colors duration-300 group-hover:bg-stone-50/75"
                aria-hidden
              />

              <div className="relative flex flex-col px-5 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
                <div className="min-h-[4.75rem] border-b border-stone-200/80 pb-4 transition-colors duration-300 group-hover:border-stone-200/60">
                  <p
                    className={cn(
                      "font-display text-[2.65rem] font-bold tabular-nums leading-[0.95] tracking-normal transition-transform duration-300 ease-out group-hover:scale-[1.02] md:text-[3.1rem]",
                      "bg-gradient-to-br from-stone-900 via-stone-800 to-stone-600 bg-clip-text text-transparent",
                      "[-webkit-background-clip:text] [-webkit-text-fill-color:transparent]"
                    )}
                  >
                    {stat.number}
                  </p>
                </div>

                <h3 className="mt-4 text-[15px] font-semibold leading-snug tracking-normal text-stone-900 transition-colors duration-300 group-hover:text-stone-950 sm:text-base">
                  {stat.label}
                </h3>
                <p className="mt-2.5 flex-1 text-[13px] leading-relaxed text-stone-500 sm:text-sm">
                  {stat.description}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </FramedSection>
  );
}
