"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

type FeedbackAnswers = {
  postability: "yes" | "tweak" | "no" | null;
  blocker: "quality" | "control" | "formats" | "not_for_me" | null;
};

type FeedbackModalProps = {
  open: boolean;
  submitting: boolean;
  answers: FeedbackAnswers;
  onSelectPostability: (value: "yes" | "tweak" | "no") => void;
  onSelectBlocker: (value: "quality" | "control" | "formats" | "not_for_me") => void;
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
  onSelectPostability,
  onSelectBlocker,
  onSubmit,
}: FeedbackModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-stone-900/35 px-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-5 shadow-2xl">
        <p className="mb-4 text-sm font-semibold text-stone-900">
          Be honest — is this something you&apos;d actually post?
        </p>
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold text-stone-700">
              Be honest — would you post this?
            </p>
            <div className="flex flex-wrap gap-2">
              <ChoiceButton
                active={answers.postability === "yes"}
                label="Yes"
                onClick={() => onSelectPostability("yes")}
              />
              <ChoiceButton
                active={answers.postability === "tweak"}
                label="I’d tweak it"
                onClick={() => onSelectPostability("tweak")}
              />
              <ChoiceButton
                active={answers.postability === "no"}
                label="No"
                onClick={() => onSelectPostability("no")}
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-stone-700">
              What would make this actually usable for you?
            </p>
            <div className="flex flex-wrap gap-2">
              <ChoiceButton
                active={answers.blocker === "quality"}
                label="Better quality"
                onClick={() => onSelectBlocker("quality")}
              />
              <ChoiceButton
                active={answers.blocker === "control"}
                label="More control"
                onClick={() => onSelectBlocker("control")}
              />
              <ChoiceButton
                active={answers.blocker === "formats"}
                label="Different formats"
                onClick={() => onSelectBlocker("formats")}
              />
              <ChoiceButton
                active={answers.blocker === "not_for_me"}
                label="Nothing — not for me"
                onClick={() => onSelectBlocker("not_for_me")}
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
          disabled={submitting}
          className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-full bg-stone-900 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Continue"}
        </button>
      </div>
    </div>
  );
}
