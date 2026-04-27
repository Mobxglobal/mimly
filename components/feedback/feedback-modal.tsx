"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

type FeedbackAnswers = {
  firstMemeThought: "good" | "average" | "awful" | null;
  wouldUseAgain: "yes" | "no" | "maybe" | null;
  looksLikeAiSlop: "yes" | "no" | "a_bit" | null;
};

type FeedbackModalProps = {
  open: boolean;
  submitting: boolean;
  answers: FeedbackAnswers;
  onSelectFirstMemeThought: (value: "good" | "average" | "awful") => void;
  onSelectWouldUseAgain: (value: "yes" | "no" | "maybe") => void;
  onSelectLooksLikeAiSlop: (value: "yes" | "no" | "a_bit") => void;
  onSubmit: () => void;
};

function ChoiceButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
        active
          ? "border-stone-900 bg-stone-900 text-white"
          : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
      )}
    >
      {label}
    </button>
  );
}

export function FeedbackModal({
  open,
  submitting,
  answers,
  onSelectFirstMemeThought,
  onSelectWouldUseAgain,
  onSelectLooksLikeAiSlop,
  onSubmit,
}: FeedbackModalProps) {
  if (!open) return null;

  const canSubmit =
    answers.firstMemeThought !== null &&
    answers.wouldUseAgain !== null &&
    answers.looksLikeAiSlop !== null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-stone-900/35 px-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-5 shadow-2xl">
        <p className="mb-4 text-sm font-semibold text-stone-900">
          Quick feedback before you continue
        </p>
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold text-stone-700">
              Thoughts on the first meme
            </p>
            <div className="flex flex-wrap gap-2">
              <ChoiceButton
                active={answers.firstMemeThought === "good"}
                label="Good"
                onClick={() => onSelectFirstMemeThought("good")}
              />
              <ChoiceButton
                active={answers.firstMemeThought === "average"}
                label="Average"
                onClick={() => onSelectFirstMemeThought("average")}
              />
              <ChoiceButton
                active={answers.firstMemeThought === "awful"}
                label="Awful"
                onClick={() => onSelectFirstMemeThought("awful")}
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-stone-700">Would you use it again?</p>
            <div className="flex flex-wrap gap-2">
              <ChoiceButton
                active={answers.wouldUseAgain === "yes"}
                label="Yes"
                onClick={() => onSelectWouldUseAgain("yes")}
              />
              <ChoiceButton
                active={answers.wouldUseAgain === "no"}
                label="No"
                onClick={() => onSelectWouldUseAgain("no")}
              />
              <ChoiceButton
                active={answers.wouldUseAgain === "maybe"}
                label="Maybe"
                onClick={() => onSelectWouldUseAgain("maybe")}
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-stone-700">
              Does the UI look like AI slop?
            </p>
            <div className="flex flex-wrap gap-2">
              <ChoiceButton
                active={answers.looksLikeAiSlop === "yes"}
                label="Yes"
                onClick={() => onSelectLooksLikeAiSlop("yes")}
              />
              <ChoiceButton
                active={answers.looksLikeAiSlop === "no"}
                label="No"
                onClick={() => onSelectLooksLikeAiSlop("no")}
              />
              <ChoiceButton
                active={answers.looksLikeAiSlop === "a_bit"}
                label="A bit"
                onClick={() => onSelectLooksLikeAiSlop("a_bit")}
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3 border-t border-stone-100 pt-4">
          <Image
            src="/alex-popup.png"
            alt="Alex"
            width={56}
            height={56}
            className="h-14 w-14 rounded-full object-cover"
          />
          <div>
            <p className="text-sm font-semibold text-stone-900">Alex, creator</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit || submitting}
          className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-full bg-stone-900 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Continue"}
        </button>
      </div>
    </div>
  );
}
