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
  context_patch?: {
    noted_user_context: string | null;
  };
  suggested_formats?: MemeOutputFormat[];
  suggested_actions?: Array<
    "more_ideas" | "make_funnier" | "more_niche" | "switch_format"
  >;
  ui_pills?: Array<{
    label: string;
    message: string;
    kind: "format" | "action";
  }>;
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
  if (hasAny(l, ["slideshow", "carousel", "slides"])) return "vertical_slideshow";
  if (hasAny(l, ["video", "reel", "short"])) return "square_video";
  if (hasAny(l, ["text only", "quote card", "text meme"])) return "square_text";
  if (hasAny(l, ["image", "static meme"])) return "square_image";
  return null;
}

function formatLabel(format: MemeOutputFormat): string {
  if (format === "square_image") return "Image Meme";
  if (format === "square_video") return "Video Meme";
  if (format === "square_text") return "Text Meme";
  return "Slideshow";
}

function formatPills(
  preferred: MemeOutputFormat | null
): Array<{ label: string; message: string; kind: "format" }> {
  const ordered: MemeOutputFormat[] = [
    "square_image",
    "square_video",
    "square_text",
    "vertical_slideshow",
  ];
  const formats = preferred
    ? [preferred, ...ordered.filter((f) => f !== preferred)]
    : ordered;
  return formats.map((format) => ({
    label: formatLabel(format),
    message:
      format === "square_image"
        ? "Make image memes for this direction."
        : format === "square_video"
          ? "Turn this into short square video memes."
          : format === "square_text"
            ? "Make text-only meme versions."
            : "Turn this into a slideshow.",
    kind: "format",
  }));
}

function actionPills(
  items: Array<"more_ideas" | "make_funnier" | "more_niche" | "switch_format">
): Array<{ label: string; message: string; kind: "action" }> {
  return items.map((item) => {
    if (item === "more_ideas") {
      return { label: "More ideas", message: "Give me another one in this direction.", kind: "action" };
    }
    if (item === "make_funnier") {
      return { label: "Make it funnier", message: "Keep the idea, but make it funnier.", kind: "action" };
    }
    if (item === "more_niche") {
      return { label: "More niche", message: "Make this more niche for my target audience.", kind: "action" };
    }
    return { label: "Switch format", message: "Switch this into another format.", kind: "action" };
  });
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
  const hasReference = Boolean(ctx.latestJob || ctx.hasLatestCompletedOutputs);
  const overrideFormat = detectOutputOverride(userMessage);
  const preferredFormat = overrideFormat ?? ctx.latestJob?.output_format ?? null;

  if (isMoreIdeasMessage(userMessage) && hasReference) {
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
      recentContext.length > 0
        ? `Recent context updates: ${recentContext.join(" | ")}`
        : null,
      `User follow-up request: ${userMessage}`,
    ]
      .filter(Boolean)
      .join("\n");
    return {
      intent: "refine_existing",
      should_generate: true,
      assistant_response:
        "Got it. Making another version in the same direction.",
      prompt_for_generation: resolvedPrompt,
      output_format: outputFormat,
      variant_count: 1,
      relation_to_previous_job: "refine_last_generation",
      clarification_question: null,
      confidence: "high",
      suggested_formats: [outputFormat, "square_video", "square_text", "vertical_slideshow"].filter(
        (v, i, arr): v is MemeOutputFormat => arr.indexOf(v) === i
      ),
      suggested_actions: ["make_funnier", "more_niche", "switch_format"],
      ui_pills: [
        ...actionPills(["make_funnier", "more_niche", "switch_format"]),
        ...formatPills(outputFormat).slice(0, 1),
      ],
    };
  }

  if (isMetaHelp(userMessage)) {
    return {
      intent: "meta_help",
      should_generate: false,
      assistant_response:
        "Best default move is image memes first - they test angles fastest. Then we can convert winners into video, text-only cards, or a slideshow.",
      prompt_for_generation: null,
      output_format: null,
      variant_count: variantCount,
      relation_to_previous_job: "none",
      clarification_question: null,
      confidence: "high",
      suggested_formats: [
        "square_image",
        "square_video",
        "square_text",
        "vertical_slideshow",
      ],
      suggested_actions: ["more_ideas", "switch_format"],
      ui_pills: [...formatPills("square_image"), ...actionPills(["more_ideas"])].slice(0, 4),
    };
  }

  if (isContextUpdate(userMessage)) {
    return {
      intent: "context_update",
      should_generate: false,
      assistant_response:
        "Perfect - I have locked that context in. Next move: I can generate one image meme, one video meme, one text meme, or one slideshow.",
      prompt_for_generation: null,
      output_format: null,
      variant_count: variantCount,
      relation_to_previous_job: hasReference ? "follow_up" : "none",
      clarification_question: null,
      confidence: "high",
      context_patch: {
        noted_user_context: userMessage,
      },
      suggested_formats: [
        "square_image",
        "square_video",
        "square_text",
        "vertical_slideshow",
      ],
      suggested_actions: ["more_ideas", "switch_format"],
      ui_pills: formatPills("square_image"),
    };
  }

  if (isRefineExisting(userMessage, hasReference)) {
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
      recentContext.length > 0
        ? `Recent context updates: ${recentContext.join(" | ")}`
        : null,
      `User refinement request: ${userMessage}`,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      intent: "refine_existing",
      should_generate: true,
      assistant_response:
        "Nice direction - same core idea, updated exactly as requested. I will generate a refined set now.",
      prompt_for_generation: resolvedPrompt,
      output_format: outputFormat,
      variant_count: variantCount,
      relation_to_previous_job: "refine_last_generation",
      clarification_question: null,
      confidence: "high",
      suggested_formats: [outputFormat, "square_video", "square_text", "vertical_slideshow"].filter(
        (v, i, arr): v is MemeOutputFormat => arr.indexOf(v) === i
      ),
      suggested_actions: ["more_ideas", "make_funnier", "switch_format"],
      ui_pills: actionPills(["more_ideas", "make_funnier", "switch_format"]),
    };
  }

  if (isTooAmbiguous(userMessage) && !hasReference) {
    return {
      intent: "clarify_needed",
      should_generate: false,
      assistant_response:
        "Quick check so I can nail this: who is this for, and should I start with image memes, video memes, text memes, or a slideshow?",
      prompt_for_generation: null,
      output_format: null,
      variant_count: variantCount,
      relation_to_previous_job: "none",
      clarification_question:
        "Who is this for, and which format do you want first?",
      confidence: "high",
      suggested_formats: [
        "square_image",
        "square_video",
        "square_text",
        "vertical_slideshow",
      ],
      suggested_actions: ["switch_format"],
      ui_pills: formatPills("square_image"),
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
      recentContext.length > 0
        ? `Recent context updates: ${recentContext.join(" | ")}`
        : null,
      ctx.workspace.business_summary
        ? `Workspace summary: ${ctx.workspace.business_summary}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      intent: "generate",
      should_generate: true,
      assistant_response:
        outputFormat === "square_image"
          ? "Great brief. Making one image meme version now."
          : outputFormat === "square_video"
            ? "Great call. Making one square video version now."
            : outputFormat === "square_text"
              ? "Perfect. Making one text meme version now."
              : "Nice. Making one slideshow version now.",
      prompt_for_generation: resolvedPrompt,
      output_format: outputFormat,
      variant_count: variantCount,
      relation_to_previous_job: hasReference ? "follow_up" : "none",
      clarification_question: null,
      confidence: "medium",
      suggested_formats: [outputFormat, "square_video", "square_text", "vertical_slideshow"].filter(
        (v, i, arr): v is MemeOutputFormat => arr.indexOf(v) === i
      ),
      suggested_actions: ["more_ideas", "make_funnier", "switch_format"],
      ui_pills: [
        ...actionPills(["more_ideas", "make_funnier", "switch_format"]),
        ...formatPills(outputFormat).slice(0, 1),
      ],
    };
  }

  return {
    intent: "clarify_needed",
    should_generate: false,
    assistant_response:
      "I can definitely help with that. I work best by turning it into image memes, video memes, text memes, or a slideshow - which should I create first?",
    prompt_for_generation: null,
    output_format: null,
    variant_count: 1,
    relation_to_previous_job: hasReference ? "follow_up" : "none",
    clarification_question:
      "Which format should I create first: image meme, video meme, text meme, or slideshow?",
    confidence: "low",
    suggested_formats: [
      "square_image",
      "square_video",
      "square_text",
      "vertical_slideshow",
    ],
    suggested_actions: ["switch_format"],
    ui_pills: formatPills("square_image"),
  };
}

