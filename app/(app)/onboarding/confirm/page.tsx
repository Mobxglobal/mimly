"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import { ONBOARDING_SESSION_DRAFT_KEY } from "@/lib/onboarding/generation-mode";

const scanReviewPillClass =
  "inline-flex shrink-0 items-center rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600";

export default function OnboardingConfirmPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailInputRef = useRef<HTMLInputElement>(null);
  const websiteParam = searchParams.get("website");
  const fromWebsiteScan = Boolean(websiteParam?.trim());

  const [status, setStatus] = useState<"idle" | "error">("idle");
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

  useEffect(() => {
    if (!fromWebsiteScan) return;
    const id = window.requestAnimationFrame(() => {
      emailInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [fromWebsiteScan]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage("");
    setStatus("idle");

    const draft = {
      email: email.trim(),
      brand_name: brandName.trim(),
      what_you_do: whatYouDo.trim(),
      audience: audience.trim(),
      country: country.trim(),
    };

    if (!draft.email || !draft.what_you_do || !draft.audience || !draft.country) {
      setStatus("error");
      setErrorMessage("Please fill in all required fields.");
      return;
    }

    try {
      sessionStorage.setItem(ONBOARDING_SESSION_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      setStatus("error");
      setErrorMessage("Could not continue. Check that cookies/storage are enabled.");
      return;
    }

    router.push("/onboarding/goal");
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-stone-200 bg-white/90 px-4 py-2.5 text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400";
  const labelClass = "block text-sm font-medium text-stone-700";
  const labelInlineClass = "text-sm font-medium text-stone-700";

  return (
    <OnboardingShell>
      <h1 className="text-2xl font-bold tracking-tight text-stone-900 md:text-3xl">
        Confirm your brand
      </h1>
      <p className="marketing-copy mt-2">
        We extracted this from your website. Edit if needed, then continue.
      </p>
      {status === "error" && (
        <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {errorMessage}
        </div>
      )}
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <div>
          <label htmlFor="confirm-email" className={labelClass}>
            {fromWebsiteScan ? "Enter your email" : "Email address"}
          </label>
          <input
            ref={emailInputRef}
            id="confirm-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="you@company.com"
            required
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
          />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <label htmlFor="confirm-what-you-do" className={labelInlineClass}>
              What you do
            </label>
            {fromWebsiteScan && (
              <span className={scanReviewPillClass}>Check this</span>
            )}
          </div>
          <input
            id="confirm-what-you-do"
            type="text"
            value={whatYouDo}
            onChange={(e) => setWhatYouDo(e.target.value)}
            className={inputClass}
            placeholder="e.g. Online fitness coaching"
            required
          />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <label htmlFor="confirm-audience" className={labelInlineClass}>
              Target audience
            </label>
            {fromWebsiteScan && (
              <span className={scanReviewPillClass}>Check this</span>
            )}
          </div>
          <input
            id="confirm-audience"
            type="text"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            className={inputClass}
            required
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
          className="cta-funky mt-2 w-full rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium !text-white shadow-sm hover:bg-stone-800 transition-colors font-display disabled:opacity-60"
        >
          Continue
        </button>
      </form>
    </OnboardingShell>
  );
}
