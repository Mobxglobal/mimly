"use client";

import { useRouter } from "next/navigation";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";

export default function OnboardingCompletePage() {
  const router = useRouter();

  return (
    <OnboardingShell>
      <h1 className="text-2xl font-bold tracking-tight text-stone-900 md:text-3xl">
        Your meme engine is ready
      </h1>
      <p className="marketing-copy mt-3">
        Your memes will automatically adapt to trends, global events, and your brand context.
      </p>
      <button
        type="button"
        onClick={() => router.push("/workspace")}
        className="cta-funky mt-6 w-full rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium !text-white shadow-sm hover:bg-stone-800 transition-colors font-display"
      >
        Go to Home
      </button>
    </OnboardingShell>
  );
}
