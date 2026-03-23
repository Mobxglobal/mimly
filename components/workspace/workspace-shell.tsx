"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  getWorkspaceState,
  pinWorkspaceOutput,
  sendWorkspaceMessage,
  startGenerationIfQueued,
  unpinWorkspaceOutput,
  type WorkspaceState,
} from "@/lib/actions/workspace";
import { MessageList } from "@/components/workspace/message-list";
import { OutputPanel } from "@/components/workspace/output-panel";
import { PromptComposer } from "@/components/workspace/prompt-composer";
import { getLatestSidebarTurn } from "@/lib/workspace/sidebar-turn";
import chatIcon from "@/assets/icons/chat.png";

export function WorkspaceShell({
  workspaceId,
  initialState,
}: {
  workspaceId: string;
  initialState: WorkspaceState;
}) {
  const [state, setState] = useState<WorkspaceState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const bootedQueuedStart = useRef(false);

  const latestJob = state.latestJob;
  const isJobActive =
    latestJob?.status === "queued" || latestJob?.status === "running";

  useEffect(() => {
    if (bootedQueuedStart.current) return;
    if (latestJob?.status !== "queued") return;
    bootedQueuedStart.current = true;
    void startGenerationIfQueued(workspaceId);
  }, [latestJob?.status, workspaceId]);

  useEffect(() => {
    if (!isJobActive) return;
    const timer = setInterval(async () => {
      const next = await getWorkspaceState(workspaceId);
      if (next.error || !next.state) return;
      setState(next.state);
    }, 2500);
    return () => clearInterval(timer);
  }, [isJobActive, workspaceId]);

  const planLabel = useMemo(() => {
    if (state.workspace.current_plan === "starter_pack") return "Starter Pack";
    if (state.workspace.current_plan === "unlimited") return "Unlimited";
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

  const statusLabel = latestJob?.status ?? "idle";
  const isAuthLocked = state.workspace.gate_state === "anonymous_blocked";
  const isPlanLocked = state.workspace.gate_state === "authenticated_plan_required";
  const displayStatusLabel =
    state.workspace.gate_state === "unlocked" &&
    (statusLabel === "blocked_auth" || statusLabel === "blocked_payment")
      ? "ready"
      : statusLabel;
  const sidebarTurn = useMemo(
    () =>
      getLatestSidebarTurn({
        messages: state.messages,
        isAuthLocked,
        isAuthenticated: Boolean(state.workspace.user_id),
        linkedAt: state.workspace.linked_at,
      }),
    [isAuthLocked, state.messages, state.workspace.linked_at, state.workspace.user_id]
  );
  const sidebarMessages = [
    sidebarTurn.userMessage,
    sidebarTurn.assistantMessage,
  ].filter((message): message is NonNullable<typeof message> => Boolean(message));
  const statusClass =
    displayStatusLabel === "completed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : displayStatusLabel === "queued" || displayStatusLabel === "running"
        ? "border-sky-200 bg-sky-50 text-sky-700"
        : displayStatusLabel === "blocked_auth"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : displayStatusLabel === "blocked_payment"
            ? "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700"
          : displayStatusLabel === "failed"
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : "border-stone-200 bg-stone-100 text-stone-600";
  const pinnedCount = state.outputs.filter((output) => output.is_pinned).length;

  const submitMessage = async (prompt: string) => {
    setError(null);
    const result = await sendWorkspaceMessage(workspaceId, prompt);
    if (result.error || !result.state) {
      setError(result.error ?? "Failed to send message.");
      return;
    }
    setState(result.state);
  };

  return (
    <div className="space-y-4">
      <header className="flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-2xl border border-stone-200/90 bg-white/95 px-3 py-2 shadow-[0_6px_18px_rgba(20,20,20,0.06)] sm:h-14 sm:flex-nowrap sm:px-4 sm:py-0">
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
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50"
          >
            Back to home
          </Link>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-9.5rem)] gap-4 lg:grid-cols-[340px_1fr] lg:gap-5">
      <aside className="order-1 flex h-[52vh] min-h-[440px] flex-col rounded-3xl border border-stone-200/80 bg-stone-50/80 p-3.5 shadow-[0_8px_28px_rgba(10,10,10,0.05)] sm:h-[58vh] sm:p-4 lg:h-[76vh] lg:min-h-[640px] lg:max-h-[760px] lg:self-start">
        <div className="flex items-center justify-between gap-2 px-0.5">
          <div
            aria-label="Chat"
            title="Chat"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700"
          >
            <Image
              src={chatIcon}
              alt=""
              width={16}
              height={16}
              className="h-4 w-4 object-contain"
              aria-hidden="true"
            />
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wide ${statusClass}`}>
            {displayStatusLabel.replace("_", " ")}
          </span>
        </div>
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
          <div className="min-h-[112px] max-h-[170px] overflow-y-auto pr-1 lg:max-h-[190px]">
            <MessageList
              messages={sidebarMessages}
              onPillClick={submitMessage}
            />
          </div>

          {isJobActive ? (
            <div className="rounded-2xl border border-sky-100 bg-white/80 px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-sky-700">
                <div className="flex items-center gap-1">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse"
                    style={{ animationDelay: "180ms" }}
                  />
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse"
                    style={{ animationDelay: "360ms" }}
                  />
                </div>
                <span>Working on this now...</span>
              </div>
            </div>
          ) : null}

          <div className="border-t border-stone-200/90 bg-stone-50/90 pt-3">
            <PromptComposer
              disabled={isAuthLocked || isPlanLocked}
              disabledPlaceholder={
                isAuthLocked
                  ? "Sign in to continue this thread"
                  : isPlanLocked
                    ? "Choose a plan to continue this thread"
                    : "What should we create next?"
              }
              onSubmit={submitMessage}
            />
            {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
          </div>

          <div className="rounded-2xl border border-stone-200/90 bg-white/70 px-3 py-3 text-[11px] leading-relaxed text-stone-500">
            <p className="mb-2 text-xs font-semibold text-stone-700">How Mimly works</p>
            <p>Each message creates one result.</p>
            <p>Ask for “more ideas” to get another version.</p>
            <p className="mt-2">Your latest prompt guides what happens next.</p>
            <p>You can switch topics anytime.</p>
            <p className="mt-2">You can create:</p>
            <p>Image • Video • Text • Slideshow</p>
            <p className="mt-2">Optimised for social:</p>
            <p>1080×1080 or 1080×1920 (feeds, reels, TikTok).</p>
            <p className="mt-2">
              Mimly works best when your prompt is specific.
            </p>
            <p className="mt-2">
              Mimly generates all content using our AI context engine that was built in-house.
            </p>
          </div>
        </div>
      </aside>

      <section className="order-2 rounded-3xl border border-stone-200/90 bg-white/95 p-4 shadow-[0_8px_30px_rgba(10,10,10,0.05)] sm:p-5 lg:p-6">
        <OutputPanel
          latestJob={state.latestJob}
          outputs={state.outputs}
          workspaceId={workspaceId}
          pinnedCount={pinnedCount}
          gateState={state.workspace.gate_state}
          onTogglePin={async (outputId, shouldPin) => {
            const result = shouldPin
              ? await pinWorkspaceOutput(workspaceId, outputId)
              : await unpinWorkspaceOutput(workspaceId, outputId);
            if (result.error) {
              setError(result.error);
              return;
            }
            const next = await getWorkspaceState(workspaceId);
            if (next.error || !next.state) {
              setError(next.error ?? "Failed to refresh workspace state.");
              return;
            }
            setState(next.state);
          }}
          onPlanUnlocked={async () => {
            const next = await getWorkspaceState(workspaceId);
            if (next.error || !next.state) return;
            setState(next.state);
          }}
        />
      </section>
      </div>
    </div>
  );
}
