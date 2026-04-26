import type { MemeOutputFormat } from "@/lib/memes/meme-output-formats";
import { resolveWorkspaceOutputFormat } from "@/lib/workspace/output-format-resolver";

type InterpreterMessage = {
  role: "user" | "assistant" | "system";
  message_type: "text" | "status" | "generation_result" | "gate_notice";
  content: Record<string, unknown>;
};

type InterpreterLatestJob = {
  prompt: string;
  output_format: MemeOutputFormat | null;
  template_family_preference?: "engagement_text" | null;
  status:
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "blocked_auth"
    | "blocked_payment"
    | "cancelled";
} | null;

export type WorkspaceIntent =
  | "generate"
  | "refine_existing"
  | "context_update"
  | "clarify_needed"
  | "meta_help";

export type WorkspaceIntentPlan = {
  intent: WorkspaceIntent;
  should_generate: boolean;
  assistant_response: string;
  prompt_for_generation: string | null;
  output_format: MemeOutputFormat | null;
  variant_count: number;
  relation_to_previous_job: "none" | "follow_up" | "refine_last_generation";
  clarification_question: string | null;
  confidence: "high" | "medium" | "low";
  explicit_promo_intent: boolean;
  promo_context_excerpt?: string | null;
  context_patch?: {
    noted_user_context: string | null;
  };
  suggested_formats?: MemeOutputFormat[];
  suggested_actions?: Array<
    "more_ideas" | "more_niche" | "switch_format"
  >;
  ui_pills?: Array<{
    label: string;
    message: string;
    kind: "format" | "action";
  }>;
  template_family_preference?: "engagement_text" | null;
};

export type WorkspaceInterpreterContext = {
  userMessage: string;
  recentMessages: InterpreterMessage[];
  latestJob: InterpreterLatestJob;
  hasLatestCompletedOutputs: boolean;
  workspace: {
    initial_prompt: string;
    business_url: string | null;
    business_summary: string | null;
    preview_generations_used: number;
  };
  resetContext?: boolean;
};

function lower(text: string): string {
  return text.toLowerCase();
}

function getMessageText(content: Record<string, unknown>): string {
  const value = content?.text;
  return typeof value === "string" ? value.trim() : "";
}

function hasAny(text: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

function parseVariantCount(text: string): number {
  const match = text.match(/\b(\d{1,2})\s*(memes?|ideas?|versions?|options?|posts?|slides?)\b/i);
  if (!match) return 1;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return 1;
  return 1;
}

function extractRecentContextSnippets(
  recentMessages: InterpreterMessage[],
  latestUserMessage: string
): string[] {
  const updates: string[] = [];
  const isContextish = [
    "audience",
    "tone",
    "voice",
    "brand",
    "target",
    "customers",
    "customer",
    "women",
    "men",
    "mums",
    "moms",
    "uk",
    "us",
    "premium",
    "sarcastic",
    "playful",
    "b2b",
  ] as const;

  for (const message of recentMessages) {
    if (message.role !== "user" || message.message_type !== "text") continue;
    const text = getMessageText(message.content);
    if (!text || text === latestUserMessage) continue;
    const l = lower(text);
    if (hasAny(l, isContextish) && text.length <= 220) {
      updates.push(text);
    }
  }

  return updates.slice(-3);
}

function isMetaHelp(text: string): boolean {
  const l = lower(text);
  const helpPhrases = [
    "which format",
    "what format",
    "why does",
    "why is",
    "what should i post",
    "what do you recommend",
    "recommend",
    "best option",
    "what works best",
    "should i use",
    "which one is better",
  ] as const;
  return hasAny(l, helpPhrases) && l.includes("?");
}

function isContextUpdate(text: string): boolean {
  const l = lower(text);
  const contextSignals = [
    "my audience",
    "our audience",
    "our tone",
    "brand voice",
    "we target",
    "we only target",
    "our customers",
    "for uk",
    "for us",
    "mostly women",
    "mostly men",
    "tone is",
    "brand is",
  ] as const;
  const generationSignals = [
    "generate",
    "create",
    "make",
    "give me",
    "write",
    "produce",
  ] as const;
  return hasAny(l, contextSignals) && !hasAny(l, generationSignals);
}

function isRefineExisting(text: string, hasReference: boolean): boolean {
  const l = lower(text);
  const refineSignals = [
    "make these",
    "make this",
    "same idea",
    "turn this",
    "less salesy",
    "more funny",
    "funnier",
    "rewrite",
    "another version",
    "more like this",
    "keep the idea",
    "same concept",
  ] as const;
  if (hasAny(l, refineSignals)) return true;
  if (!hasReference) return false;
  return (
    hasAny(l, ["more", "less", "tone", "angle", "for mums", "for moms"]) &&
    !hasAny(l, ["what should", "why is", "which format"])
  );
}

const TOPIC_SHIFT_PHRASES = [
  "switch to",
  "instead of",
  "new topic",
  "different topic",
  "another topic",
  "different niche",
  "new niche",
  "different business",
  "another business",
  "not plumbing",
  "not roofing",
] as const;

const DOMAIN_HINT_TERMS = [
  "plumbing",
  "plumber",
  "roofing",
  "roofer",
  "hvac",
  "electrician",
  "electrical",
  "landscaping",
  "landscaper",
  "dentist",
  "dental",
  "restaurant",
  "cafe",
  "bakery",
  "salon",
  "barber",
  "gym",
  "fitness",
  "real estate",
  "realtor",
  "contractor",
  "construction",
] as const;

function toTopicTokenSet(text: string): Set<string> {
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "your",
    "you",
    "our",
    "about",
    "into",
    "make",
    "create",
    "generate",
    "meme",
    "memes",
    "video",
    "text",
    "post",
    "posts",
    "content",
    "ideas",
    "brand",
    "business",
    "audience",
  ]);
  const tokens = lower(text)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4 && !stop.has(t));
  return new Set(tokens);
}

function hasDomainHint(text: string): boolean {
  const l = lower(text);
  return DOMAIN_HINT_TERMS.some((term) => l.includes(term));
}

function detectTopicShift(
  userMessage: string,
  ctx: WorkspaceInterpreterContext
): boolean {
  if (!ctx.latestJob && !ctx.hasLatestCompletedOutputs) return false;
  const l = lower(userMessage);
  if (TOPIC_SHIFT_PHRASES.some((phrase) => l.includes(phrase))) return true;

  const anchor = [
    ctx.latestJob?.prompt ?? "",
    ctx.workspace.business_summary ?? "",
    ctx.workspace.initial_prompt ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  if (!anchor.trim()) return false;

  const userTokens = toTopicTokenSet(userMessage);
  const anchorTokens = toTopicTokenSet(anchor);
  if (userTokens.size < 3 || anchorTokens.size < 3) return false;

  let overlapCount = 0;
  for (const token of userTokens) {
    if (anchorTokens.has(token)) overlapCount += 1;
  }
  const overlapRatio = overlapCount / userTokens.size;

  // Conservative shift detection: explicit new-domain hint + low lexical overlap.
  return hasDomainHint(userMessage) && overlapRatio <= 0.15;
}

function isGenerate(text: string): boolean {
  const l = lower(text);
  const generationSignals = [
    "generate",
    "create",
    "make",
    "give me",
    "write",
    "produce",
    "memes",
    "slideshow",
    "video",
    "post ideas",
    "content ideas",
    "engagement post",
  ] as const;
  return hasAny(l, generationSignals);
}

function isTooAmbiguous(text: string): boolean {
  const l = lower(text);
  if (text.trim().length < 16) return true;
  return hasAny(l, [
    "make it better",
    "try another one",
    "do something",
    "something for my business",
    "another one",
  ]);
}

function detectOutputOverride(text: string): MemeOutputFormat | null {
  const l = lower(text);
  if (hasAny(l, ["video", "reel", "short"])) return "square_video";
  if (hasAny(l, ["text only", "quote card", "text meme"])) return "square_text";
  if (hasAny(l, ["image", "static meme"])) return "square_image";
  return null;
}

function detectEngagementPostOverride(text: string): boolean {
  const l = lower(text);
  return l.includes("engagement post");
}

function detectExplicitPromoIntent(text: string): {
  explicitPromoIntent: boolean;
  promoContextExcerpt: string | null;
} {
  const trimmed = text.trim();
  const l = lower(trimmed);
  const promoSignals = [
    /\bsale\b/i,
    /\bdiscount\b/i,
    /\bhalf[\s-]?price\b/i,
    /\boffer\b/i,
    /\bdeal\b/i,
    /\bbook now\b/i,
    /\bopening offer\b/i,
    /\blaunch offer\b/i,
    /\b\d{1,2}%\s*off\b/i,
    /\bpercent off\b/i,
    /\bbogo\b/i,
    /\bbuy one get one\b/i,
    /\b(until|ends|valid|expires)\s+\w+/i,
    /\b(on|from|until)\s+\d{1,2}(st|nd|rd|th)?\b/i,
  ];
  const hit = promoSignals.some((pattern) => pattern.test(l));
  return {
    explicitPromoIntent: hit,
    promoContextExcerpt: hit ? trimmed.slice(0, 280) : null,
  };
}

function formatLabel(format: MemeOutputFormat): string {
  if (format === "square_image") return "Image Meme";
  if (format === "square_video") return "Video Meme";
  if (format === "square_text") return "Text Meme";
  return "Image Meme";
}

function availableFormatsSentence(): string {
  return "I can help you create: square image memes, square video memes, square text memes, and engagement posts.";
}

function formatPills(
  preferred: MemeOutputFormat | "engagement_post" | null
): Array<{ label: string; message: string; kind: "format" }> {
  const ordered: Array<MemeOutputFormat | "engagement_post"> = [
    "square_image",
    "square_video",
    "square_text",
    "engagement_post",
  ];
  const formats = preferred
    ? [preferred, ...ordered.filter((f) => f !== preferred)]
    : ordered;
  return formats.map((format) => ({
    label:
      format === "engagement_post"
        ? "Engagement post"
        : formatLabel(format),
    message:
      format === "square_image"
        ? "Generate image memes for this idea"
        : format === "square_video"
          ? "Turn this idea into video memes"
          : format === "square_text"
            ? "Generate text memes for this idea"
            : format === "engagement_post"
              ? "Turn this idea into an engagement post"
              : "Turn this idea into an image meme",
    kind: "format",
  }));
}

function isMoreIdeasMessage(text: string): boolean {
  const l = lower(text);
  return hasAny(l, [
    "more ideas",
    "give me more",
    "another batch",
    "more like this",
    "another set",
    "more of these",
    "more please",
  ]);
}

export function interpretWorkspaceMessage(
  ctx: WorkspaceInterpreterContext
): WorkspaceIntentPlan {
  const userMessage = ctx.userMessage.trim();
  const variantCount = parseVariantCount(userMessage);
  const recentContext = extractRecentContextSnippets(ctx.recentMessages, userMessage);
  const resetContext = Boolean(ctx.resetContext);
  const topicShiftDetected = detectTopicShift(userMessage, ctx);
  const scopedRecentContext = resetContext
    ? []
    : topicShiftDetected
      ? recentContext.slice(-1)
    : recentContext;
  const hasReference = Boolean(ctx.latestJob || ctx.hasLatestCompletedOutputs);
  const hasReferenceForAnchoring = hasReference && !resetContext;
  const engagementRequested = detectEngagementPostOverride(userMessage);
  const overrideFormat = engagementRequested
    ? ("square_text" as const)
    : detectOutputOverride(userMessage);
  const preferredFormat = overrideFormat ?? ctx.latestJob?.output_format ?? null;
  const templateFamilyPreference = engagementRequested
    ? "engagement_text"
    : overrideFormat !== null
      ? null
      : ctx.latestJob?.template_family_preference ?? null;
  const promoDetection = detectExplicitPromoIntent(userMessage);

  if (isMoreIdeasMessage(userMessage) && hasReferenceForAnchoring) {
    const outputFormat =
      preferredFormat ??
      resolveWorkspaceOutputFormat({
        prompt: userMessage,
        businessUrl: ctx.workspace.business_url,
      });
    const basePrompt = ctx.latestJob?.prompt || ctx.workspace.initial_prompt || "brand memes";
    const resolvedPrompt = [
      `Generate another batch in the same direction.`,
      `Base direction: ${basePrompt}`,
      scopedRecentContext.length > 0
        ? `Recent context updates: ${scopedRecentContext.join(" | ")}`
        : null,
      `User follow-up request: ${userMessage}`,
    ]
      .filter(Boolean)
      .join("\n");
    return {
      intent: "refine_existing",
      should_generate: true,
      assistant_response:
        "Running another version of this idea.",
      prompt_for_generation: resolvedPrompt,
      output_format: outputFormat,
      template_family_preference: templateFamilyPreference,
      variant_count: 1,
      relation_to_previous_job: "refine_last_generation",
      clarification_question: null,
      confidence: "high",
      explicit_promo_intent: promoDetection.explicitPromoIntent,
      promo_context_excerpt: promoDetection.promoContextExcerpt,
      suggested_formats: [outputFormat, "square_video", "square_text"].filter(
        (v, i, arr): v is MemeOutputFormat => arr.indexOf(v) === i
      ),
      suggested_actions: ["more_ideas", "switch_format"],
      ui_pills: formatPills(
        templateFamilyPreference === "engagement_text"
          ? "engagement_post"
          : outputFormat
      ),
    };
  }

  if (isMetaHelp(userMessage)) {
    return {
      intent: "meta_help",
      should_generate: false,
      assistant_response:
        "Start with image memes — fastest way to test angles. We can turn winners into video, text, or engagement posts after.",
      prompt_for_generation: null,
      output_format: null,
      variant_count: variantCount,
      relation_to_previous_job: "none",
      clarification_question: null,
      confidence: "high",
      explicit_promo_intent: promoDetection.explicitPromoIntent,
      promo_context_excerpt: promoDetection.promoContextExcerpt,
      suggested_formats: ["square_image", "square_video", "square_text"],
      suggested_actions: ["more_ideas", "switch_format"],
      ui_pills: formatPills("square_image"),
    };
  }

  if (isContextUpdate(userMessage)) {
    return {
      intent: "context_update",
      should_generate: false,
      assistant_response:
        "Context locked. Next move: image meme, video meme, text meme, or engagement post.",
      prompt_for_generation: null,
      output_format: null,
      variant_count: variantCount,
      relation_to_previous_job: hasReference ? "follow_up" : "none",
      clarification_question: null,
      confidence: "high",
      explicit_promo_intent: promoDetection.explicitPromoIntent,
      promo_context_excerpt: promoDetection.promoContextExcerpt,
      context_patch: {
        noted_user_context: userMessage,
      },
      suggested_formats: ["square_image", "square_video", "square_text"],
      suggested_actions: ["more_ideas", "switch_format"],
      ui_pills: formatPills("square_image"),
    };
  }

  if (
    isRefineExisting(userMessage, hasReferenceForAnchoring) &&
    !topicShiftDetected &&
    !resetContext
  ) {
    const outputFormat =
      overrideFormat ??
      ctx.latestJob?.output_format ??
      resolveWorkspaceOutputFormat({
        prompt: userMessage,
        businessUrl: ctx.workspace.business_url,
      });
    const basePrompt = ctx.latestJob?.prompt || ctx.workspace.initial_prompt || "brand memes";
    const resolvedPrompt = [
      `Refine the previous direction.`,
      `Base direction: ${basePrompt}`,
      scopedRecentContext.length > 0
        ? `Recent context updates: ${scopedRecentContext.join(" | ")}`
        : null,
      `User refinement request: ${userMessage}`,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      intent: "refine_existing",
      should_generate: true,
      assistant_response:
        "Same idea — refined as requested. Generating now.",
      prompt_for_generation: resolvedPrompt,
      output_format: outputFormat,
      template_family_preference: templateFamilyPreference,
      variant_count: variantCount,
      relation_to_previous_job: "refine_last_generation",
      clarification_question: null,
      confidence: "high",
      explicit_promo_intent: promoDetection.explicitPromoIntent,
      promo_context_excerpt: promoDetection.promoContextExcerpt,
      suggested_formats: [outputFormat, "square_video", "square_text"].filter(
        (v, i, arr): v is MemeOutputFormat => arr.indexOf(v) === i
      ),
      suggested_actions: ["more_ideas", "switch_format"],
      ui_pills: formatPills(
        templateFamilyPreference === "engagement_text"
          ? "engagement_post"
          : outputFormat
      ),
    };
  }

  if (isTooAmbiguous(userMessage) && !hasReference) {
    return {
      intent: "clarify_needed",
      should_generate: false,
      assistant_response:
        "Before I run this — who is this for, and which format should I start with? I can create square image memes, square video memes, square text memes, and engagement posts.",
      prompt_for_generation: null,
      output_format: null,
      variant_count: variantCount,
      relation_to_previous_job: "none",
      clarification_question:
        "Who is this for, and what format should I start with?",
      confidence: "high",
      explicit_promo_intent: promoDetection.explicitPromoIntent,
      promo_context_excerpt: promoDetection.promoContextExcerpt,
      suggested_formats: ["square_image", "square_video", "square_text"],
      suggested_actions: ["switch_format"],
      ui_pills: formatPills(null),
    };
  }

  if (isGenerate(userMessage)) {
    const outputFormat =
      overrideFormat ??
      resolveWorkspaceOutputFormat({
        prompt: userMessage,
        businessUrl: ctx.workspace.business_url,
      });
    const resolvedPrompt = [
      `Primary request: ${userMessage}`,
      scopedRecentContext.length > 0
        ? `Recent context updates: ${scopedRecentContext.join(" | ")}`
        : null,
      !topicShiftDetected && !resetContext && ctx.workspace.business_summary
        ? `Workspace summary: ${ctx.workspace.business_summary}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      intent: "generate",
      should_generate: true,
      assistant_response:
        resetContext
          ? outputFormat === "square_image"
            ? "Fresh context noted. Generating from this new prompt."
            : outputFormat === "square_video"
              ? "Fresh context noted. Generating a square video from this new prompt."
              : outputFormat === "square_text"
                ? templateFamilyPreference === "engagement_text"
                  ? "Fresh context noted. Generating an engagement post from this new prompt."
                  : "Fresh context noted. Generating a text meme from this new prompt."
                : "Fresh context noted. Generating from this new prompt."
          : topicShiftDetected
          ? outputFormat === "square_image"
            ? "Topic shift noted. Generating for the new topic."
            : outputFormat === "square_video"
              ? "Topic shift noted. Generating a square video for the new topic."
              : outputFormat === "square_text"
                ? templateFamilyPreference === "engagement_text"
                  ? "Topic shift noted. Generating an engagement post for the new topic."
                  : "Topic shift noted. Generating a text meme for the new topic."
                : "Topic shift noted. Generating for the new topic."
          : outputFormat === "square_image"
            ? "Strong brief. Generating an image meme."
            : outputFormat === "square_video"
              ? "Generating a square video meme."
              : outputFormat === "square_text"
                ? templateFamilyPreference === "engagement_text"
                  ? "Generating an engagement post."
                  : "Generating a text meme."
                : "Strong brief. Generating an image meme.",
      prompt_for_generation: resolvedPrompt,
      output_format: outputFormat,
      template_family_preference: templateFamilyPreference,
      variant_count: variantCount,
      relation_to_previous_job:
        resetContext || topicShiftDetected ? "none" : hasReference ? "follow_up" : "none",
      clarification_question: null,
      confidence: "medium",
      explicit_promo_intent: promoDetection.explicitPromoIntent,
      promo_context_excerpt: promoDetection.promoContextExcerpt,
      suggested_formats: [outputFormat, "square_video", "square_text"].filter(
        (v, i, arr): v is MemeOutputFormat => arr.indexOf(v) === i
      ),
      suggested_actions: ["more_ideas", "switch_format"],
      ui_pills: formatPills(
        templateFamilyPreference === "engagement_text"
          ? "engagement_post"
          : outputFormat
      ),
    };
  }

  return {
    intent: "clarify_needed",
    should_generate: false,
    assistant_response:
      "Pick a format to start.",
    prompt_for_generation: null,
    output_format: null,
    variant_count: 1,
    relation_to_previous_job: hasReference ? "follow_up" : "none",
    clarification_question:
      "What format should I start with: image, video, text, or engagement?",
    confidence: "low",
    explicit_promo_intent: promoDetection.explicitPromoIntent,
    promo_context_excerpt: promoDetection.promoContextExcerpt,
    suggested_formats: ["square_image", "square_video", "square_text"],
    suggested_actions: ["switch_format"],
    ui_pills: formatPills(null),
  };
}

