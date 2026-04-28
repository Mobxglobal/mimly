"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Globe, Link as LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { FramedSection } from "./framed-section";
import { HeroNav } from "./hero-nav";
import { HERO_BACKGROUND_IMAGE_SRC } from "@/lib/marketing/hero-background";
import { getOrCreateSessionId } from "@/lib/session/client-session";

const COUNT_START = 24;
const COUNT_DURATION_MS = 2500;
const HERO_PROMPT_EXAMPLES = [
  "Memes for my plumbing business",
  "Funny posts about running a small business",
  "Content for a fitness coach audience",
  "Marketing mistakes as memes",
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
  const [mode, setMode] = useState<"prompt" | "url">("prompt");
  const [promptText, setPromptText] = useState("");
  const [urlValue, setUrlValue] = useState("");
  const [promptError, setPromptError] = useState<string | null>(null);
  const [isSubmittingPrompt, setIsSubmittingPrompt] = useState(false);
  type HomepageFamilyChip = "Image" | "Video";
  const [selectedFamilyChip, setSelectedFamilyChip] = useState<HomepageFamilyChip | null>(
    null
  );
  const [hoveredFamilyChip, setHoveredFamilyChip] = useState<HomepageFamilyChip | null>(
    null
  );
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [typedPlaceholder, setTypedPlaceholder] = useState("");
  const [isPromptFocused, setIsPromptFocused] = useState(false);
  const [heroPromptRows, setHeroPromptRows] = useState(3);
  const promptFormRef = useRef<HTMLFormElement | null>(null);
  const router = useRouter();

  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setHeroPromptRows(mq.matches ? 3 : 2);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (mode !== "url") return;
    const id = window.requestAnimationFrame(() => {
      document.getElementById("hero-site-url")?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [mode]);

  const chipHoverText: Record<HomepageFamilyChip, string> = {
    Image: "Generate a 1080x1080 image meme designed for social feed posts.",
    Video: "Generate a 1080x1080 video meme designed for social feed posts.",
  };

  useEffect(() => {
    const isInteracting = isPromptFocused || promptText.trim().length > 0;
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
  }, [isPromptFocused, promptText, placeholderIndex]);

  return (
    <div className="w-full">
      <FramedSection
        variant="hero"
        id="hero"
        aria-labelledby="hero-heading"
        className="w-full"
        heroBackgroundSrc={HERO_BACKGROUND_IMAGE_SRC}
      >
        <div className="flex min-h-[70vh] flex-col items-center gap-8 md:gap-12">
          {/* Nav inside hero container */}
          <div className="w-full">
            <HeroNav />
          </div>

        {/* Main hero content – stacked on all breakpoints */}
        <div className="flex w-full flex-1 flex-col items-center justify-start gap-8 px-4 pt-2 text-center sm:pt-3 md:pt-4">
          <div className="relative mt-2 sm:mt-3 md:mt-4">
            <h1
              id="hero-heading"
              className="mx-auto max-w-3xl text-pretty text-3xl font-[550] tracking-normal leading-tight text-stone-900 sm:text-4xl md:text-5xl"
            >
              Scroll-stopping <em className="italic">memes</em> for
              <br />
              your brand, in{" "}
              <span className="underline decoration-stone-900 underline-offset-[0.12em]">seconds</span>
              .
            </h1>
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
            <form
              ref={promptFormRef}
              onSubmit={async (event) => {
                event.preventDefault();
                if (isSubmittingPrompt) return;

                const prompt = promptText;
                const url = urlValue;
                const rawInput = prompt?.trim() || url?.trim() || "";
                const input = rawInput.length > 0 ? rawInput : null;
                if (!input) {
                  console.warn("Homepage submit blocked: empty input");
                  return;
                }

                setPromptError(null);
                setIsSubmittingPrompt(true);
                const familyMapping =
                  selectedFamilyChip === "Image"
                    ? {
                        outputFormat: "square_image" as const,
                      }
                    : selectedFamilyChip === "Video"
                      ? {
                          outputFormat: "square_video" as const,
                        }
                      : null;

                try {
                  const sessionId = getOrCreateSessionId();
                  console.log("[session] id:", sessionId);

                  const bootstrapRes = await fetch("/api/workspace/bootstrap", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({ session_id: sessionId }),
                  });
                  const bootstrapData = (await bootstrapRes.json().catch(() => ({}))) as {
                    workspaceId?: string;
                    error?: string;
                  };
                  if (!bootstrapRes.ok || !bootstrapData.workspaceId) {
                    setPromptError(bootstrapData.error ?? "Failed to start workspace.");
                    setIsSubmittingPrompt(false);
                    return;
                  }

                  const outputFormat = familyMapping?.outputFormat ?? "square_image";
                  router.push(
                    `/workspace/${bootstrapData.workspaceId}?input=${encodeURIComponent(
                      input
                    )}&format=${outputFormat}`
                  );
                  return;
                } catch {
                  setPromptError("Something went wrong. Try again.");
                  setIsSubmittingPrompt(false);
                }
              }}
              className="mx-auto mt-8 w-full max-w-4xl"
            >
              <div className="relative overflow-visible rounded-[30px] border border-stone-200/90 bg-gradient-to-b from-white to-stone-50 p-2 shadow-[0_12px_36px_rgba(20,24,40,0.12)] ring-1 ring-white/80">
                <div className="relative rounded-[24px] border border-stone-200/80 bg-white/95 p-4 sm:p-5">
                  <label htmlFor="hero-prompt" className="sr-only">
                    Describe what you want to generate
                  </label>
                  <div className="relative mb-4">
                    {hoveredFamilyChip && selectedFamilyChip === null ? (
                      <div className="pointer-events-none absolute top-full left-0 z-20 mt-2 hidden max-w-[320px] rounded-2xl border border-stone-200/90 bg-white/95 px-4 py-2.5 text-[13px] font-semibold leading-snug text-stone-700 shadow-md ring-1 ring-stone-100 whitespace-normal md:flex">
                        {chipHoverText[hoveredFamilyChip]}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                    {(["Image", "Video"] as HomepageFamilyChip[]).map(
                      (label) => {
                      const isActive = selectedFamilyChip === label;
                      const hasAnySelection = selectedFamilyChip !== null;
                      const chipColor =
                        label === "Image"
                          ? {
                              baseBg: "bg-sky-50/60",
                              baseBorder: "border-sky-200/70",
                              baseText: "text-sky-800",
                              activeBg: "bg-sky-100",
                              activeBorder: "border-sky-400",
                              activeText: "text-sky-900",
                              hoverBg: "hover:bg-sky-50/50",
                            }
                          : label === "Video"
                            ? {
                                baseBg: "bg-violet-50/60",
                                baseBorder: "border-violet-200/70",
                                baseText: "text-violet-800",
                                activeBg: "bg-violet-100",
                                activeBorder: "border-violet-400",
                                activeText: "text-violet-900",
                                hoverBg: "hover:bg-violet-50/50",
                              }
                            : label === "Text"
                              ? {
                                  baseBg: "bg-amber-50/75",
                                  baseBorder: "border-amber-200/70",
                                  baseText: "text-amber-900",
                                  activeBg: "bg-amber-100",
                                  activeBorder: "border-amber-400",
                                  activeText: "text-amber-900",
                                  hoverBg: "hover:bg-amber-50/55",
                                }
                              : {
                                  baseBg: "bg-rose-50/60",
                                  baseBorder: "border-rose-200/70",
                                  baseText: "text-rose-800",
                                  activeBg: "bg-rose-100",
                                  activeBorder: "border-rose-400",
                                  activeText: "text-rose-900",
                                  hoverBg: "hover:bg-rose-50/50",
                                };

                      const tooltipText = chipHoverText[label];
                      return (
                        <div key={label} className="relative">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedFamilyChip((cur) =>
                                cur === label ? null : label
                              );
                              if (promptError) setPromptError(null);
                            }}
                            onMouseEnter={() => setHoveredFamilyChip(label)}
                            onMouseLeave={() => setHoveredFamilyChip((cur) => (cur === label ? null : cur))}
                            onFocus={() => setHoveredFamilyChip(label)}
                            onBlur={() => setHoveredFamilyChip((cur) => (cur === label ? null : cur))}
                            className={[
                              "cursor-pointer rounded-full border px-2.5 py-1.25 text-[12px] font-semibold shadow-sm ring-1 ring-white/70 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-200/80 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
                              isActive
                                ? `${chipColor.activeBg} ${chipColor.activeBorder} ${chipColor.activeText} scale-[1.03] shadow-md ring-2 ring-current/20`
                                : `${chipColor.baseBg} ${chipColor.baseBorder} ${chipColor.baseText}`,
                              !isActive && hasAnySelection ? "opacity-75" : "",
                              isActive ? "" : chipColor.hoverBg,
                            ].join(" ")}
                            aria-pressed={isActive}
                            aria-label={`${label}. ${tooltipText}`}
                          >
                            <span className="inline-flex items-center gap-1.5">
                              {isActive ? (
                                <span aria-hidden="true" className="text-[11px] leading-none">✓</span>
                              ) : null}
                              <span>{label}</span>
                            </span>
                          </button>
                        </div>
                      );
                    })}
                    </div>
                  </div>

                  <div className="relative grid transition-all duration-200 ease-in-out [&>*]:col-start-1 [&>*]:row-start-1">
                    <div
                      className={cn(
                        "min-w-0 transition-opacity duration-200 ease-in-out",
                        mode === "prompt"
                          ? "visible opacity-100"
                          : "invisible pointer-events-none opacity-0"
                      )}
                      aria-hidden={mode !== "prompt"}
                    >
                      <div className="relative">
                        <textarea
                          id="hero-prompt"
                          tabIndex={mode === "prompt" ? 0 : -1}
                          value={promptText}
                          onChange={(event) => {
                            setPromptText(event.target.value);
                            if (promptError) setPromptError(null);
                          }}
                          onFocus={() => setIsPromptFocused(true)}
                          onBlur={() => setIsPromptFocused(false)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              if (!isSubmittingPrompt) {
                                promptFormRef.current?.requestSubmit();
                              }
                            }
                          }}
                          rows={heroPromptRows}
                          placeholder=""
                          className="w-full resize-none border-none bg-transparent text-left text-base leading-[1.4625] text-stone-900 placeholder:text-stone-500 focus:outline-none md:text-lg"
                        />
                        {!promptText.trim() ? (
                          <span className="pointer-events-none absolute left-0 right-0 top-0 z-0 text-left text-base leading-[1.4625] text-stone-500 md:text-lg">
                            {typedPlaceholder}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div
                      className={cn(
                        "min-w-0 transition-opacity duration-200 ease-in-out",
                        mode === "url"
                          ? "visible opacity-100"
                          : "invisible pointer-events-none opacity-0"
                      )}
                      aria-hidden={mode !== "url"}
                    >
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => setMode("prompt")}
                          className="w-fit text-xs text-stone-400 transition-colors hover:text-stone-700"
                        >
                          ← Back to prompt
                        </button>

                        <div className="relative mx-auto w-full max-w-2xl">
                          <Globe
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                            aria-hidden
                          />

                          <label htmlFor="hero-site-url" className="sr-only">
                            Website URL
                          </label>

                          <input
                            id="hero-site-url"
                            type="url"
                            tabIndex={mode === "url" ? 0 : -1}
                            value={urlValue}
                            onChange={(e) => {
                              setUrlValue(e.target.value);
                              if (promptError) setPromptError(null);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                if (!isSubmittingPrompt) {
                                  promptFormRef.current?.requestSubmit();
                                }
                              }
                            }}
                            placeholder="Paste your website URL..."
                            className="w-full rounded-md border border-stone-300/90 bg-stone-50/35 py-2.5 pr-4 pl-10 text-sm text-stone-800 shadow-[0_1px_0_rgba(0,0,0,0.04)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-black/70"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="-mx-4 mt-3 flex items-center justify-between gap-3 border-t border-stone-200/70 px-4 pt-3 sm:-mx-5 sm:px-5 sm:pt-3.5">
                    <div className="min-w-0 flex-1">
                      {mode === "prompt" ? (
                        <button
                          type="button"
                          onClick={() => setMode("url")}
                          className="flex items-center gap-2 text-sm text-stone-500 transition-colors hover:text-stone-800"
                        >
                          <LinkIcon className="h-4 w-4 shrink-0" aria-hidden />
                          Build from site
                        </button>
                      ) : null}
                    </div>
                    <button
                      type="submit"
                      aria-label="Start workspace"
                      aria-busy={isSubmittingPrompt}
                      disabled={isSubmittingPrompt}
                      className={cn(
                        "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-stone-900 px-4 text-sm font-semibold text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-200/80 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
                        isSubmittingPrompt
                          ? "cursor-default scale-[0.98] bg-stone-800/95 opacity-80 transition-all"
                          : "cursor-pointer hover:bg-stone-800"
                      )}
                    >
                      <span>Generate</span>
                      {isSubmittingPrompt ? (
                        <span
                          className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
                          aria-hidden="true"
                        />
                      ) : null}
                    </button>
                  </div>
                </div>
              </div>
            </form>
            {promptError ? (
              <p className="mt-2 text-center text-sm text-rose-600">{promptError}</p>
            ) : null}
          </div>
        </div>
      </div>
    </FramedSection>
    </div>
  );
}
