type TemplateRow = Record<string, unknown>;

export function buildSimplePrompt(input: string, template: TemplateRow): string {
  const userInput = String(input ?? "").replace(/\s+/g, " ").trim();
  const templateName = String(template.template_name ?? template.slug ?? "template").trim();
  const memeMechanic = String(template.meme_mechanic ?? "general meme").trim();
  const isStructured = template.text_layout_type !== "top_caption";
  const patternType = String(template.pattern_type ?? "").trim();
  const templateLogic = String(template.template_logic ?? "").trim();
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
    `Mechanic: ${memeMechanic}`,
    `Template instructions:\n${templateLogic}`,
    `User input: ${userInput}`,
    "top_text must be a full, natural sentence that makes sense on its own.",
    "It must not feel cut off or incomplete.",
    "Prefer formats like:",
    "- 'When X happens, and Y...'",
    "- 'That moment when...'",
    "- 'POV: ...'",
    "- 'You: ... / Also you: ...'",
    "First, think of a specific real-world situation related to this input.",
    "The situation must be:",
    "- specific",
    "- realistic",
    "- immediately recognisable",
    "Then write the meme based on that situation.",
    "The meme must:",
    "- feel like a real moment",
    "- not be generic",
    "- not sound like a caption or description",
    "- feel like something someone would share",
    "If the output could apply to any situation, it is invalid.",
    "Be specific.",
    "The meme must be a complete thought with a clear setup and payoff.",
    "It should feel like a real, relatable situation with a twist, reaction, or punchline.",
    "Avoid unfinished sentences or vague statements.",
    "Avoid generic phrases like 'make it bold' or 'something funny'.",
    "The meme must describe a specific, real-world situation.",
    "It should include concrete details (e.g. work tasks, tools, behaviors, scenarios).",
    "Avoid vague situations like 'when things go wrong' or 'when something happens'.",
    "If the meme could apply to any job or any situation, it is too generic.",
    "Make it feel like an insider moment.",
    "The second half of the sentence should create contrast, escalation, or irony.",
    "Example:",
    "'When the client says it’s a quick change but you’re rebuilding the entire dashboard'",
    "No hashtags. No markdown. No extra keys.",
    `JSON schema: ${JSON.stringify(slotSchema)}`,
  ].join("\n");
}
