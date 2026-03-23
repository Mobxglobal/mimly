"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  getWorkspaceState,
  sendWorkspaceMessage,
  startGenerationIfQueued,
  type WorkspaceState,
} from "@/lib/actions/workspace";
import { MessageList } from "@/components/workspace/message-list";
import { OutputPanel } from "@/components/workspace/output-panel";
import { PromptComposer } from "@/components/workspace/prompt-composer";
import { getLatestSidebarTurn } from "@/lib/workspace/sidebar-turn";

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
      <header className="flex h-14 items-center justify-between rounded-2xl border border-stone-200/90 bg-white/95 px-4 shadow-[0_6px_18px_rgba(20,20,20,0.06)]">
        <div className="flex items-center gap-3">
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
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${planChipClass}`}>
            {planLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/workspace/${workspaceId}/settings`}
            className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50"
          >
            Settings
          </Link>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-9.5rem)] gap-5 lg:grid-cols-[340px_1fr]">
      <aside className="flex h-full min-h-[74vh] flex-col rounded-3xl border border-stone-200/80 bg-stone-50/80 p-4 shadow-[0_8px_28px_rgba(10,10,10,0.05)]">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-sm font-semibold tracking-wide text-stone-800">Mimly chat</h1>
          <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wide ${statusClass}`}>
            {displayStatusLabel.replace("_", " ")}
          </span>
        </div>
        <div className="mt-3 flex-1 overflow-y-auto pr-1">
          <MessageList
            messages={sidebarMessages}
            onPillClick={submitMessage}
          />
        </div>
        <div className="mt-3 border-t border-stone-200/90 bg-stone-50/90 pt-3">
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
      </aside>

      <section className="rounded-3xl border border-stone-200/90 bg-white/95 p-6 shadow-[0_8px_30px_rgba(10,10,10,0.05)]">
        <OutputPanel
          latestJob={state.latestJob}
          outputs={state.outputs}
          workspaceId={workspaceId}
          gateState={state.workspace.gate_state}
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
