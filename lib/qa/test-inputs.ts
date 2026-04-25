import type { MemeTemplateForRender } from "@/renderer/renderMemeTemplate";
import { isWowDogeTemplateSlug } from "@/lib/memes/wow-doge";

export const TEST_INPUTS = {
  short: "wow",
  medium: "this is clean",
  long: "this is a longer sentence that should wrap nicely across multiple lines",
} as const;

export type QaSlotCopy = {
  top_text: string;
  bottom_text: string | null;
  slot_3_text: string | null;
  wowDogePhrases?: string[];
  names?: string[];
};

/**
 * Deterministic copy for QA previews — mirrors production slot usage without calling OpenAI.
 */
export function buildDeterministicCopy(params: {
  slug: string;
  template_family: string | null | undefined;
  isTwoSlot: boolean;
  isThreeSlot: boolean;
  templateForRender: MemeTemplateForRender;
}): QaSlotCopy {
  const family = String(params.template_family ?? "square_meme").trim();

  if (isWowDogeTemplateSlug(params.slug)) {
    return {
      top_text: "",
      bottom_text: null,
      slot_3_text: null,
      wowDogePhrases: [
        `wow ${TEST_INPUTS.short}`,
        `such ${TEST_INPUTS.medium}`,
        `very ${TEST_INPUTS.short}`,
        `much ${TEST_INPUTS.long.slice(0, 48)}`,
        `so clean`,
      ],
    };
  }

  if (family === "square_text") {
    return {
      top_text: TEST_INPUTS.long,
      bottom_text: "",
      slot_3_text: null,
    };
  }

  if (family === "engagement_text") {
    return {
      top_text: `${TEST_INPUTS.long}\n${TEST_INPUTS.medium}`,
      bottom_text: `Pick one:\n• ${TEST_INPUTS.short}\n• ${TEST_INPUTS.medium}\n• alt line`,
      slot_3_text: null,
      names: ["Alex", "Jordan", "Sam"],
    };
  }

  return {
    top_text: TEST_INPUTS.long,
    bottom_text: params.isTwoSlot ? TEST_INPUTS.medium : null,
    slot_3_text: params.isThreeSlot ? TEST_INPUTS.short : null,
  };
}
