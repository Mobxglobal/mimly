type TemplateRow = Record<string, unknown>;

export function buildSimplePrompt(input: string, template: TemplateRow): string {
  const userInput = String(input ?? "").replace(/\s+/g, " ").trim();
  const templateName = String(template.template_name ?? template.slug ?? "template").trim();
  const memeMechanic = String(template.meme_mechanic ?? "general meme").trim();
  const isStructured = template.text_layout_type !== "top_caption";
  const patternType = String(template.pattern_type ?? "").trim();
  const templateLogic = String(template.template_logic ?? "").trim();
  const emotionStyle = String(template.emotion_style ?? "").trim();
  const hasSecondSlot =
    template.slot_2_max_chars != null || template.slot_2_max_lines != null;
  const hasThirdSlot =
    template.slot_3_max_chars != null || template.slot_3_max_lines != null;

  const slotSchema = {
    title: "short title, under 45 chars",
    top_text: "primary meme text",
    bottom_text: hasSecondSlot ? "secondary text for slot 2" : null,
    slot_3_text: hasThirdSlot ? "optional slot 3 text if needed" : null,
  };

  if (isStructured) {
    const base = [
      "Write meme content as valid JSON only.",
      `Template: ${templateName}`,
      `User input: ${userInput}`,
      "Each slot is a short label (1–4 words).",
      "Do NOT write sentences.",
    ];

    let structureRules: string[] = [];

    if (patternType === "contrast" || patternType === "comparison") {
      structureRules = [
        "The slots must directly contrast each other.",
        "They should feel like A vs B.",
        "Make the difference clear and relatable.",
      ];
    }

    if (patternType === "character_dialogue") {
      structureRules = [
        "Each slot represents a different perspective.",
        "They should feel like opposing opinions or takes.",
      ];
    }

    if (template.meme_mechanic === "temptation_shift") {
      structureRules = [
        "One slot is the tempting distraction.",
        "One slot is the person or decision maker.",
        "One slot is what is being ignored.",
      ];
    }

    return [
      ...base,
      "Follow these roles exactly:",
      template.slot_1_role ? `Slot 1: ${String(template.slot_1_role)}` : null,
      template.slot_2_role ? `Slot 2: ${String(template.slot_2_role)}` : null,
      template.slot_3_role ? `Slot 3: ${String(template.slot_3_role)}` : null,
      ...structureRules,
      template.example_output
        ? `Example: ${String(template.example_output)}`
        : null,
      `JSON schema: ${JSON.stringify(slotSchema)}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "Write meme copy as valid JSON only.",
    `Template: ${templateName}`,
    `User input: ${userInput}`,
    "Write one complete, natural sentence.",
    "It must describe a specific, relatable situation.",
    "Include a concrete detail (e.g. timing, action, or situation).",
    templateLogic ? `Guidance: ${templateLogic}` : null,
    emotionStyle ? `Tone: ${emotionStyle}` : null,
    "The sentence should feel conversational and realistic.",
    "Avoid generic phrasing or vague statements.",
    "Do NOT end with a comma.",
    "Do NOT use ellipses.",
    "Do NOT leave the sentence unfinished.",
    `JSON schema: ${JSON.stringify(slotSchema)}`,
  ]
    .filter(Boolean)
    .join("\n");
}
