"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { FramedSection } from "./framed-section";
import { HeroNav } from "./hero-nav";
import { EngagementCard } from "./engagement-card";
import { createClient } from "@/lib/supabase/client";
import { createWorkspaceFromPrompt } from "@/lib/actions/workspace";

const COUNT_START = 24;
const COUNT_DURATION_MS = 2500;
const HERO_PROMPT_EXAMPLES = [
  "Create memes for my coffee shop to help engage people on Instagram",
  "Make funny memes for a personal trainer targeting busy professionals",
  "Create a viral slideshow for a skincare brand to post on TikTok",
  "Generate relatable memes for a real estate agent to attract first-time buyers",
] as const;
const PLACEHOLDER_INITIAL_DELAY_MS = 400;
const PLACEHOLDER_VISIBLE_MS = 1800;
const PLACEHOLDER_TYPE_MS = 24;
const PLACEHOLDER_DELETE_MS = 14;

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
  const [hasSession, setHasSession] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [promptError, setPromptError] = useState<string | null>(null);
  const [isSubmittingPrompt, setIsSubmittingPrompt] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [typedPlaceholder, setTypedPlaceholder] = useState("");
  const [isPromptFocused, setIsPromptFocused] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const isInteracting = isPromptFocused || prompt.trim().length > 0;
    if (isInteracting) {
      setTypedPlaceholder("");
      return;
    }

    const fullText = HERO_PROMPT_EXAMPLES[placeholderIndex];
    let i = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      if (!deleting) {
        i += 1;
        setTypedPlaceholder(fullText.slice(0, i));
        if (i >= fullText.length) {
          deleting = true;
          timer = setTimeout(tick, PLACEHOLDER_VISIBLE_MS);
          return;
        }
        timer = setTimeout(tick, PLACEHOLDER_TYPE_MS);
        return;
      }

      i -= 1;
      setTypedPlaceholder(fullText.slice(0, Math.max(0, i)));
      if (i <= 0) {
        setPlaceholderIndex((prev) => (prev + 1) % HERO_PROMPT_EXAMPLES.length);
        return;
      }
      timer = setTimeout(tick, PLACEHOLDER_DELETE_MS);
    };

    const startTimer = setTimeout(() => {
      timer = setTimeout(tick, PLACEHOLDER_TYPE_MS);
    }, PLACEHOLDER_INITIAL_DELAY_MS);

    return () => {
      clearTimeout(startTimer);
      if (timer) clearTimeout(timer);
    };
  }, [isPromptFocused, prompt, placeholderIndex]);

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
              While brands plan campaigns, the internet shares memes. Our{" "}
              <span className="inline-block rounded-md bg-sky-200/70 px-1.5 py-0.5 font-medium text-stone-900 ring-1 ring-sky-300/60 mx-0.5 my-0.5">
                AI meme generator
              </span>{" "}
              helps brands create contextually relevant{" "}
              <span className="inline-block rounded-md bg-sky-200/70 px-1.5 py-0.5 font-medium text-stone-900 ring-1 ring-sky-300/60 mx-0.5 my-0.5">
                memes &amp; slideshows
              </span>{" "}
              for social media.
            </p>
            {/* <div className="mt-5 flex items-center justify-center">
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
            </div> */}
            {hasSession ? (
              <div className="mx-auto mt-8 flex flex-col items-center gap-3">
                <Link
                  href="/workspace"
                  className="cta-funky shrink-0 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium !text-white shadow-sm hover:bg-stone-800 transition-colors font-display"
                >
                  Workspace
                </Link>
              </div>
            ) : (
              <>
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const nextPrompt = prompt.trim();
                    if (isSubmittingPrompt) return;
                    if (!nextPrompt || nextPrompt.length < 8) {
                      setPromptError("Please enter a longer prompt so we can generate better results.");
                      return;
                    }
                    setPromptError(null);
                    setIsSubmittingPrompt(true);
                    const result = await createWorkspaceFromPrompt(nextPrompt);
                    setIsSubmittingPrompt(false);
                    if (result.error || !result.workspaceId) {
                      setPromptError(result.error ?? "Failed to start workspace.");
                      return;
                    }
                    router.push(`/workspace/${result.workspaceId}`);
                  }}
                  className="mx-auto mt-10 w-full max-w-4xl"
                >
                  <div className="relative overflow-hidden rounded-[30px] border border-stone-200/90 bg-gradient-to-b from-white to-stone-50 p-3 shadow-[0_18px_55px_rgba(20,24,40,0.14)] ring-1 ring-white/80">
                    <div className="relative rounded-[24px] border border-stone-200/80 bg-white/95 p-5 sm:p-6">
                      <label htmlFor="hero-prompt" className="sr-only">
                        Describe what you want to generate
                      </label>
                      <textarea
                        id="hero-prompt"
                        value={prompt}
                        onChange={(event) => {
                          setPrompt(event.target.value);
                          if (promptError) setPromptError(null);
                        }}
                        onFocus={() => setIsPromptFocused(true)}
                        onBlur={() => setIsPromptFocused(false)}
                        rows={3}
                        placeholder=""
                        className="w-full resize-none border-none bg-transparent text-left text-lg leading-relaxed text-stone-900 placeholder:text-stone-500 focus:outline-none"
                      />
                      {!prompt.trim() ? (
                        <span
                          className="pointer-events-none absolute left-5 right-5 top-5 text-left text-base leading-relaxed text-stone-500 sm:text-lg"
                        >
                          {typedPlaceholder}
                        </span>
                      ) : null}

                      <div className="mt-4 flex items-center justify-end gap-3">
                        <button
                          type="submit"
                          disabled={isSubmittingPrompt}
                          aria-label={isSubmittingPrompt ? "Starting workspace" : "Start workspace"}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-stone-900 text-lg font-semibold text-white shadow-sm transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSubmittingPrompt ? "…" : "↑"}
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
                {isSubmittingPrompt ? (
                  <p className="mt-3 text-center text-sm text-stone-500">
                    Creating your workspace...
                  </p>
                ) : null}
                {promptError ? (
                  <p className="mt-2 text-center text-sm text-rose-600">{promptError}</p>
                ) : null}
              </>
            )}
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
