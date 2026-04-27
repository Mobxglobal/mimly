"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  deleteWorkspaceOutput,
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
import { FeedbackModal } from "@/components/feedback/feedback-modal";
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
  /** "thread" = normal send box; "new_idea" = same dock, replace context (prompt or URL). */
  const [chatInputMode, setChatInputMode] = useState<"thread" | "new_idea">("thread");
  const [newIdeaMode, setNewIdeaMode] = useState<"prompt" | "url">("prompt");
  const [newIdeaPrompt, setNewIdeaPrompt] = useState("");
  const [newIdeaUrl, setNewIdeaUrl] = useState("");
  const [newIdeaSubmitting, setNewIdeaSubmitting] = useState(false);
  const [newIdeaError, setNewIdeaError] = useState<string | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackAnswers, setFeedbackAnswers] = useState<{
    firstMemeThought: "good" | "average" | "awful" | null;
    wouldUseAgain: "yes" | "no" | "maybe" | null;
    looksLikeAiSlop: "yes" | "no" | "a_bit" | null;
  }>({
    firstMemeThought: null,
    wouldUseAgain: null,
    looksLikeAiSlop: null,
  });
  const pendingGenerationActionRef = useRef<null | (() => Promise<void>)>(null);
  const processedCompletedJobIdsRef = useRef<Set<string>>(new Set());
  const bootedQueuedStart = useRef(false);
  const homepageIntentProcessedRef = useRef(false);
  const hasTriggeredRef = useRef(false);

  const latestJob = state.latestJob;
  const isJobActive =
    latestJob?.status === "queued" || latestJob?.status === "running";

  useEffect(() => {
    if (latestJob?.status !== "queued") {
      bootedQueuedStart.current = false;
      return;
    }
    if (bootedQueuedStart.current) return;
    bootedQueuedStart.current = true;
    void startGenerationIfQueued(workspaceId);
  }, [latestJob?.status, latestJob?.id, workspaceId]);

  useEffect(() => {
    hasTriggeredRef.current = false;
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    if (hasTriggeredRef.current) return;
    if (typeof window === "undefined") return;

    if (latestJob?.status === "running") {
      console.log("[workspace] skipping generation — job already running");
      return;
    }

    const rawIntent = window.sessionStorage.getItem("homepage-workspace-intent");
    if (rawIntent) {
      try {
        const parsed = JSON.parse(rawIntent) as { value?: unknown };
        const v =
          parsed?.value != null ? String(parsed.value).trim() : "";
        if (v) {
          hasTriggeredRef.current = true;
          return;
        }
      } catch {
        /* fall through to POST /new-idea */
      }
    }

    hasTriggeredRef.current = true;
    console.log("[workspace] triggering generation", {
      workspaceId,
      latestJobStatus: latestJob?.status ?? null,
    });
    void fetch("/api/workspace/new-idea", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({ workspaceId }),
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        console.log("[workspace] generation response:", { ok: res.ok, data });
        if (res.ok) {
          const next = await getWorkspaceState(workspaceId);
          if (!next.error && next.state) setState(next.state);
        }
      })
      .catch((err) => {
        console.error("[workspace] generation error:", err);
      });
  }, [workspaceId, latestJob?.status]);

  useEffect(() => {
    if (homepageIntentProcessedRef.current) return;
    homepageIntentProcessedRef.current = true;
    if (typeof window === "undefined") return;

    const rawIntent = window.sessionStorage.getItem("homepage-workspace-intent");
    if (!rawIntent) return;
    window.sessionStorage.removeItem("homepage-workspace-intent");

    type HomepageIntent = {
      inputType?: "prompt" | "url";
      value?: string;
      preferredOutputFormat?: "square_image" | "square_video" | "vertical_slideshow" | "square_text";
      templateFamilyPreference?: "engagement_text" | null;
    };

    let intent: HomepageIntent | null = null;
    try {
      intent = JSON.parse(rawIntent) as HomepageIntent;
    } catch {
      intent = null;
    }
    if (!intent?.value || !String(intent.value).trim()) return;

    const inputType = intent.inputType === "url" ? "url" : "prompt";
    const value = String(intent.value).trim();
    console.log("[workspace] processing intent", { workspaceId, inputType });

    if (inputType === "url") {
      void (async () => {
        await fetch("/api/workspace/new-idea", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            workspaceId,
            inputType: "url",
            url: value,
            preferredOutputFormat: intent?.preferredOutputFormat,
            templateFamilyPreference: intent?.templateFamilyPreference ?? null,
          }),
        }).catch(() => null);

        const next = await getWorkspaceState(workspaceId);
        if (!next.error && next.state) setState(next.state);
      })();
      return;
    }

    void (async () => {
      const sent = await sendWorkspaceMessage(workspaceId, value, {
        preferredOutputFormat: intent?.preferredOutputFormat,
        templateFamilyPreference: intent?.templateFamilyPreference ?? null,
      });
      if (!sent.error && sent.state) setState(sent.state);
    })();
  }, [workspaceId]);

  useEffect(() => {
    if (!isJobActive) return;
    const timer = setInterval(async () => {
      const next = await getWorkspaceState(workspaceId);
      if (next.error || !next.state) return;
      setState(next.state);
    }, 2500);
    return () => clearInterval(timer);
  }, [isJobActive, workspaceId]);

  const getGenerationCount = () => {
    if (typeof window === "undefined") return 0;
    const raw = window.localStorage.getItem("mimly_generation_count");
    const parsed = Number(raw ?? "0");
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };

  const isFeedbackCompleted = () => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("mimly_feedback_completed") === "true";
  };

  const ensureSessionId = () => {
    if (typeof window === "undefined") return "";
    const existing = window.localStorage.getItem("mimly_session_id");
    if (existing) return existing;
    const next = crypto.randomUUID();
    window.localStorage.setItem("mimly_session_id", next);
    return next;
  };

  const runWithFeedbackGate = async (action: () => Promise<void>) => {
    const generationCount = getGenerationCount();
    if (generationCount >= 1 && !isFeedbackCompleted()) {
      pendingGenerationActionRef.current = action;
      setShowFeedbackModal(true);
      return;
    }
    await action();
  };

  useEffect(() => {
    if (latestJob?.status !== "completed" || !latestJob.id) return;
    if (processedCompletedJobIdsRef.current.has(latestJob.id)) return;
    processedCompletedJobIdsRef.current.add(latestJob.id);
    if (typeof window === "undefined") return;
    const countedRaw = window.localStorage.getItem("mimly_counted_generation_job_ids");
    let countedIds: string[] = [];
    try {
      const parsed = countedRaw ? (JSON.parse(countedRaw) as unknown) : [];
      countedIds = Array.isArray(parsed)
        ? parsed.map((v) => String(v)).filter(Boolean)
        : [];
    } catch {
      countedIds = [];
    }
    if (countedIds.includes(latestJob.id)) return;
    const nextCount = getGenerationCount() + 1;
    window.localStorage.setItem("mimly_generation_count", String(nextCount));
    const nextIds = [...countedIds, latestJob.id].slice(-50);
    window.localStorage.setItem(
      "mimly_counted_generation_job_ids",
      JSON.stringify(nextIds)
    );
  }, [latestJob?.id, latestJob?.status]);

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

  const handleNewIdeaSubmit = async () => {
    if (newIdeaMode === "prompt" && !newIdeaPrompt.trim()) return;
    if (newIdeaMode === "url" && !newIdeaUrl.trim()) return;
    if (isJobActive) return;

    await runWithFeedbackGate(async () => {
      setNewIdeaError(null);
      setNewIdeaSubmitting(true);
      try {
        const res = await fetch("/api/workspace/new-idea", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            workspaceId,
            inputType: newIdeaMode,
            prompt: newIdeaMode === "prompt" ? newIdeaPrompt : undefined,
            url: newIdeaMode === "url" ? newIdeaUrl : undefined,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setNewIdeaError(data.error ?? "Could not start a new idea.");
          return;
        }
        setChatInputMode("thread");
        setNewIdeaPrompt("");
        setNewIdeaUrl("");
        const next = await getWorkspaceState(workspaceId);
        if (!next.error && next.state) setState(next.state);
      } catch {
        setNewIdeaError("Something went wrong. Try again.");
      } finally {
        setNewIdeaSubmitting(false);
      }
    });
  };

  const submitMessage = async (prompt: string) => {
    await runWithFeedbackGate(async () => {
      setError(null);
      const result = await sendWorkspaceMessage(workspaceId, prompt, {});
      if (result.error || !result.state) {
        setError(result.error ?? "Failed to send message.");
        return;
      }
      setState(result.state);
    });
  };

  const submitFeedback = async () => {
    if (
      feedbackAnswers.firstMemeThought === null ||
      feedbackAnswers.wouldUseAgain === null ||
      feedbackAnswers.looksLikeAiSlop === null
    ) {
      return;
    }
    setFeedbackSubmitting(true);
    try {
      const sessionId = ensureSessionId();
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          workspaceId,
          sessionId,
          wasContentGood: feedbackAnswers.firstMemeThought === "good",
          wouldUseAgain: feedbackAnswers.wouldUseAgain === "yes",
          looksLikeAiSlop:
            feedbackAnswers.looksLikeAiSlop === "no" ? "not_really" : "a_bit",
        }),
      });
    } catch {
      // Fail-safe: never block progression if feedback API fails.
    } finally {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("mimly_feedback_completed", "true");
      }
      setShowFeedbackModal(false);
      setFeedbackSubmitting(false);
      const pending = pendingGenerationActionRef.current;
      pendingGenerationActionRef.current = null;
      if (pending) {
        await pending();
      }
    }
  };

  return (
    <div className="space-y-4">
      <FeedbackModal
        open={showFeedbackModal}
        submitting={feedbackSubmitting}
        answers={feedbackAnswers}
        onSelectFirstMemeThought={(value) =>
          setFeedbackAnswers((prev) => ({ ...prev, firstMemeThought: value }))
        }
        onSelectWouldUseAgain={(value) =>
          setFeedbackAnswers((prev) => ({ ...prev, wouldUseAgain: value }))
        }
        onSelectLooksLikeAiSlop={(value) =>
          setFeedbackAnswers((prev) => ({ ...prev, looksLikeAiSlop: value }))
        }
        onSubmit={() => void submitFeedback()}
      />
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

      <div className="grid min-h-[calc(100vh-9.5rem)] gap-4 lg:grid-cols-[340px_1fr] lg:gap-5">
      <aside className="order-1 flex h-[64vh] min-h-[440px] flex-col max-lg:overflow-hidden rounded-3xl border border-stone-200/80 bg-stone-50/80 p-3.5 shadow-[0_8px_28px_rgba(10,10,10,0.05)] sm:h-[68vh] sm:p-4 lg:sticky lg:top-[5.5rem] lg:max-h-[min(1000px,calc(100dvh-5.75rem))] lg:min-h-0 lg:h-[min(90vh,calc(100dvh-5.75rem))] lg:overflow-x-hidden lg:overflow-y-auto lg:self-start">
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
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wide ${statusClass}`}
            >
              {displayStatusLabel.replace("_", " ")}
            </span>
          </div>
        </div>
        <div
          className={`mt-3 grid min-h-0 flex-1 grid-rows-1 gap-3 overflow-hidden ${
            chatInputMode === "new_idea"
              ? "lg:grid-rows-[minmax(0,2fr)_minmax(0,1fr)]"
              : "lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]"
          }`}
        >
          {/* Chat zone: ~50% of sidebar on lg; full height when help is hidden */}
          <div className="flex min-h-0 flex-col gap-2 overflow-hidden rounded-2xl border border-stone-200/90 bg-white/85 p-3 shadow-[0_2px_12px_rgba(15,23,42,0.04)] ring-1 ring-stone-200/40 sm:p-3.5">
            <div className="flex shrink-0 items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                Chat
              </p>
            </div>
            <div
              className={`min-h-0 flex-1 overflow-y-auto pr-1 ${
                chatInputMode === "new_idea"
                  ? "max-h-[min(38vh,15rem)] lg:max-h-[min(42vh,18rem)]"
                  : ""
              }`}
            >
              <MessageList
                messages={sidebarMessages}
                onPillClick={submitMessage}
              />
            </div>

            {isJobActive ? (
              <div className="shrink-0 rounded-xl border border-sky-100/90 bg-sky-50/60 px-2.5 py-1.5">
                <div className="flex items-center gap-2 text-[11px] leading-tight text-sky-700">
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

            <div className="shrink-0 border-t border-stone-200/80 pt-2.5">
              <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-stone-500">
                {chatInputMode === "new_idea" ? "Replace context" : "Message"}
              </p>
              <div className="mb-2 flex gap-1 rounded-full border border-stone-200/80 bg-stone-100/90 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setChatInputMode("thread");
                    setNewIdeaError(null);
                  }}
                  className={
                    chatInputMode === "thread"
                      ? "flex-1 rounded-full bg-white px-2 py-1.5 text-center text-[11px] font-semibold text-stone-900 shadow-sm ring-1 ring-stone-200/60"
                      : "flex-1 rounded-full px-2 py-1.5 text-center text-[11px] font-medium text-stone-500 transition hover:text-stone-800"
                  }
                >
                  Chat
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (isAuthLocked || isPlanLocked || isJobActive) return;
                    setChatInputMode("new_idea");
                    setNewIdeaError(null);
                  }}
                  disabled={isAuthLocked || isPlanLocked || isJobActive}
                  title={
                    isJobActive
                      ? "Wait for the current generation to finish"
                      : "Replace business context with a new prompt or URL"
                  }
                  className={
                    chatInputMode === "new_idea"
                      ? "flex-1 rounded-full bg-white px-2 py-1.5 text-center text-[11px] font-semibold text-stone-900 shadow-sm ring-1 ring-stone-200/60"
                      : "flex-1 rounded-full px-2 py-1.5 text-center text-[11px] font-medium text-stone-500 transition hover:text-stone-800 disabled:cursor-not-allowed disabled:text-stone-400"
                  }
                >
                  New idea
                </button>
              </div>

              <div
                className={`rounded-[24px] border px-3 py-2 shadow-[0_8px_24px_rgba(20,20,20,0.08)] transition focus-within:border-sky-300 focus-within:ring-2 focus-within:ring-inset focus-within:ring-sky-200/70 ${
                  isAuthLocked || isPlanLocked
                    ? "border-stone-200 bg-stone-100/85"
                    : "border-stone-200 bg-white"
                }`}
              >
                {chatInputMode === "thread" ? (
                  <PromptComposer
                    embedded
                    disabled={isAuthLocked || isPlanLocked}
                    disabledPlaceholder={
                      isAuthLocked
                        ? "Sign in to continue this thread"
                        : isPlanLocked
                          ? "Choose a plan to continue this thread"
                          : "What should we create next?"
                    }
                    onSubmit={(prompt) => submitMessage(prompt)}
                  />
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] leading-snug text-stone-500">
                      Start fresh with a new prompt or website. This updates your
                      workspace context; your pinned results stay put.
                    </p>
                    <div className="flex gap-3 border-b border-stone-100 pb-2 text-[11px] font-medium">
                      <button
                        type="button"
                        onClick={() => setNewIdeaMode("prompt")}
                        className={
                          newIdeaMode === "prompt"
                            ? "text-stone-900 underline decoration-stone-400 decoration-2 underline-offset-4"
                            : "text-stone-500 hover:text-stone-800"
                        }
                      >
                        Prompt
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewIdeaMode("url")}
                        className={
                          newIdeaMode === "url"
                            ? "text-stone-900 underline decoration-stone-400 decoration-2 underline-offset-4"
                            : "text-stone-500 hover:text-stone-800"
                        }
                      >
                        Website
                      </button>
                    </div>
                    {newIdeaMode === "prompt" ? (
                      <textarea
                        value={newIdeaPrompt}
                        onChange={(e) => setNewIdeaPrompt(e.target.value)}
                        placeholder="Describe your business or idea…"
                        rows={2}
                        className="max-h-32 min-h-[2.75rem] w-full resize-y rounded-xl border border-stone-200/90 bg-stone-50/50 px-2.5 py-2 text-[13px] leading-snug text-stone-800 placeholder:text-stone-400 focus:border-sky-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-200/60 lg:max-h-40"
                      />
                    ) : (
                      <input
                        type="url"
                        value={newIdeaUrl}
                        onChange={(e) => setNewIdeaUrl(e.target.value)}
                        placeholder="https://your-site.com"
                        className="w-full rounded-xl border border-stone-200/90 bg-stone-50/50 px-2.5 py-2 text-[13px] text-stone-800 placeholder:text-stone-400 focus:border-sky-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-200/60"
                      />
                    )}
                    {newIdeaError ? (
                      <p className="text-[11px] text-rose-600">{newIdeaError}</p>
                    ) : null}
                    <div className="flex flex-col gap-2 pt-0.5 sm:flex-row sm:items-center sm:justify-end">
                      <button
                        type="button"
                        disabled={
                          newIdeaSubmitting ||
                          isJobActive ||
                          isAuthLocked ||
                          isPlanLocked ||
                          (newIdeaMode === "prompt" && !newIdeaPrompt.trim()) ||
                          (newIdeaMode === "url" && !newIdeaUrl.trim())
                        }
                        onClick={() => void handleNewIdeaSubmit()}
                        className="inline-flex h-10 w-full shrink-0 items-center justify-center rounded-full bg-sky-600 px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-auto"
                      >
                        {newIdeaSubmitting ? "Starting…" : "Update context"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setChatInputMode("thread");
                          setNewIdeaError(null);
                        }}
                        className="rounded-full px-2.5 py-2 text-[11px] font-medium text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 sm:py-1.5"
                      >
                        Back to chat
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {error && chatInputMode === "thread" ? (
                <p className="mt-2 text-xs text-rose-600">{error}</p>
              ) : null}
            </div>
          </div>

          {/* Help: ~50% on lg, scrollable; hidden on smaller breakpoints */}
          <div className="hidden min-h-0 flex-col overflow-hidden lg:flex">
            <p className="mb-1.5 shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
              How it works
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl border border-stone-200/90 bg-white/70 px-3 py-3 pr-2 text-[11px] leading-relaxed text-stone-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
              <p className="mb-2 text-xs font-semibold text-stone-700">How Mimly works</p>
              <p>Each message generates one piece of content.</p>
              <p>Ask for “more ideas” to get another variation in the same format.</p>
              <p className="mt-2">
                To replace the business context or switch website, use{" "}
                <strong className="font-semibold text-stone-700">New idea</strong> in the
                input area below the thread (same box as where you send chat messages).
              </p>
              <p className="mt-2">Pin results you like to keep them at the top of your workspace.</p>
              <p className="mt-2">
                Mimly is a guided creative tool, not a fully open-ended AI — clearer prompts lead to better results.
              </p>
              <p className="mt-2 text-xs font-semibold text-stone-700">Available formats</p>
              <p>Image memes (1080x1080)</p>
              <p>Video memes (1080x1080)</p>
              <p>Text memes (1080x1080)</p>
              <p>Engagement posts (1080x1080)</p>
              <p className="mt-2 text-xs font-semibold text-stone-700">Tips for best results</p>
              <p>Be specific if you want high-quality, targeted content.</p>
              <p>Keep it broad if you&apos;re exploring ideas.</p>
              <p className="mt-2">All content is generated using Mimly’s AI context engine, designed to turn prompts into viral-ready formats.</p>
            </div>
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
          onEngagementOutputUpdated={(outputId, patch) => {
            setState((prev) => ({
              ...prev,
              outputs: prev.outputs.map((o) =>
                o.id === outputId ? { ...o, ...patch } : o
              ),
            }));
          }}
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
          onDeleteOutput={async (outputId) => {
            const result = await deleteWorkspaceOutput(workspaceId, outputId);
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
