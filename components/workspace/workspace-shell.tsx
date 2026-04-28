"use client";

import { useMemo, useState } from "react";
import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  type WorkspaceState,
} from "@/lib/actions/workspace";

export function WorkspaceShell({
  workspaceId,
  initialState,
}: {
  workspaceId: string;
  initialState: WorkspaceState;
}) {
  const router = useRouter();
  const [state] = useState<WorkspaceState>(initialState);
  const [inputValue, setInputValue] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasGeneratedYet, setHasGeneratedYet] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [lastInput, setLastInput] = useState<string | null>(null);
  const [lastFormat, setLastFormat] = useState<
    "square_image" | "square_video" | "square_text"
  >("square_image");
  const [hasQueryInput, setHasQueryInput] = useState(false);
  const [showOutput, setShowOutput] = useState(Boolean(initialState.outputs[0]?.image_url));
  const [latestMediaUrl, setLatestMediaUrl] = useState<string | null>(
    initialState.outputs[0]?.image_url ?? null
  );
  const [latestMediaFormat, setLatestMediaFormat] = useState<
    "square_image" | "square_video" | "square_text"
  >("square_image");

  const planLabel = useMemo(() => {
    if (state.workspace.current_plan === "starter_pack") return "Starter Pack";
    if (state.workspace.current_plan === "unlimited") return "Pro";
    return "Free Preview";
  }, [state.workspace.current_plan]);
  const planChipClass = useMemo(() => {
    if (state.workspace.current_plan === "starter_pack") {
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    }
    if (state.workspace.current_plan === "unlimited") {
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }
    return "border-stone-200 bg-stone-100 text-stone-600";
  }, [state.workspace.current_plan]);
  const isAuthLocked = state.workspace.gate_state === "anonymous_blocked";
  const isPlanLocked = state.workspace.gate_state === "authenticated_plan_required";

  async function generateWithFormat(
    outputFormat: "square_image" | "square_video" | "square_text",
    mode: "fresh" | "regenerate"
  ) {
    const input =
      mode === "regenerate"
        ? String(lastInput ?? "").trim()
        : String(inputValue ?? "").trim();
    if (!input) {
      setWorkspaceError("Please enter a prompt or URL first.");
      return;
    }

    setWorkspaceError(null);
    setIsGenerating(true);
    try {
      const res = await fetch("/api/workspace/generate-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          input,
          outputFormat,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        setWorkspaceError(`Generation failed: ${text}`);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        result?: { finalMediaUrl?: string };
      };
      const mediaUrl = String(data?.result?.finalMediaUrl ?? "").trim();
      if (!mediaUrl) {
        setWorkspaceError("Generation succeeded but returned no media URL.");
        return;
      }
      setLatestMediaUrl(mediaUrl);
      setLastInput(input);
      setLastFormat(outputFormat);
    } catch {
      setWorkspaceError("Something went wrong. Try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleDownloadOutput(url: string) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const extension =
        blob.type === "video/mp4"
          ? "mp4"
          : blob.type === "image/png"
            ? "png"
            : blob.type === "image/jpeg"
              ? "jpg"
              : "bin";
      a.href = objectUrl;
      a.download = `mimly-output.${extension}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setWorkspaceError("Could not download output.");
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (hasGeneratedYet) return;

    const params = new URLSearchParams(window.location.search);
    const input = params.get("input");
    const format = params.get("format") || "square_image";
    setHasQueryInput(Boolean(input && input.trim()));
    if (!input) return;

    const outputFormat =
      format === "square_video" || format === "square_text"
        ? format
        : "square_image";

    let cancelled = false;
    void (async () => {
      setWorkspaceError(null);
      setIsGenerating(true);
      setInputValue(input);
      try {
        const res = await fetch("/api/workspace/generate-v2", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            input,
            outputFormat,
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          if (!cancelled) setWorkspaceError(`Generation failed: ${text}`);
          return;
        }
        const data = (await res.json().catch(() => ({}))) as {
          result?: { finalMediaUrl?: string };
        };
        const mediaUrl = String(data?.result?.finalMediaUrl ?? "").trim();
        if (!mediaUrl) {
          if (!cancelled) setWorkspaceError("Generation succeeded but returned no media URL.");
          return;
        }
        if (!cancelled) {
          setLatestMediaUrl(mediaUrl);
          setLastInput(input);
          setLastFormat(outputFormat);
          setLatestMediaFormat(outputFormat);
          setHasGeneratedYet(true);
          router.replace(`/workspace/${workspaceId}`);
        }
      } catch {
        if (!cancelled) setWorkspaceError("Something went wrong. Try again.");
      } finally {
        if (!cancelled) setIsGenerating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasGeneratedYet, router, workspaceId]);

  useEffect(() => {
    if (!latestMediaUrl) {
      setShowOutput(false);
      return;
    }
    setShowOutput(false);
    const id = window.requestAnimationFrame(() => setShowOutput(true));
    return () => window.cancelAnimationFrame(id);
  }, [latestMediaUrl]);

  return (
    <div className="space-y-4">
      <header className="flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/45 bg-white/45 px-3 py-2 shadow-[0_6px_20px_rgba(20,20,20,0.05)] backdrop-blur-md sm:h-14 sm:flex-nowrap sm:px-4 sm:py-0 lg:sticky lg:top-4 lg:z-30">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/"
            className="inline-flex rounded-full px-2 py-1.5 transition hover:bg-stone-100"
            aria-label="Back to home"
            title="Back to home"
          >
            <Image
              src="/Mimly.png"
              alt="Mimly"
              width={78}
              height={24}
              className="h-6 w-auto"
              priority
            />
          </Link>
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium sm:text-[11px] ${planChipClass}`}>
            {planLabel}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href="/"
            className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50"
          >
            Back to home
          </Link>
        </div>
      </header>

      <section className="min-h-[calc(100vh-9.5rem)] rounded-3xl border border-stone-200/90 bg-white/95 p-4 shadow-[0_8px_30px_rgba(10,10,10,0.05)] sm:p-5 lg:p-6">
        <div className="mx-auto w-full max-w-[720px] px-4">
          <div className="mb-6">
            <div className="relative">
              <div
                className={`flex min-h-[44vh] items-center justify-center rounded-2xl border border-stone-200 bg-stone-50 p-5 text-center text-sm text-stone-600 shadow-[0_6px_20px_rgba(15,23,42,0.06)] transition-opacity duration-150 sm:min-h-[52vh] ${
                  isGenerating ? "opacity-85" : "opacity-100"
                }`}
              >
                {!latestMediaUrl ? (
                  isGenerating ? (
                    <div className="text-center py-12">
                      <div className="flex justify-center">
                        <span
                          className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700"
                          aria-hidden="true"
                        />
                      </div>
                      <p className="mt-3 text-stone-500">Generating your meme...</p>
                    </div>
                  ) : (
                    <p className="text-center text-stone-500">
                      Enter an idea to generate your first meme
                    </p>
                  )
                ) : latestMediaFormat === "square_video" ||
                  /\.(mp4|webm|m4v)(\?|#|$)/i.test(latestMediaUrl) ? (
                  <div
                    className={`w-full space-y-3 transition-opacity duration-150 ${
                      showOutput ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    <video
                      src={latestMediaUrl}
                      controls
                      className="mx-auto max-h-[70vh] w-full rounded-2xl bg-black shadow-[0_4px_16px_rgba(15,23,42,0.14)]"
                    />
                  <button
                    type="button"
                    onClick={() => void handleDownloadOutput(latestMediaUrl)}
                      className="inline-flex rounded-md border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                    >
                    Download
                  </button>
                  </div>
                ) : (
                  <div
                    className={`w-full space-y-3 transition-opacity duration-150 ${
                      showOutput ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={latestMediaUrl}
                      alt="Latest generated output"
                      className="mx-auto max-h-[70vh] w-full rounded-2xl object-contain shadow-[0_4px_16px_rgba(15,23,42,0.14)]"
                    />
                  <button
                    type="button"
                    onClick={() => void handleDownloadOutput(latestMediaUrl)}
                      className="inline-flex rounded-md border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                    >
                    Download
                  </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-center flex-wrap">
            <button
              type="button"
              onClick={() => void generateWithFormat(lastFormat, "regenerate")}
              disabled={isGenerating || isAuthLocked || isPlanLocked}
              className="inline-flex h-10 items-center justify-center rounded-md border border-sky-300 bg-sky-50 px-4 text-xs font-semibold text-sky-700 shadow-sm transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              🔁 {isGenerating ? "Generating..." : "Regenerate"}
            </button>
            <button
              type="button"
              onClick={() => void generateWithFormat("square_video", "fresh")}
              disabled={isGenerating || isAuthLocked || isPlanLocked}
              className="inline-flex h-10 items-center justify-center rounded-md border border-stone-300 bg-stone-100 px-4 text-xs font-semibold text-stone-700 shadow-sm transition hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGenerating ? "Generating..." : "🎥 Video"}
            </button>
            <button
              type="button"
              onClick={() => void generateWithFormat("square_image", "fresh")}
              disabled={isGenerating || isAuthLocked || isPlanLocked}
              className="inline-flex h-10 items-center justify-center rounded-md border border-stone-300 bg-stone-100 px-4 text-xs font-semibold text-stone-700 shadow-sm transition hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGenerating ? "Generating..." : "📸 Image"}
            </button>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-center text-sm text-stone-500">
              Edit or create something new
            </p>
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Describe what you want next..."
              className="w-full rounded-lg border border-stone-200/90 bg-stone-50/50 px-4 py-3 text-[14px] text-stone-800 placeholder:text-stone-400 focus:border-sky-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-200/70"
              disabled={isGenerating || isAuthLocked || isPlanLocked}
            />
            {workspaceError ? (
              <p className="mt-2 text-[11px] text-rose-600">{workspaceError}</p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
