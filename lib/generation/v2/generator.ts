type GeneratedSlots = {
  title: string;
  top_text: string;
  bottom_text: string | null;
  slot_3_text: string | null;
};

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const fromFence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fromFence?.[1] ?? trimmed;
  return JSON.parse(candidate) as Record<string, unknown>;
}

function coerceGeneratedSlots(raw: Record<string, unknown>): GeneratedSlots {
  const title = normalizeText(raw.title);
  const top = normalizeText(raw.top_text);
  const bottom = normalizeText(raw.bottom_text);
  const slot3 = normalizeText(raw.slot_3_text);

  if (!top) {
    throw new Error("Model returned empty top_text.");
  }

  return {
    title: title || top.slice(0, 45),
    top_text: top,
    bottom_text: bottom || null,
    slot_3_text: slot3 || null,
  };
}

async function requestSlots(prompt: string, retryHint?: string): Promise<GeneratedSlots> {
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
  return coerceGeneratedSlots(parsed);
}

export async function generateTextFromTemplate(
  prompt: string
): Promise<GeneratedSlots> {
  try {
    return await requestSlots(prompt);
  } catch (firstError) {
    console.warn("[v2] first generation attempt failed, retrying once", firstError);
    return requestSlots(
      prompt,
      "Your previous output was too generic. Make it more specific and grounded in a real situation."
    );
  }
}

export type { GeneratedSlots };
