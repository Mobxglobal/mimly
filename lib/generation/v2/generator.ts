type GeneratedSlots = {
  title: string;
  top_text: string;
  bottom_text: string | null;
  slot_3_text: string | null;
  __weak?: boolean;
};

type TemplateShape = Record<string, unknown>;

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanSlotText(value: unknown): string {
  return String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/[’]/g, "'")
    // Remove only wrapping quote characters, preserve internal apostrophes.
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^(?:left|right|center|slot\s*[123])\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const fromFence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fromFence?.[1] ?? trimmed;
  return JSON.parse(candidate) as Record<string, unknown>;
}

function isIncompleteEnding(text: string): boolean {
  const lower = text.toLowerCase().trim();

  const badEndings = [
    "before you",
    "while the",
    "like youre",
    "like you are",
    "as you",
    "just as",
    "right as",
    "about to",
    "in the middle of",
    "when you",
  ];

  return badEndings.some((e) => lower.endsWith(e));
}

function isCompleteSentence(text: string): boolean {
  const lower = text.toLowerCase().trim();

  const badEndings = [
    "for a",
    "with a",
    "to a",
    "of a",
    "in a",
    "on a",
    "while the",
    "before you",
    "like youre",
    "like you are",
    "about to",
    "as you",
  ];

  if (badEndings.some((e) => lower.endsWith(e))) {
    return false;
  }

  if (text.split(" ").filter(Boolean).length < 6) {
    return false;
  }

  return true;
}

function coerceGeneratedSlots(
  raw: Record<string, unknown>,
  template: TemplateShape
): GeneratedSlots {
  const title = normalizeText(raw.title);
  const rawTop = String(raw.top_text ?? "");
  const rawBottom = String(raw.bottom_text ?? "");
  const rawSlot3 = String(raw.slot_3_text ?? "");
  const top = cleanSlotText(rawTop);
  const clean = top.replace(/[.,…]+$/g, "").trim();
  let bottomText = cleanSlotText(rawBottom);
  let slot3 = cleanSlotText(rawSlot3);
  const mechanicGroup = normalizeText(template.mechanic_group);
  const isStructured =
    mechanicGroup === "spatial_roles" ||
    mechanicGroup === "contrast_binary" ||
    mechanicGroup === "contrast_multi";
  const memeMechanic = normalizeText(template.meme_mechanic).toLowerCase();
  const slug = normalizeText(template.slug).toLowerCase();
  const templateName = normalizeText(template.template_name).toLowerCase();
  const isNobodyMe = memeMechanic === "nobody_me_setup";
  const isWizardsTalkingSubject =
    slug.includes("wizard") || templateName.includes("wizard");

  if (isNobodyMe) {
    const parts = bottomText.split(/Me:/i).filter(Boolean);
    bottomText = parts.length > 0 ? `Me: ${parts[0].trim()}` : bottomText;
    if (!bottomText.startsWith("Me:")) {
      throw new Error("Nobody/Me slot_2 must start with Me:");
    }
    if (bottomText.length <= 15) {
      throw new Error("Nobody/Me slot_2 too short.");
    }
    if (/[\r\n]/.test(rawBottom) || /[\r\n]/.test(bottomText)) {
      throw new Error("Nobody/Me slot_2 contains line breaks.");
    }
    if (bottomText.length > 80) {
      bottomText = bottomText.slice(0, 80).trim();
    }
    return {
      title: title || "Nobody / Me",
      top_text: "Nobody:",
      bottom_text: bottomText,
      slot_3_text: null,
    };
  }

  if (isWizardsTalkingSubject) {
    const hasBadChars = (value: string) =>
      /[\r\n]/.test(value) ||
      /["'`]/.test(value) ||
      /^(?:left|right|center|slot\s*[123])\s*:/i.test(value);
    if (!clean || !bottomText || !slot3) {
      throw new Error("Wizards requires all 3 slots.");
    }
    if (clean.length > 24 || slot3.length > 24 || bottomText.length > 12) {
      throw new Error("Wizards slot length exceeds limits.");
    }
    if (hasBadChars(rawTop) || hasBadChars(rawBottom) || hasBadChars(rawSlot3)) {
      throw new Error("Wizards slots contain labels, quotes, or newlines.");
    }
    return {
      title: title || clean.slice(0, 45),
      top_text: clean,
      bottom_text: bottomText,
      slot_3_text: slot3,
    };
  }

  if (!clean) {
    throw new Error("Model returned empty top_text.");
  }
  let isWeak = false;
  if (!isStructured) {
    if (
      !clean.includes("you") &&
      !clean.includes("your") &&
      !clean.toLowerCase().includes("when")
    ) {
      isWeak = true;
    }
    // top_caption -> sentence required
    if (clean.length < 20) {
      isWeak = true;
    }

    if (isIncompleteEnding(clean)) {
      return {
        title: title || clean.slice(0, 45),
        top_text: clean,
        bottom_text: bottomText || null,
        slot_3_text: slot3 || null,
        __weak: true,
      };
    }
  } else {
    // structured templates -> short labels allowed
    if (clean.length < 2) {
      throw new Error("Slot text too short.");
    }
  }

  return {
    title: title || clean.slice(0, 45),
    top_text: clean,
    bottom_text: bottomText || null,
    slot_3_text: slot3 || null,
    __weak: isWeak ? true : undefined,
  };
}

async function requestSlots(
  prompt: string,
  template: TemplateShape,
  retryHint?: string
): Promise<GeneratedSlots> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  const model = process.env.OPENAI_V2_MODEL || "gpt-4o-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.6,
      messages: [
        {
          role: "system",
          content: "Return only JSON with keys: title, top_text, bottom_text, slot_3_text.",
        },
        {
          role: "user",
          content: retryHint ? `${prompt}\n\n${retryHint}` : prompt,
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = json.choices?.[0]?.message?.content ?? "";
  if (!content.trim()) {
    throw new Error("OpenAI returned empty content.");
  }

  const parsed = parseJsonObject(content);
  return coerceGeneratedSlots(parsed, template);
}

export async function generateTextFromTemplate(
  prompt: string,
  template: TemplateShape
): Promise<GeneratedSlots> {
  const memeMechanic = normalizeText(template.meme_mechanic).toLowerCase();
  const slug = normalizeText(template.slug).toLowerCase();
  const templateName = normalizeText(template.template_name).toLowerCase();
  const isNobodyMe = memeMechanic === "nobody_me_setup";
  const isWizardsTalkingSubject =
    slug.includes("wizard") || templateName.includes("wizard");

  const retryHints = [
    undefined,
    "Fix structure exactly. No labels, no quotes, no line breaks.",
    "Return concise slot values only and satisfy all slot limits.",
  ];
  const pickBest = (items: GeneratedSlots[]): GeneratedSlots =>
    items.reduce((best, current) =>
      current.top_text.length > best.top_text.length ? current : best
    );

  const results: GeneratedSlots[] = [];
  let lastError: unknown = null;
  for (let i = 0; i < retryHints.length; i += 1) {
    try {
      const res = await requestSlots(prompt, template, retryHints[i]);
      results.push(res);
    } catch (error) {
      lastError = error;
      console.warn(`[v2] generation attempt ${i + 1} failed`, error);
    }
  }

  if (results.length > 0) {
    const strong = results.filter(
      (result) => result.__weak !== true && isCompleteSentence(result.top_text)
    );
    if (strong.length > 0) {
      return pickBest(strong);
    }

    const usable = results.filter((result) => isCompleteSentence(result.top_text));
    if (usable.length > 0) {
      return pickBest(usable);
    }

    return pickBest(results);
  }

  if (isWizardsTalkingSubject) {
    return {
      title: "Wizards Contrast",
      top_text: "Organic growth",
      bottom_text: "Ads",
      slot_3_text: "Retention",
    };
  }

  if (isNobodyMe) {
    return {
      title: "Nobody / Me",
      top_text: "Nobody:",
      bottom_text: "Me: checks it again anyway",
      slot_3_text: null,
    };
  }

  throw lastError instanceof Error ? lastError : new Error("V2 generation failed.");
}

export type { GeneratedSlots };
