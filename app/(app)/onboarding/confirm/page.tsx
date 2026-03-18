"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import { createClient } from "@/lib/supabase/client";

export default function OnboardingConfirmPage() {
  const searchParams = useSearchParams();
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [email, setEmail] = useState("");
  const [brandName, setBrandName] = useState("");
  const [whatYouDo, setWhatYouDo] = useState("");
  const [audience, setAudience] = useState("");
  const [country, setCountry] = useState("");

  useEffect(() => {
    setBrandName(searchParams.get("brand_name") ?? "");
    setWhatYouDo(searchParams.get("what_you_do") ?? "");
    setAudience(searchParams.get("audience") ?? "");
    setCountry(searchParams.get("country") ?? "United States");
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage("");
    setStatus("idle");
    setSending(true);

    const draft = {
      email: email.trim(),
      brand_name: brandName.trim(),
      what_you_do: whatYouDo.trim(),
      audience: audience.trim(),
      country: country.trim(),
    };

    const draftRes = await fetch("/api/onboarding/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: draft.email, draft }),
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
    setStatus("success");
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-stone-200 bg-white/90 px-4 py-2.5 text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400";
  const labelClass = "block text-sm font-medium text-stone-700";

  return (
    <OnboardingShell>
      <h1 className="text-2xl font-bold tracking-tight text-stone-900 md:text-3xl">
        Confirm your brand
      </h1>
      <p className="marketing-copy mt-2">
        We extracted this from your website. Edit if needed, then continue.
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
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <div>
          <label htmlFor="confirm-email" className={labelClass}>
            Email address
          </label>
          <input
            id="confirm-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="you@company.com"
            required
            disabled={sending}
          />
        </div>
        <div>
          <label htmlFor="confirm-brand" className={labelClass}>
            Brand name
          </label>
          <input
            id="confirm-brand"
            type="text"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            className={inputClass}
            disabled={sending}
          />
        </div>
        <div>
          <label htmlFor="confirm-what-you-do" className={labelClass}>
            What you do
          </label>
          <input
            id="confirm-what-you-do"
            type="text"
            value={whatYouDo}
            onChange={(e) => setWhatYouDo(e.target.value)}
            className={inputClass}
            placeholder="e.g. Online fitness coaching"
            required
            disabled={sending}
          />
        </div>
        <div>
          <label htmlFor="confirm-audience" className={labelClass}>
            Target audience
          </label>
          <input
            id="confirm-audience"
            type="text"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            className={inputClass}
            required
            disabled={sending}
          />
        </div>
        <div>
          <label htmlFor="confirm-country" className={labelClass}>
            Country / region
          </label>
          <select
            id="confirm-country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className={inputClass + " cursor-pointer pr-8"}
            required
            disabled={sending}
          >
            <optgroup label="United Kingdom & United States">
              <option value="United Kingdom">United Kingdom</option>
              <option value="United States">United States</option>
            </optgroup>
            <optgroup label="All countries">
              {COUNTRY_OPTIONS.filter(
                (c) => c !== "United Kingdom" && c !== "United States"
              ).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <button
          type="submit"
          disabled={sending}
          className="cta-funky mt-2 w-full rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium !text-white shadow-sm hover:bg-stone-800 transition-colors font-display disabled:opacity-60"
        >
          {sending ? "Sending…" : "Save & continue"}
        </button>
      </form>
    </OnboardingShell>
  );
}
