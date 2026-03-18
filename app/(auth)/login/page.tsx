"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage("");
    setStatus("loading");

    const next = searchParams.get("next") || "/dashboard";
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
    "mt-1 w-full rounded-xl border border-stone-200 bg-white/90 px-4 py-2.5 text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400";
  const labelClass = "block text-sm font-medium text-stone-700";

  return (
    <OnboardingShell>
      <h1 className="text-2xl font-bold tracking-tight text-stone-900 md:text-3xl">
        Log in
      </h1>
      <p className="marketing-copy mt-2">
        Enter your email and we&apos;ll send you a magic link to sign in.
      </p>

      {status === "success" && (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Check your email for the magic link. Click it to sign in.
        </div>
      )}

      {status === "error" && (
        <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
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
          className="cta-funky mt-2 w-full rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium !text-white shadow-sm hover:bg-stone-800 transition-colors font-display disabled:opacity-60"
        >
          {status === "loading" ? "Sending…" : "Send magic link"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-stone-500">
        Don&apos;t have an account?{" "}
        <Link href="/onboarding/manual" className="font-medium text-stone-700 underline underline-offset-2 hover:text-stone-900">
          Get started
        </Link>
      </p>
    </OnboardingShell>
  );
}
