"use client";

import { useState, useTransition } from "react";

export function PromptComposer({
  onSubmit,
  disabled,
  disabledPlaceholder,
}: {
  onSubmit: (prompt: string) => Promise<void>;
  disabled?: boolean;
  disabledPlaceholder?: string;
}) {
  const [value, setValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const isDisabled = Boolean(disabled) || isPending;

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
      className="mt-1"
    >
      <div
        className={`rounded-[28px] border px-3 py-3 shadow-[0_8px_24px_rgba(20,20,20,0.08)] transition focus-within:shadow-[0_0_0_4px_rgba(14,165,233,0.12)] ${
          isDisabled ? "border-stone-200 bg-stone-100/85" : "border-stone-200 bg-white"
        }`}
      >
        <div className="flex items-center gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={
              isDisabled
                ? disabledPlaceholder ?? "Sign in to continue this thread"
                : "What should we create next?"
            }
            className="min-w-0 flex-1 border-none bg-transparent px-3 py-3.5 text-[15px] text-stone-800 placeholder:text-stone-400 focus:outline-none disabled:cursor-not-allowed disabled:text-stone-500"
            disabled={isDisabled}
          />
          <button
            type="submit"
            disabled={isDisabled}
            className="inline-flex h-11 items-center justify-center rounded-full bg-stone-900 px-4.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500"
          >
            {isPending ? "..." : "Send"}
          </button>
        </div>
      </div>
    </form>
  );
}
