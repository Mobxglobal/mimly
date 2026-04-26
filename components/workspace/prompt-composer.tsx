"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";

export function PromptComposer({
  onSubmit,
  disabled,
  disabledPlaceholder,
  embedded,
}: {
  onSubmit: (prompt: string) => Promise<void>;
  disabled?: boolean;
  disabledPlaceholder?: string;
  /** When true, omit outer chrome so a parent can wrap chat + new-idea in one card. */
  embedded?: boolean;
}) {
  const [value, setValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const isDisabled = Boolean(disabled) || isPending;

  const inner = (
    <div className="flex items-center gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={
          isDisabled
            ? disabledPlaceholder ?? "Sign in to continue this thread"
            : "What should we create next?"
        }
        className="min-w-0 flex-1 border-none bg-transparent px-2.5 py-1.5 text-[14px] text-stone-800 placeholder:text-stone-400 focus:outline-none disabled:cursor-not-allowed disabled:text-stone-500"
        disabled={isDisabled}
      />
      <button
        type="submit"
        disabled={isDisabled}
        className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-stone-900 px-3 text-xs font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500"
      >
        {isPending ? "..." : "Send"}
      </button>
    </div>
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const prompt = value.trim();
        if (!prompt || isDisabled) return;
        startTransition(async () => {
          await onSubmit(prompt);
          setValue("");
        });
      }}
      className="mt-0"
    >
      {embedded ? (
        inner
      ) : (
        <div
          className={cn(
            "rounded-[24px] border px-3 py-2 shadow-[0_8px_24px_rgba(20,20,20,0.08)] transition focus-within:border-sky-300 focus-within:ring-2 focus-within:ring-inset focus-within:ring-sky-200/70",
            isDisabled ? "border-stone-200 bg-stone-100/85" : "border-stone-200 bg-white"
          )}
        >
          {inner}
        </div>
      )}
    </form>
  );
}
