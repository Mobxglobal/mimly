"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { HERO_BACKGROUND_IMAGE_SRC } from "@/lib/marketing/hero-background";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage("");
    setStatus("loading");

    const next = searchParams.get("next") || "/workspace";
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }
    setStatus("success");
  }

  const inputClass =
    "mt-0.5 w-full rounded-lg border border-stone-200 bg-white/90 px-2.5 py-1.5 text-xs text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400 sm:px-3 sm:py-2 sm:text-[13px]";
  const labelClass = "block text-[11px] font-medium text-stone-600 sm:text-xs";

  return (
    <OnboardingShell heroBackgroundSrc={HERO_BACKGROUND_IMAGE_SRC} compactCard>
      <h1 className="text-pretty text-lg font-bold leading-tight tracking-tight text-stone-900 sm:text-xl md:text-2xl">
        Log in
      </h1>
      <p className="mt-1.5 max-w-[15rem] text-pretty text-[9px] leading-snug text-stone-500 sm:max-w-none sm:mt-2 sm:text-[10px]">
        Enter your email and we&apos;ll send you a magic link to sign in.
      </p>

      {status === "success" && (
        <div className="mt-3 rounded-lg border border-stone-200/90 bg-stone-100/90 px-2.5 py-2 text-[10px] leading-relaxed text-stone-700 sm:px-3 sm:py-2.5 sm:text-[11px]">
          Check your email for the magic link. Click it to sign in.
        </div>
      )}

      {status === "error" && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[10px] leading-relaxed text-rose-800 sm:px-3 sm:py-2.5 sm:text-[11px]">
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
        <div>
          <label htmlFor="login-email" className={labelClass}>
            Email
          </label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="you@company.com"
            required
            disabled={status === "loading"}
          />
        </div>
        <button
          type="submit"
          disabled={status === "loading"}
          className="cta-funky mt-1 w-full rounded-full bg-stone-900 px-3 py-1.5 text-xs font-medium !text-white shadow-sm hover:bg-stone-800 transition-colors font-display disabled:opacity-60 sm:px-4 sm:py-2 sm:text-[13px]"
        >
          {status === "loading" ? "Sending…" : "Send magic link"}
        </button>
      </form>
    </OnboardingShell>
  );
}
