type TemplateRow = Record<string, unknown>;

export function buildSimplePrompt(input: string, template: TemplateRow): string {
  const userInput = String(input ?? "").replace(/\s+/g, " ").trim();
  const templateName = String(template.template_name ?? template.slug ?? "template").trim();
  const templateSlug = String(template.slug ?? "").trim().toLowerCase();
  const templateNameLower = templateName.toLowerCase();
  const memeMechanic = String(template.meme_mechanic ?? "general meme").trim();
  const mechanicGroup = template.mechanic_group;
  const isStructured =
    mechanicGroup === "spatial_roles" ||
    mechanicGroup === "contrast_binary" ||
    mechanicGroup === "contrast_multi";
  const isNobodyMe = memeMechanic === "nobody_me_setup";
  const isContrastBinary = memeMechanic === "contrast_binary";
  const isWizardsTalkingSubject =
    templateSlug.includes("wizard") || templateNameLower.includes("wizard");
  const isEightyFourYears = templateSlug === "it-has-been-84-years";
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

  if (isWizardsTalkingSubject) {
    return [
      "Write meme content as valid JSON only.",
      `Template: ${templateName}`,
      `User input: ${userInput}`,
      "This is a structured contrast meme.",
      "Return EXACTLY 3 slots mapped as:",
      "top_text = slot_1",
      "bottom_text = slot_2",
      "slot_3_text = slot_3",
      "Each slot must be a short phrase, NOT a sentence.",
      "slot_2 must be 1-2 words max.",
      "slot_1 and slot_3 must contrast.",
      "Do NOT include labels like Left:, Right:, Center:, Slot 1:, Slot 2:, Slot 3:.",
      "Do NOT include quotes.",
      "Do NOT include line breaks.",
      "Example: Organic growth | Ads | Retention",
      `JSON schema: ${JSON.stringify(slotSchema)}`,
    ].join("\n");
  }

  if (isNobodyMe) {
    return [
      "Write meme content as valid JSON only.",
      `Template: ${templateName}`,
      `User input: ${userInput}`,
      "",
      "This is a Nobody / Me format meme.",
      "slot_1 is fixed and must ALWAYS be exactly: Nobody:",
      "",
      "Output using JSON fields:",
      'top_text: "Nobody:"',
      'bottom_text: "Me: [one specific behaviour]"',
      "",
      "Rules:",
      "- Do NOT generate dynamic text for top_text",
      "- Generate ONLY bottom_text content",
      "- bottom_text must start with 'Me:'",
      "- Keep bottom_text concise and immediate",
      "- Make the behavior specific, slightly irrational, and relatable",
      "- No line breaks, labels, or quotes",
      "",
      "Example: Me: checks the dashboard again 5 seconds later",
      "",
      `JSON schema: ${JSON.stringify(slotSchema)}`,
    ].join("\n");
  }

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

    if (isContrastBinary) {
      structureRules = [
        ...structureRules,
        "Each slot must contain exactly ONE idea.",
        "Do NOT include multiple options, comparisons, or separators within a single slot.",
        "Do NOT use characters like '|', '/', 'vs', or 'and/or' to combine ideas.",
        "Each slot should be a short, standalone phrase.",
        'BAD: "Ignoring online presence | building trust online"',
        'GOOD: "Ignoring online presence"',
        'GOOD: "Building trust online"',
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
    "Keep it visually compact so it fits in 2-3 lines on a top-caption meme.",
    "Aim for concise phrasing, roughly 8-12 words when possible.",
    "Avoid long clauses, chained thoughts, or multi-part sentences.",
    "The sentence must still feel complete, not cut off.",
    "It must describe a specific, relatable situation.",
    "Include a concrete detail (e.g. timing, action, or situation).",
    "Focus on the uncomfortable, ironic, or exaggerated part of the situation.",
    "The humour should come from tension, contrast, or an implied problem.",
    "Avoid stating obvious or neutral situations.",
    "The situation must imply that something is slightly wrong, stressful, or uncomfortable.",
    "Avoid neutral situations where nothing is at stake.",
    "The sentence should hint at a consequence, mistake, or awkward outcome.",
    "Push the situation slightly further than reality to make it feel more intense or noticeable.",
    "Avoid safe or predictable phrasing.",
    "Do not stop at the obvious version of the idea.",
    "Make it feel like a real moment someone would recognise instantly.",
    "The sentence should hint at what goes wrong, feels awkward, or creates pressure.",
    isEightyFourYears
      ? "The image already contains the phrase 'It's been 84 years'. Do NOT repeat this phrase or reference specific numbers of years. Instead, describe a long delay or something that feels overdue in a natural, modern way."
      : null,
    isEightyFourYears
      ? "Avoid using specific time durations like '84 years', '100 years', or exaggerated numeric time references."
      : null,
    isEightyFourYears ? "Good: When you finally open the email you’ve been ignoring for weeks" : null,
    isEightyFourYears
      ? "Good: When you come back to a project after leaving it too long"
      : null,
    isEightyFourYears ? "Bad: It has been 84 years since..." : null,
    isEightyFourYears ? "Bad: 100 years later..." : null,
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
