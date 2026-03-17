"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { FramedSection } from "./framed-section";
import { HeroNav } from "./hero-nav";
import { EngagementCard } from "./engagement-card";

const COUNT_START = 24;
const COUNT_DURATION_MS = 2500;

/** Single like count that runs from start to end on mount so it clearly increases on load. */
function LikeCount({
  delayMs = 0,
  endCount,
}: {
  delayMs?: number;
  endCount: number;
}) {
  const [count, setCount] = useState(COUNT_START);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime - delayMs;
      if (elapsed < 0) {
        requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, elapsed / COUNT_DURATION_MS);
      const value = Math.round(COUNT_START + (endCount - COUNT_START) * t);
      setCount(Math.min(value, endCount));
      if (value < endCount) requestAnimationFrame(tick);
    };

    const id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [delayMs, endCount]);

  return <span className="hero-social-count-value">{count}</span>;
}

export function HeroSection() {
  const [navFixed, setNavFixed] = useState(false);

  return (
    <div className={cn("w-full", navFixed && "relative z-[100]")}>
      <FramedSection variant="hero" id="hero" aria-labelledby="hero-heading" className="w-full">
        <div className="flex min-h-[70vh] flex-col items-center gap-8 md:gap-12">
          {/* Nav inside hero container */}
          <div className="w-full">
            <HeroNav onFixedChange={setNavFixed} />
          </div>

        {/* Main hero content – stacked on all breakpoints */}
        <div className="flex w-full flex-1 flex-col items-center justify-center gap-10 px-4 text-center">
          <div className="relative mt-12 sm:mt-16 md:mt-20">
            <h1
              id="hero-heading"
              className="text-4xl font-bold tracking-tight leading-tight text-stone-900 sm:text-5xl md:text-6xl"
            >
              <span className="hero-word-memes inline-block">Memes</span> help brands
              <br />
              <span className="hero-word-grow inline-block">grow</span>{" "}
              <span className="hero-word-online inline-block">online.</span>
            </h1>
            <p className="marketing-copy mx-auto mt-5 max-w-2xl text-pretty leading-relaxed">
              While brands plan campaigns, the internet shares memes. Our AI
              meme generator helps brands create contextually relevant{" "}
              <span className="inline-block rounded-md bg-sky-200/70 px-1.5 py-0.5 font-medium text-stone-900 ring-1 ring-sky-300/60">
                memes &amp; slideshows
              </span>{" "}
              for social media.
            </p>
            <div className="mt-5 flex items-center justify-center">
              <div className="flex items-start gap-3 sm:gap-4">
                <div
                  className="hero-social-item flex flex-col items-center gap-1.5"
                  style={{ "--social-delay": "0.1s" } as React.CSSProperties}
                >
                  <span className="hero-social-badge flex h-10 w-10 items-center justify-center rounded-full border border-fuchsia-200/80 bg-gradient-to-br from-fuchsia-50 to-orange-50 shadow-sm ring-1 ring-white/80 transition-transform duration-200 hover:-translate-y-0.5">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4.5 w-4.5 text-fuchsia-700"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
                      <circle cx="12" cy="12" r="4" />
                      <circle cx="17.5" cy="6.5" r="0.9" fill="currentColor" stroke="none" />
                    </svg>
                    <span className="sr-only">Instagram</span>
                  </span>
                  <span className="hero-social-pill">
                    <svg
                      viewBox="0 0 20 20"
                      className="h-3 w-3 fill-rose-400"
                      aria-hidden="true"
                    >
                      <path d="M10 17.3 3.9 11.8A4.17 4.17 0 0 1 9.8 6.1L10 6.3l.2-.2a4.17 4.17 0 0 1 5.9 5.9L10 17.3Z" />
                    </svg>
                    <span className="hero-social-count-window">
                      <LikeCount delayMs={100} endCount={287} />
                    </span>
                  </span>
                </div>

                <div
                  className="hero-social-item flex flex-col items-center gap-1.5"
                  style={{ "--social-delay": "0.22s" } as React.CSSProperties}
                >
                  <span className="hero-social-badge flex h-10 w-10 items-center justify-center rounded-full border border-sky-200/80 bg-gradient-to-br from-sky-50 to-blue-50 shadow-sm ring-1 ring-white/80 transition-transform duration-200 hover:-translate-y-0.5">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4.5 w-4.5 fill-current text-sky-700"
                      aria-hidden="true"
                    >
                      <path d="M13.5 21v-7.1h2.4l.36-2.77H13.5V9.36c0-.8.22-1.34 1.37-1.34h1.46V5.54c-.25-.03-1.1-.1-2.09-.1-2.07 0-3.49 1.26-3.49 3.58v2.1H8.44v2.77h2.36V21h2.7Z" />
                    </svg>
                    <span className="sr-only">Facebook</span>
                  </span>
                  <span className="hero-social-pill">
                    <svg
                      viewBox="0 0 20 20"
                      className="h-3 w-3 fill-rose-400"
                      aria-hidden="true"
                    >
                      <path d="M10 17.3 3.9 11.8A4.17 4.17 0 0 1 9.8 6.1L10 6.3l.2-.2a4.17 4.17 0 0 1 5.9 5.9L10 17.3Z" />
                    </svg>
                    <span className="hero-social-count-window">
                      <LikeCount delayMs={220} endCount={312} />
                    </span>
                  </span>
                </div>

                <div
                  className="hero-social-item flex flex-col items-center gap-1.5"
                  style={{ "--social-delay": "0.34s" } as React.CSSProperties}
                >
                  <span className="hero-social-badge flex h-10 w-10 items-center justify-center rounded-full border border-cyan-200/80 bg-gradient-to-br from-cyan-50 to-rose-50 shadow-sm ring-1 ring-white/80 transition-transform duration-200 hover:-translate-y-0.5">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4.5 w-4.5 text-stone-800"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M14 4.5c.35 1.72 1.25 3.02 2.7 3.92 1.08.67 2.16.95 2.8 1" />
                      <path d="M14 7.5v6.85a3.85 3.85 0 1 1-3.85-3.85" />
                      <path d="M14 4.5v3.1c1.14 1.53 2.76 2.45 4.85 2.75" opacity="0.45" />
                    </svg>
                    <span className="sr-only">TikTok</span>
                  </span>
                  <span className="hero-social-pill">
                    <svg
                      viewBox="0 0 20 20"
                      className="h-3 w-3 fill-rose-400"
                      aria-hidden="true"
                    >
                      <path d="M10 17.3 3.9 11.8A4.17 4.17 0 0 1 9.8 6.1L10 6.3l.2-.2a4.17 4.17 0 0 1 5.9 5.9L10 17.3Z" />
                    </svg>
                    <span className="hero-social-count-window">
                      <LikeCount delayMs={340} endCount={264} />
                    </span>
                  </span>
                </div>
              </div>
            </div>
            <form
              action="/onboarding/analyze"
              method="get"
              className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row sm:items-center"
            >
              <label htmlFor="hero-website-url" className="sr-only">
                Your website URL
              </label>
              <input
                id="hero-website-url"
                type="url"
                name="website"
                placeholder="Enter your website URL"
                className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white/90 px-4 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400"
              />
              <button
                type="submit"
                className="cta-funky shrink-0 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium !text-white shadow-sm hover:bg-stone-800 transition-colors font-display"
              >
                Get started
              </button>
            </form>
            <p className="mt-3 text-center text-sm text-stone-500">
              Don&apos;t have a website?{" "}
              <a href="/onboarding/manual" className="font-medium text-stone-700 underline underline-offset-2 hover:text-stone-900">
                Tap here.
              </a>
            </p>
          </div>

          <div className="mt-6 flex shrink-0 justify-center sm:mt-8">
            <EngagementCard />
          </div>
        </div>
      </div>
    </FramedSection>
    </div>
  );
}
