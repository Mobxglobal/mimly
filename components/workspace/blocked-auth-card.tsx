"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function BlockedAuthCard() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState("");

  async function sendMagicLink() {
    const trimmed = email.trim();
    if (!trimmed || status === "loading") return;

    setErrorMessage("");
    setStatus("loading");
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      window.location.pathname
    )}`;

    const { error } = await createClient().auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: redirectTo },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }

    setStatus("success");
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-800">You&apos;ve used your free preview</p>
      <p className="mt-1 text-xs leading-relaxed text-amber-700">
        Sign in and I&apos;ll keep this thread going from exactly where you left it.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="min-w-0 flex-1 rounded-xl border border-amber-300/70 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-amber-400 focus:outline-none"
          disabled={status === "loading" || status === "success"}
        />
        <button
          type="button"
          onClick={sendMagicLink}
          disabled={status === "loading" || status === "success"}
          className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {status === "loading"
            ? "Sending..."
            : status === "success"
              ? "Sent"
              : "Send magic link"}
        </button>
      </div>
      {status === "success" ? (
        <p className="mt-2 text-xs text-emerald-700">
          Check your email to continue and unlock your plan.
        </p>
      ) : null}
      {status === "error" ? <p className="mt-2 text-xs text-rose-600">{errorMessage}</p> : null}
    </div>
  );
}
