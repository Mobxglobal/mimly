"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import {
  ONBOARDING_SESSION_DRAFT_KEY,
  type GenerationMode,
} from "@/lib/onboarding/generation-mode";
import { createClient } from "@/lib/supabase/client";

export default function OnboardingManualPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [email, setEmail] = useState("");
  const [brandName, setBrandName] = useState("");
  const [whatYouDo, setWhatYouDo] = useState("");
  const [audience, setAudience] = useState("");
  const [country, setCountry] = useState("");
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [reviewGenerationMode, setReviewGenerationMode] =
    useState<GenerationMode | null>(null);

  const isReview = searchParams.get("review") === "1";

  useEffect(() => {
    if (searchParams.get("review") !== "1") return;

    setReviewMessage(searchParams.get("issues") || "Please clarify a couple details.");
    setEmail(searchParams.get("email") ?? "");
    setBrandName(searchParams.get("brand_name") ?? "");
    setWhatYouDo(searchParams.get("what_you_do") ?? "");
    setAudience(searchParams.get("audience") ?? "");
    setCountry(searchParams.get("country") ?? "");
    const gm = searchParams.get("generation_mode");
    if (gm === "content_pack" || gm === "on_demand") {
      setReviewGenerationMode(gm);
    } else {
      setReviewGenerationMode(null);
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage("");
    setStatus("idle");

    const draft = {
      email: email.trim(),
      brand_name: brandName.trim(),
      what_you_do: whatYouDo.trim(),
      audience: audience.trim(),
      country: country.trim(),
      ...(isReview
        ? { generation_mode: reviewGenerationMode ?? ("on_demand" as const) }
        : {}),
    };

    if (!draft.email || !draft.what_you_do || !draft.audience || !draft.country) {
      setStatus("error");
      setErrorMessage("Please fill in all required fields.");
      return;
    }

    if (!isReview) {
      try {
        sessionStorage.setItem(
          ONBOARDING_SESSION_DRAFT_KEY,
          JSON.stringify({
            email: draft.email,
            brand_name: draft.brand_name,
            what_you_do: draft.what_you_do,
            audience: draft.audience,
            country: draft.country,
          })
        );
      } catch {
        setStatus("error");
        setErrorMessage("Could not continue. Check that cookies/storage are enabled.");
        return;
      }
      router.push("/onboarding/goal");
      return;
    }

    setSending(true);

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
        Set up your meme engine
      </h1>
      <p className="marketing-copy mt-2">
        Tell us about your brand so we can tailor your memes.
      </p>
      {reviewMessage && (
        <div className="mt-6 rounded-2xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Quick clarification</p>
          <p className="mt-1 text-amber-800/90">{reviewMessage}</p>
        </div>
      )}
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
      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 mt-4">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-900">
            Important
          </span>
          <p className="text-xs font-medium text-stone-800 sm:text-[13px]">
            These answers shape your content.
          </p>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">
          The more specific you are here, the better Mimly can tailor content
          ideas, tone, and captions to your business.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <div>
          <label htmlFor="manual-email" className={labelClass}>
            Email address <span className="text-amber-700">*</span>
          </label>
          <input
            id="manual-email"
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
          <label htmlFor="manual-brand" className={labelClass}>
            Brand name <span className="text-stone-400">(optional)</span>
          </label>
          <input
            id="manual-brand"
            type="text"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            className={inputClass}
            disabled={sending}
          />
        </div>
        <div>
          <label htmlFor="manual-what-you-do" className={labelClass}>
            What do you sell? <span className="text-amber-700">*</span>
          </label>
          <input
            id="manual-what-you-do"
            type="text"
            value={whatYouDo}
            onChange={(e) => setWhatYouDo(e.target.value)}
            className={inputClass + " border-amber-200/80 focus:border-amber-400 focus:ring-amber-300"}
            placeholder="e.g. 1:1 online fitness coaching for busy professionals"
            required
            disabled={sending}
          />
          <p className="mt-2 text-xs leading-relaxed text-stone-500">
            Be specific about your product or service, not just the industry.
          </p>
        </div>
        <div>
          <label htmlFor="manual-audience" className={labelClass}>
            Who is your audience? <span className="text-amber-700">*</span>
          </label>
          <input
            id="manual-audience"
            type="text"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            className={inputClass + " border-amber-200/80 focus:border-amber-400 focus:ring-amber-300"}
            placeholder="e.g. Working parents trying to get fit with limited time"
            required
            disabled={sending}
          />
          <p className="mt-2 text-xs leading-relaxed text-stone-500">
            Describe the exact people you want to reach rather than saying
            &quot;everyone&quot;.
          </p>
        </div>
        <div>
          <label htmlFor="manual-country" className={labelClass}>
            Country / region <span className="text-amber-700">*</span>
          </label>
          <select
            id="manual-country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className={inputClass + " cursor-pointer pr-8"}
            required
            disabled={sending}
          >
            <option value="">Select country</option>
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
          {sending ? "Sending…" : isReview ? "Save & continue" : "Continue"}
        </button>
      </form>
    </OnboardingShell>
  );
}
