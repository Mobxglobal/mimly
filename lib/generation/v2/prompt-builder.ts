type TemplateRow = Record<string, unknown>;

function detectProductConcept(input: string): string | null {
  const text = String(input ?? "").trim();
  if (!text) return null;

  const fromBusiness = text.match(/business:\s*([^.;\n|]+)/i)?.[1]?.trim();
  if (fromBusiness && fromBusiness.length >= 3) return fromBusiness;

  const fromProduct = text.match(/product:\s*([^.;\n|]+)/i)?.[1]?.trim();
  if (fromProduct && fromProduct.length >= 3) return fromProduct;

  const fromService = text.match(/service:\s*([^.;\n|]+)/i)?.[1]?.trim();
  if (fromService && fromService.length >= 3) return fromService;

  const helpsPattern = text.match(/([a-z0-9][a-z0-9\s'-]{2,50})\s+that\s+helps/i)?.[1]?.trim();
  if (helpsPattern && helpsPattern.length >= 3) return helpsPattern;

  return null;
}

export function buildSimplePrompt(
  input: string,
  template: TemplateRow,
  options?: { isPromotionalContext?: boolean }
): string {
  const userInput = String(input ?? "").replace(/\s+/g, " ").trim();
  const templateName = String(template.template_name ?? template.slug ?? "template").trim();
  const templateSlug = String(template.slug ?? "").trim().toLowerCase();
  const templateNameLower = templateName.toLowerCase();
  const memeMechanic = String(template.meme_mechanic ?? "general meme").trim();
  const memeMechanicLower = memeMechanic.toLowerCase();
  const mechanicGroup = template.mechanic_group;
  const isStructured =
    mechanicGroup === "spatial_roles" ||
    mechanicGroup === "contrast_binary" ||
    mechanicGroup === "contrast_multi";
  const isNobodyMe = memeMechanic === "nobody_me_setup";
  const isSpatialRoles = memeMechanicLower === "spatial_roles";
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
  const productConcept = detectProductConcept(userInput);
  const isPromotionalContext = options?.isPromotionalContext === true;
  const naturalRewriteRules = [
    "Interpret the input as a real business or product.",
    "Do NOT repeat it directly.",
    "Rewrite it naturally.",
  ];
  const promotionalBlock = isPromotionalContext
    ? [
        "PROMOTIONAL CONTEXT:",
        "The user input represents a real business, product, or service.",
        "Your goal is to create a meme that:",
        "* makes the business look appealing, useful, or desirable",
        "* highlights a positive outcome, benefit, or relatable win",
        "* frames the business as the better choice or solution",
        "DO NOT:",
        "* describe the business neutrally",
        "* repeat raw input text",
        "* include messy or keyword-style fragments",
        "* make the business look bad or irrelevant",
        "INSTEAD:",
        "* turn the business into a relatable scenario",
        "* show why someone would choose or appreciate it",
        "* keep it subtle and meme-native, not like a direct ad",
        "If the caption follows a 'When X...' format, ensure X leads to a positive or satisfying outcome involving the business.",
        "BAD: When business: flooring company in bath",
        "NEUTRAL (NOT GOOD ENOUGH): When you need flooring services",
        "GOOD: When the flooring company actually gets everything right first time",
      ]
    : [];

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
      ...naturalRewriteRules,
      ...promotionalBlock,
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
      ...naturalRewriteRules,
      ...promotionalBlock,
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
      ...naturalRewriteRules,
      ...promotionalBlock,
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
    if ((isSpatialRoles || isContrastBinary) && productConcept) {
      structureRules = [
        ...structureRules,
        "One option must represent the product/service from the input.",
        "The product/service must be the better or preferred option.",
        "The other option must be an inferior alternative, outdated behavior, or less effective choice.",
        "slot_1 must be the inferior/worse option.",
        "slot_2 must be the product/better/preferred option.",
        "The product or service from the input must be shown as the better choice.",
        "The other option should be a relatable but clearly worse alternative.",
        "Do not make both options equally good or neutral.",
        `Product/service to position as winner in slot_2: ${productConcept}`,
        "BAD: Gymshark | Sweatpants (neutral)",
        'GOOD slot_1: "Wearing old sweatpants"',
        'GOOD slot_2: "Wearing Gymshark to the gym"',
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
    "You are writing a high-quality meme caption.",
    "",
    "CORE RULES:",
    "* Write ONE complete, natural sentence.",
    "* The sentence MUST feel finished and make sense on its own.",
    "* Never end mid-thought or with an unfinished phrase.",
    "* Keep it concise and visually compact (fits in 2–3 lines).",
    "* Target ~10–16 words (can be shorter or longer if needed, but must stay clear and complete).",
    "",
    "CRITICAL COMPLETION RULE:",
    "NEVER end with incomplete phrases such as:",
    "* \"on the first\"",
    "* \"at the end\"",
    "* \"when you\"",
    "* \"and\"",
    "* \"and realize\"",
    "* \"but\"",
    "* \"so\"",
    "If a phrase like this appears, you MUST finish the thought fully.",
    "",
    "GOOD:",
    "\"When you find a flooring expert who gets it right on the first try\"",
    "",
    "BAD:",
    "\"When you find a flooring expert who gets it right on the first\"",
    "",
    "---",
    "",
    "TONE & STYLE:",
    "* Natural, human, and relatable",
    "* Clear setup → payoff structure",
    "* No filler phrases or generic AI wording",
    "* Avoid overcomplicated sentences",
    "",
    "---",
    "",
    "URL / BUSINESS CONTEXT HANDLING:",
    "If the input describes a business, product, or service:",
    "* Frame it in a positive, relatable way",
    "* Make the business feel valuable, satisfying, or impressive",
    "* Show a clear benefit, outcome, or relatable moment",
    "DO NOT:",
    "* Mention \"business:\", \"brand:\", or raw metadata",
    "* Sound like an ad or slogan",
    "* Be generic or vague",
    "INSTEAD:",
    "* Turn it into a real-life moment or feeling",
    "",
    "GOOD:",
    "\"When you finally find a flooring company that actually shows up on time\"",
    "",
    "BAD:",
    "\"When business: flooring company in Bath provides flooring services\"",
    "",
    "---",
    "",
    "TEMPLATE BEHAVIOR:",
    "Follow the meme logic and emotional tone:",
    templateLogic || "",
    `Emotion: ${emotionStyle || ""}`,
    "",
    "---",
    "",
    "OUTPUT FORMAT:",
    "Return ONLY valid JSON with these keys:",
    "{",
    "\"top_text\": \"...\",",
    "\"bottom_text\": \"\",",
    "\"slot_3_text\": \"\"",
    "}",
    "* For top-caption templates: use ONLY top_text",
    "* Do not add extra text or explanations",
    "",
    "---",
    "",
    "FINAL CHECK BEFORE OUTPUT:",
    "* Is the sentence complete?",
    "* Does it end naturally?",
    "* Would a human actually say this?",
    "If not, fix it before returning.",
  ]
    .filter(Boolean)
    .join("\n");
}
