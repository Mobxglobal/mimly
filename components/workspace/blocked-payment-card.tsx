"use client";

import { useState, useTransition } from "react";
import { unlockWorkspacePlan } from "@/lib/actions/workspace";

type PlanCode = "starter_pack" | "unlimited";

export function BlockedPaymentCard({
  workspaceId,
  onUnlocked,
}: {
  workspaceId: string;
  onUnlocked?: () => void | Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<PlanCode | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleUnlock = (planCode: PlanCode) => {
    if (isPending) return;
    setError(null);
    setActivePlan(planCode);
    startTransition(async () => {
      const result = await unlockWorkspacePlan(workspaceId, planCode);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (onUnlocked) {
        await onUnlocked();
      }
    });
  };

  return (
    <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 p-4">
      <p className="text-sm font-semibold text-fuchsia-800">Unlock a plan to continue this thread</p>
      <p className="mt-1 text-xs leading-relaxed text-fuchsia-700">
        As soon as you unlock, I&apos;ll continue this generation instantly.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => handleUnlock("starter_pack")}
          disabled={isPending}
          className="rounded-xl border border-fuchsia-200 bg-white px-3 py-2 text-left text-sm text-stone-800 transition hover:bg-fuchsia-100/40 disabled:opacity-70"
        >
          <p className="font-medium">Starter Pack</p>
          <p className="mt-0.5 text-xs text-fuchsia-700/80">7 days access</p>
          {isPending && activePlan === "starter_pack" ? (
            <p className="mt-1 text-[11px] text-fuchsia-700">Unlocking...</p>
          ) : null}
        </button>

        <button
          type="button"
          onClick={() => handleUnlock("unlimited")}
          disabled={isPending}
          className="rounded-xl border border-fuchsia-200 bg-white px-3 py-2 text-left text-sm text-stone-800 transition hover:bg-fuchsia-100/40 disabled:opacity-70"
        >
          <p className="font-medium">Unlimited</p>
          <p className="mt-0.5 text-xs text-fuchsia-700/80">No expiry</p>
          {isPending && activePlan === "unlimited" ? (
            <p className="mt-1 text-[11px] text-fuchsia-700">Unlocking...</p>
          ) : null}
        </button>
      </div>

      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
