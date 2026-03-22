"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import {
  ONBOARDING_SESSION_DRAFT_KEY,
  type GenerationMode,
  type OnboardingSessionDraft,
} from "@/lib/onboarding/generation-mode";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export default function OnboardingGoalPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<OnboardingSessionDraft | null>(null);
  const [mode, setMode] = useState<GenerationMode | null>(null);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem(ONBOARDING_SESSION_DRAFT_KEY);
    if (!raw) {
      router.replace("/onboarding/manual");
      return;
    }
    try {
      const d = JSON.parse(raw) as Partial<OnboardingSessionDraft>;
      const email = String(d.email ?? "").trim();
      const what = String(d.what_you_do ?? "").trim();
      const aud = String(d.audience ?? "").trim();
      const country = String(d.country ?? "").trim();
      if (!email || !what || !aud || !country) {
        router.replace("/onboarding/manual");
        return;
      }
      setDraft({
        email,
        brand_name: String(d.brand_name ?? "").trim(),
        what_you_do: what,
        audience: aud,
        country,
      });
    } catch {
      router.replace("/onboarding/manual");
    }
  }, [router]);

  async function handleContinue(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || !mode) return;
    setErrorMessage("");
    setStatus("idle");
    setSending(true);

    const bodyDraft = { ...draft, generation_mode: mode };

    const draftRes = await fetch("/api/onboarding/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: draft.email, draft: bodyDraft }),
    });
    if (!draftRes.ok) {
      setSending(false);
      setStatus("error");
      setErrorMessage("Could not save your details. Please try again.");
      return;
    }

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      "/onboarding/complete"
    )}`;

    const { error } = await createClient().auth.signInWithOtp({
      email: draft.email,
      options: { emailRedirectTo: redirectTo },
    });

    setSending(false);
    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }
    sessionStorage.removeItem(ONBOARDING_SESSION_DRAFT_KEY);
    setStatus("success");
  }

  const cardClass =
    "rounded-2xl border px-4 py-4 text-left transition-colors cursor-pointer sm:px-5 sm:py-5";

  if (!draft) {
    return (
      <OnboardingShell>
        <p className="text-sm text-stone-600">Loading…</p>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell>
      <h1 className="text-2xl font-bold tracking-tight text-stone-900 md:text-3xl">
        What do you want to create with Mimly?
      </h1>
      <p className="marketing-copy mt-2">
        Choose one option to continue.
      </p>

      {status === "success" && (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Check your email for the magic link. Click it to save and continue.
        </div>
      )}
      {status === "error" && (
        <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleContinue} className="mt-6 flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setMode("content_pack")}
            className={cn(
              cardClass,
              mode === "content_pack"
                ? "border-stone-900 bg-stone-50 ring-2 ring-stone-900/15"
                : "border-stone-200 bg-white/90 hover:border-stone-300"
            )}
          >
            <p className="text-sm font-semibold text-stone-900">
              Test a content pack
            </p>
            <p className="mt-1 text-sm text-stone-600">
              Get a mix of memes and slideshows ready to post on Instagram, TikTok, Facebook, or LinkedIn
            </p>
          </button>
          <button
            type="button"
            onClick={() => setMode("on_demand")}
            className={cn(
              cardClass,
              mode === "on_demand"
                ? "border-stone-900 bg-stone-50 ring-2 ring-stone-900/15"
                : "border-stone-200 bg-white/90 hover:border-stone-300"
            )}
          >
            <p className="text-sm font-semibold text-stone-900">
              Create content on demand
            </p>
            <p className="mt-1 text-sm text-stone-600">
              Generate memes, videos, and slideshows whenever you need
            </p>
          </button>
        </div>

        <button
          type="submit"
          disabled={sending || !mode}
          className="cta-funky mt-2 w-full rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium !text-white shadow-sm hover:bg-stone-800 transition-colors font-display disabled:opacity-60"
        >
          {sending ? "Sending…" : "Continue"}
        </button>
      </form>
    </OnboardingShell>
  );
}
