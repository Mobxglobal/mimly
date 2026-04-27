"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { absoluteUrlForSharePath } from "@/lib/share/public-share-url";
import {
  createWorkspaceAdminClient,
  ensureWorkspaceToken,
  resolveWorkspaceAccessContext,
  hashWorkspaceToken,
} from "@/lib/workspace/auth";
import {
  buildWorkspaceGenerationPlan,
  enqueueGenerationJob,
  runGenerationJob,
  expireStaleGenerationJobs,
} from "@/lib/actions/workspace-generation";
import { resolveWorkspaceOutputFormat } from "@/lib/workspace/output-format-resolver";
import { interpretWorkspaceMessage } from "@/lib/workspace/message-interpreter";
import { getActiveEntitlement, hasActiveEntitlementForPlan, type WorkspacePlanCode } from "@/lib/workspace/entitlements";
import { getOrCreateDefaultWorkspaceForUser } from "@/lib/workspace/default-workspace";
import { renderEngagementTextMemePng } from "@/renderer/renderEngagementTextMeme";
import { renderSquareTextMemePng } from "@/renderer/renderSquareTextMeme";
import { mapMemeTemplateRowForRender } from "@/lib/memes/map-meme-template-row-for-render";
import {
  coerceEngagementVisualStyle,
  type EngagementVisualStyle,
} from "@/lib/memes/engagement-style";
import { buildPromptFromEnrichment } from "@/lib/url/build-context";
import { extractMetadata } from "@/lib/url/extract-metadata";
import { enrichContext, type EnrichedBusinessProfile } from "@/lib/url/enrich-context";
import {
  mergeWorkspaceMetadataWithBusinessProfile,
  parseBusinessProfileFromWorkspaceRow,
  persistWorkspaceBusinessProfile,
  resolveBusinessProfileFromUserText,
  finalizeProfileAfterPromptEnrichment,
  finalizeProfileAfterUrlEnrichment,
  isValidBusinessProfile,
  workspaceContextSummaryForJob,
} from "@/lib/workspace/business-profile";
import {
  extractedMetadataToDebugRecord,
  mergeDebugIntoMetadata,
  profileToDebugRecord,
} from "@/lib/workspace/generation-job-debug";

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];
type HomepageSubmitOptions = {
  preferredOutputFormat?:
    | "square_image"
    | "square_video"
    | "vertical_slideshow"
    | "square_text";
  templateFamilyPreference?: "engagement_text" | null;
  resetContext?: boolean;
  inputType?: "prompt" | "url";
  /** Browser session id (sessionStorage); scopes workspace reuse per session. */
  sessionId?: string | null;
};

type HomepageIntentOptions = {
  preferredOutputFormat?:
    | "square_image"
    | "square_video"
    | "vertical_slideshow"
    | "square_text";
  templateFamilyPreference?: "engagement_text" | null;
};

export type WorkspaceMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  message_type: "text" | "status" | "generation_result" | "gate_notice";
  content: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type WorkspaceJob = {
  id: string;
  status:
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "blocked_auth"
    | "blocked_payment"
    | "cancelled";
  block_reason: string | null;
  prompt: string;
  output_format: string | null;
  error_message: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
};

export type WorkspaceOutput = {
  id: string;
  image_url: string | null;
  title: string | null;
  top_text: string | null;
  bottom_text: string | null;
  post_caption: string | null;
  format: string | null;
  variant_metadata: Record<string, unknown> | null;
  created_at: string;
  is_pinned: boolean;
};

export type WorkspaceState = {
  workspace: {
    id: string;
    user_id: string | null;
    linked_at: string | null;
    gate_state: "anonymous_blocked" | "authenticated_plan_required" | "unlocked";
    status: string;
    initial_prompt: string;
    preview_generations_used: number;
    current_plan: "free_preview" | "starter_pack" | "unlimited";
    created_at: string;
  };
  messages: WorkspaceMessage[];
  latestJob: WorkspaceJob | null;
  outputs: WorkspaceOutput[];
};

function normalizePrompt(value: unknown): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.slice(0, 1200);
}

function tryExtractUrlFromPrompt(prompt: string): string | null {
  const match = prompt.match(/\bhttps?:\/\/[^\s)]+/i);
  if (!match) return null;
  return match[0].slice(0, 500);
}

function normalizeHomepageUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

function isAllowedHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function hasHomepageUrlMetadata(m: {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  h1?: string;
}): boolean {
  return Boolean(
    m.title.trim() ||
      m.description.trim() ||
      m.ogTitle.trim() ||
      m.ogDescription.trim() ||
      (typeof m.h1 === "string" && m.h1.trim())
  );
}

async function resolveHomepageInputToProfile(
  rawInput: string,
  inputType: "prompt" | "url"
): Promise<{
  finalProfile: EnrichedBusinessProfile;
  contextSummary: string;
  displayText: string;
  businessUrl: string | null;
  jobDebug: Record<string, unknown>;
}> {
  if (inputType === "url") {
    const normalizedUrl = normalizeHomepageUrl(rawInput);
    if (!normalizedUrl) {
      throw new Error("URL is required.");
    }
    if (!isAllowedHttpUrl(normalizedUrl)) {
      throw new Error("Invalid URL format.");
    }
    let pageMetadata;
    try {
      pageMetadata = await extractMetadata(normalizedUrl);
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : "Failed to fetch URL.");
    }
    if (!hasHomepageUrlMetadata(pageMetadata)) {
      throw new Error("No metadata found for this URL.");
    }
    const enriched = await enrichContext(pageMetadata);
    const finalProfile = finalizeProfileAfterUrlEnrichment(enriched, pageMetadata);
    const contextSummary = buildPromptFromEnrichment(finalProfile);
    console.log("ENRICHMENT OUTPUT", {
      inputType: "url" as const,
      finalProfile,
      contextSummary,
    });
    return {
      finalProfile,
      contextSummary,
      displayText: normalizedUrl,
      businessUrl: normalizedUrl,
      jobDebug: {
        inputType: "url",
        rawInput: rawInput.trim(),
        normalizedUrl,
        metadataExtracted: extractedMetadataToDebugRecord(pageMetadata),
        enrichedProfile: profileToDebugRecord(enriched),
        finalProfile: profileToDebugRecord(finalProfile),
        contextSummary,
      },
    };
  }

  const normalizedPrompt = normalizePrompt(rawInput);
  if (!normalizedPrompt) {
    throw new Error("Prompt is required.");
  }
  if (normalizedPrompt.length < 8) {
    throw new Error("Please enter a longer prompt (at least 8 characters).");
  }
  const enriched = await enrichContext({
    title: normalizedPrompt,
    description: normalizedPrompt,
  });
  const finalProfile = finalizeProfileAfterPromptEnrichment(enriched, normalizedPrompt);
  const contextSummary = buildPromptFromEnrichment(finalProfile);
  console.log("ENRICHMENT OUTPUT", {
    inputType: "prompt" as const,
    finalProfile,
    contextSummary,
  });
  return {
    finalProfile,
    contextSummary,
    displayText: normalizedPrompt,
    businessUrl: tryExtractUrlFromPrompt(normalizedPrompt),
    jobDebug: {
      inputType: "prompt",
      rawInput: rawInput.trim(),
      normalizedUrl: null,
      metadataExtracted: null,
      enrichedProfile: profileToDebugRecord(enriched),
      finalProfile: profileToDebugRecord(finalProfile),
      contextSummary,
    },
  };
}

async function loadAccessibleWorkspace(workspaceId: string) {
  const admin = createWorkspaceAdminClient();
  const { data: workspace, error } = await admin
    .schema("public")
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .single();
  if (error || !workspace) return { workspace: null, error: "Workspace not found." };

  const access = await resolveWorkspaceAccessContext(workspace as { user_id: string | null; anon_token_hash: string | null; });
  if (!access.allowed) return { workspace: null, error: "Access denied." };

  return { workspace, error: null, currentUserId: access.currentUserId, admin };
}

export async function createWorkspaceFromPrompt(
  rawInput: string,
  options?: HomepageSubmitOptions
): Promise<{ workspaceId: string | null; error: string | null }> {
  const inputType = options?.inputType ?? "prompt";
  console.log("URL SUBMIT START", { input: rawInput, inputType, entry: "createWorkspaceFromPrompt" });

  let pack: Awaited<ReturnType<typeof resolveHomepageInputToProfile>>;
  try {
    pack = await resolveHomepageInputToProfile(rawInput, inputType);
  } catch (e) {
    return {
      workspaceId: null,
      error: e instanceof Error ? e.message : "Could not prepare input.",
    };
  }

  const token = await ensureWorkspaceToken();
  const tokenHash = hashWorkspaceToken(token);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createWorkspaceAdminClient();
  const nowIso = new Date().toISOString();
  const sessionId =
    typeof options?.sessionId === "string" ? options.sessionId.trim() : "";

  const { data: workspace, error: workspaceError } = await admin
    .schema("public")
    .from("workspaces")
    .insert({
      user_id: user?.id ?? null,
      anon_token_hash: tokenHash,
      session_id: sessionId || null,
      initial_prompt: pack.displayText,
      business_url: pack.businessUrl,
      business_summary: pack.displayText,
      detected_content_type: "meme",
      status: "active",
      preview_generations_used: 0,
      last_message_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .single();

  if (workspaceError || !workspace) {
    return {
      workspaceId: null,
      error: workspaceError?.message ?? "Failed to create workspace.",
    };
  }

  const workspaceId = String(workspace.id);

  await persistWorkspaceBusinessProfile(workspaceId, null, pack.finalProfile, {
    businessSummaryOverride: pack.contextSummary,
  });

  const resolvedOutputFormat =
    options?.preferredOutputFormat ??
    resolveWorkspaceOutputFormat({
      prompt: pack.contextSummary,
      businessUrl: pack.businessUrl ?? "",
    });
  const templateFamilyPreference = options?.templateFamilyPreference ?? null;

  const { data: firstMessage } = await admin
    .schema("public")
    .from("workspace_messages")
    .insert({
      workspace_id: workspaceId,
      role: "user",
      message_type: "text",
      content: { text: pack.displayText } as Json,
      metadata: {} as Json,
    })
    .select("id")
    .single();

  const sourceMeta = inputType === "url" ? "homepage_url" : "homepage_prompt";

  console.log("BEFORE JOB CREATE", {
    entry: "createWorkspaceFromPrompt",
    finalProfile: pack.finalProfile,
    contextSummary: pack.contextSummary,
  });

  const generationPlan = buildWorkspaceGenerationPlan({
    workspaceId,
    prompt: pack.contextSummary,
    requestedByUserId: user?.id ?? null,
    triggerMessageId: firstMessage?.id ?? null,
    outputFormat: resolvedOutputFormat,
    requestedVariantCount: 1,
    metadata: mergeDebugIntoMetadata(
      {
        workflow_mode: "single_output",
        output_format: resolvedOutputFormat,
        selection_strategy:
          resolvedOutputFormat === "square_text"
            ? "square_text_open_variant"
            : "random_template",
        selected_template_id: null,
        selected_template_slug: null,
        based_on_job_id: null,
        based_on_output_ids: [],
        deferred_followup: false,
        explicit_promo_intent: false,
        promo_context_excerpt: null,
        workspace_context_summary: pack.contextSummary,
        template_family_preference: templateFamilyPreference,
        source: sourceMeta,
      },
      pack.jobDebug
    ) as Json,
  });
  const initialQueued = await enqueueGenerationJob({
    workspaceId: generationPlan.workspaceId,
    prompt: generationPlan.prompt,
    requestedByUserId: generationPlan.requestedByUserId ?? null,
    triggerMessageId: generationPlan.triggerMessageId ?? null,
    outputFormat: generationPlan.outputFormat,
    requestedVariantCount: generationPlan.requestedVariantCount,
    metadata: generationPlan.metadata as Json,
  });
  if (initialQueued.error || !initialQueued.jobId) {
    return {
      workspaceId,
      error: initialQueued.error ?? "Failed to queue or run generation.",
    };
  }
  return { workspaceId, error: null };
}

async function queueAuthenticatedHomepageFromUrl(
  userId: string,
  rawInput: string,
  options?: HomepageSubmitOptions
): Promise<{ workspaceId: string | null; error: string | null }> {
  console.log("URL SUBMIT START", {
    input: rawInput,
    inputType: "url" as const,
    entry: "queueAuthenticatedHomepageFromUrl",
  });
  let pack: Awaited<ReturnType<typeof resolveHomepageInputToProfile>>;
  try {
    pack = await resolveHomepageInputToProfile(rawInput, "url");
  } catch (e) {
    return {
      workspaceId: null,
      error: e instanceof Error ? e.message : "Could not process URL.",
    };
  }

  const workspaceId = await getOrCreateDefaultWorkspaceForUser(
    userId,
    options?.sessionId ?? null
  );
  const admin = createWorkspaceAdminClient();

  const { data: wsRow, error: wsErr } = await admin
    .schema("public")
    .from("workspaces")
    .select("metadata, business_url")
    .eq("id", workspaceId)
    .single();

  if (wsErr || !wsRow) {
    return { workspaceId: null, error: "Workspace not found." };
  }

  const { data: activeJob } = await admin
    .schema("public")
    .from("generation_jobs")
    .select("id")
    .eq("workspace_id", workspaceId)
    .in("status", ["queued", "running"])
    .limit(1)
    .maybeSingle();

  if (activeJob?.id) {
    return {
      workspaceId: null,
      error: "A generation is already in progress. Wait for it to finish.",
    };
  }

  await persistWorkspaceBusinessProfile(
    workspaceId,
    wsRow.metadata ?? {},
    pack.finalProfile,
    { businessSummaryOverride: pack.contextSummary }
  );

  await admin
    .schema("public")
    .from("workspaces")
    .update({
      business_url: pack.displayText,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workspaceId);

  const nowIso = new Date().toISOString();
  const { data: firstMessage } = await admin
    .schema("public")
    .from("workspace_messages")
    .insert({
      workspace_id: workspaceId,
      role: "user",
      message_type: "text",
      content: { text: pack.displayText } as Json,
      metadata: {} as Json,
    })
    .select("id")
    .single();

  await admin
    .schema("public")
    .from("workspaces")
    .update({
      last_message_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", workspaceId);

  const resolvedOutputFormat =
    options?.preferredOutputFormat ??
    resolveWorkspaceOutputFormat({
      prompt: pack.contextSummary,
      businessUrl: pack.displayText,
    });
  const templateFamilyPreference = options?.templateFamilyPreference ?? null;

  console.log("BEFORE JOB CREATE", {
    entry: "queueAuthenticatedHomepageFromUrl",
    finalProfile: pack.finalProfile,
    contextSummary: pack.contextSummary,
  });

  const generationPlan = buildWorkspaceGenerationPlan({
    workspaceId,
    prompt: pack.contextSummary,
    requestedByUserId: userId,
    triggerMessageId: firstMessage?.id ?? null,
    outputFormat: resolvedOutputFormat,
    requestedVariantCount: 1,
    metadata: mergeDebugIntoMetadata(
      {
        workflow_mode: "single_output",
        output_format: resolvedOutputFormat,
        selection_strategy:
          resolvedOutputFormat === "square_text"
            ? "square_text_open_variant"
            : "random_template",
        selected_template_id: null,
        selected_template_slug: null,
        based_on_job_id: null,
        based_on_output_ids: [],
        deferred_followup: false,
        explicit_promo_intent: false,
        promo_context_excerpt: null,
        workspace_context_summary: pack.contextSummary,
        template_family_preference: templateFamilyPreference,
        source: "homepage_url",
      },
      pack.jobDebug
    ) as Json,
  });

  const initialQueued = await enqueueGenerationJob({
    workspaceId: generationPlan.workspaceId,
    prompt: generationPlan.prompt,
    requestedByUserId: generationPlan.requestedByUserId ?? null,
    triggerMessageId: generationPlan.triggerMessageId ?? null,
    outputFormat: generationPlan.outputFormat,
    requestedVariantCount: generationPlan.requestedVariantCount,
    metadata: generationPlan.metadata as Json,
  });

  if (initialQueued.error || !initialQueued.jobId) {
    return {
      workspaceId: null,
      error: initialQueued.error ?? "Failed to queue generation.",
    };
  }

  return { workspaceId, error: null };
}

export async function submitHomepagePrompt(
  input: string,
  options?: HomepageSubmitOptions
): Promise<{ workspaceId: string | null; error: string | null }> {
  console.log("URL SUBMIT START", {
    input,
    inputType: options?.inputType ?? "prompt",
    entry: "submitHomepagePrompt",
  });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return createWorkspaceFromPrompt(input, options);
  }

  const inputType = options?.inputType ?? "prompt";
  if (inputType === "url") {
    return queueAuthenticatedHomepageFromUrl(user.id, input, options);
  }

  const workspaceId = await getOrCreateDefaultWorkspaceForUser(
    user.id,
    options?.sessionId ?? null
  );
  const sent = await sendWorkspaceMessage(workspaceId, input, {
    preferredOutputFormat: options?.preferredOutputFormat,
    templateFamilyPreference: options?.templateFamilyPreference ?? null,
  });

  if (sent.error) {
    return { workspaceId: null, error: sent.error };
  }

  return { workspaceId, error: null };
}

/** First non-empty workspace field for implicit /api/workspace/new-idea kickoff (no body text). */
export async function getImplicitNewIdeaText(
  workspaceId: string
): Promise<{ text: string | null; error: string | null }> {
  const loaded = await loadAccessibleWorkspace(workspaceId);
  if (!loaded.workspace || !loaded.admin) {
    return { text: null, error: loaded.error ?? "Workspace not found." };
  }
  const w = loaded.workspace as Record<string, unknown>;
  const candidates = [
    String(w.initial_prompt ?? "").trim(),
    String(w.business_summary ?? "").trim(),
    String(w.business_url ?? "").trim(),
  ].filter(Boolean);
  return { text: candidates[0] ?? null, error: null };
}

export async function processWorkspaceHomepageIntent(
  workspaceId: string,
  inputType: "prompt" | "url",
  value: string,
  options?: HomepageIntentOptions
): Promise<{ error: string | null }> {
  console.log("[intent] starting generation", { workspaceId, inputType });
  console.log("[workspace] processing intent", {
    workspaceId,
    inputType,
  });

  const sweepAdmin = createWorkspaceAdminClient();
  await expireStaleGenerationJobs(sweepAdmin, workspaceId);

  if (inputType === "prompt") {
    const sent = await sendWorkspaceMessage(workspaceId, value, {
      preferredOutputFormat: options?.preferredOutputFormat,
      templateFamilyPreference: options?.templateFamilyPreference ?? null,
    });
    if (sent.error) {
      console.error("[intent] failure:", {
        reason: sent.error,
        context: {
          workspaceId,
          inputType: "prompt" as const,
          valuePreview: value.slice(0, 120),
        },
      });
    }
    return { error: sent.error ?? null };
  }

  let pack: Awaited<ReturnType<typeof resolveHomepageInputToProfile>>;
  try {
    pack = await resolveHomepageInputToProfile(value, "url");
  } catch (e) {
    const reason =
      e instanceof Error ? e.message : "Could not process URL.";
    console.error("[intent] failure:", {
      reason,
      context: {
        workspaceId,
        inputType: "url" as const,
        valuePreview: value.slice(0, 120),
        errorName: e instanceof Error ? e.name : typeof e,
      },
    });
    return {
      error: reason,
    };
  }

  const loaded = await loadAccessibleWorkspace(workspaceId);
  if (!loaded.workspace || !loaded.admin) {
    const reason = loaded.error ?? "Workspace not found.";
    console.error("[intent] failure:", {
      reason,
      context: {
        workspaceId,
        inputType: "url" as const,
        valuePreview: value.slice(0, 120),
        hasWorkspace: Boolean(loaded.workspace),
        hasAdmin: Boolean(loaded.admin),
        loadedError: loaded.error ?? null,
      },
    });
    return { error: reason };
  }

  const { admin, workspace, currentUserId = null } = loaded as {
    admin: ReturnType<typeof createWorkspaceAdminClient>;
    workspace: Record<string, unknown>;
    currentUserId?: string | null;
  };

  const { data: existingJob } = await admin
    .schema("public")
    .from("generation_jobs")
    .select("id, status, created_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "running")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const isRunning = existingJob?.status === "running";
  const createdAtMs = existingJob?.created_at
    ? new Date(String(existingJob.created_at)).getTime()
    : 0;
  const isStale =
    Boolean(existingJob) && Date.now() - createdAtMs > 60_000;

  if (isRunning && !isStale) {
    console.warn("[intent] blocking due to active running job");
    console.error("[intent] failure:", {
      reason: "A generation job is already running",
      context: {
        workspaceId,
        inputType: "url" as const,
        valuePreview: value.slice(0, 120),
        activeJobId: existingJob?.id ?? null,
      },
    });
    return { error: "A generation job is already running" };
  }

  if (isStale && existingJob) {
    console.warn("[intent] stale job detected, ignoring");
  }

  await persistWorkspaceBusinessProfile(
    workspaceId,
    (workspace.metadata as Record<string, unknown> | null) ?? {},
    pack.finalProfile,
    { businessSummaryOverride: pack.contextSummary }
  );

  const nowIso = new Date().toISOString();
  await admin
    .schema("public")
    .from("workspaces")
    .update({
      business_url: pack.displayText,
      last_message_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", workspaceId);

  const { data: firstMessage } = await admin
    .schema("public")
    .from("workspace_messages")
    .insert({
      workspace_id: workspaceId,
      role: "user",
      message_type: "text",
      content: { text: pack.displayText } as Json,
      metadata: {} as Json,
    })
    .select("id")
    .single();

  const resolvedOutputFormat =
    options?.preferredOutputFormat ??
    resolveWorkspaceOutputFormat({
      prompt: pack.contextSummary,
      businessUrl: pack.displayText,
    });

  const generationPlan = buildWorkspaceGenerationPlan({
    workspaceId,
    prompt: pack.contextSummary,
    requestedByUserId: currentUserId,
    triggerMessageId: firstMessage?.id ?? null,
    outputFormat: resolvedOutputFormat,
    requestedVariantCount: 1,
    metadata: mergeDebugIntoMetadata(
      {
        workflow_mode: "single_output",
        output_format: resolvedOutputFormat,
        selection_strategy:
          resolvedOutputFormat === "square_text"
            ? "square_text_open_variant"
            : "random_template",
        selected_template_id: null,
        selected_template_slug: null,
        based_on_job_id: null,
        based_on_output_ids: [],
        deferred_followup: false,
        explicit_promo_intent: false,
        promo_context_excerpt: null,
        workspace_context_summary: pack.contextSummary,
        template_family_preference: options?.templateFamilyPreference ?? null,
        source: "homepage_url",
      },
      pack.jobDebug
    ) as Json,
  });

  const queued = await enqueueGenerationJob({
    workspaceId: generationPlan.workspaceId,
    prompt: generationPlan.prompt,
    requestedByUserId: generationPlan.requestedByUserId ?? null,
    triggerMessageId: generationPlan.triggerMessageId ?? null,
    outputFormat: generationPlan.outputFormat,
    requestedVariantCount: generationPlan.requestedVariantCount,
    metadata: generationPlan.metadata as Json,
  });

  if (queued.error || !queued.jobId) {
    const reason = queued.error ?? "Failed to queue generation.";
    console.error("[intent] failure:", {
      reason,
      context: {
        workspaceId,
        inputType: "url" as const,
        valuePreview: value.slice(0, 120),
        queuedJobId: queued.jobId ?? null,
        queuedError: queued.error ?? null,
      },
    });
    return { error: reason };
  }

  return { error: null };
}

export async function getWorkspaceState(
  workspaceId: string
): Promise<{ state: WorkspaceState | null; error: string | null }> {
  const loaded = await loadAccessibleWorkspace(workspaceId);
  if (!loaded.workspace || !loaded.admin) {
    return { state: null, error: loaded.error ?? "Workspace not found." };
  }
  const { admin, workspace, currentUserId = null } = loaded as {
    admin: ReturnType<typeof createWorkspaceAdminClient>;
    workspace: any;
    currentUserId?: string | null;
  };

  const entitlementUserId =
    currentUserId || (typeof workspace.user_id === "string" ? workspace.user_id : null);
  const activeEntitlement = entitlementUserId
    ? await getActiveEntitlement(entitlementUserId)
    : null;
  const currentPlan: "free_preview" | "starter_pack" | "unlimited" =
    activeEntitlement?.plan_code === "starter_pack"
      ? "starter_pack"
      : activeEntitlement?.plan_code === "unlimited"
        ? "unlimited"
        : "free_preview";

  const { data: messages } = await admin
    .schema("public")
    .from("workspace_messages")
    .select("id, role, message_type, content, metadata, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })
    .limit(200);

  const { data: jobs } = await admin
    .schema("public")
    .from("generation_jobs")
    .select(
      "id, status, block_reason, prompt, output_format, error_message, metadata, created_at, completed_at"
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(1);

  let latestJob = (jobs?.[0] as WorkspaceJob | undefined) ?? null;
  let outputs: WorkspaceOutput[] = [];

  const { data: completedJobs } = await admin
    .schema("public")
    .from("generation_jobs")
    .select("id, created_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "completed")
    .order("created_at", { ascending: true });

  const completedJobIds = (completedJobs ?? []).map((job: any) => String(job.id));
  if (completedJobIds.length > 0) {
    const jobOrder = new Map<string, number>();
    completedJobIds.forEach((jobId, index) => {
      jobOrder.set(jobId, index);
    });

    const { data: mappedOutputs } = await admin
      .schema("public")
      .from("generation_job_outputs")
      .select(
        "generation_job_id, output_order, generated_memes(id, image_url, title, top_text, bottom_text, post_caption, format, variant_metadata, created_at)"
      )
      .in("generation_job_id", completedJobIds);

    const sortedRows = (mappedOutputs ?? []).sort((a: any, b: any) => {
      const aJob = String(a.generation_job_id ?? "");
      const bJob = String(b.generation_job_id ?? "");
      const aJobOrder = jobOrder.get(aJob) ?? Number.MAX_SAFE_INTEGER;
      const bJobOrder = jobOrder.get(bJob) ?? Number.MAX_SAFE_INTEGER;
      if (aJobOrder !== bJobOrder) return aJobOrder - bJobOrder;
      return Number(a.output_order ?? 0) - Number(b.output_order ?? 0);
    });

    const seen = new Set<string>();
    outputs = sortedRows
      .map((row: any) => row.generated_memes as WorkspaceOutput | null)
      .filter((output): output is WorkspaceOutput => Boolean(output?.id))
      .filter((output) => {
        if (seen.has(output.id)) return false;
        seen.add(output.id);
        return true;
      })
      .map((output) => ({ ...output, is_pinned: false }));
  }

  const { data: pinRows } = await admin
    .schema("public")
    .from("workspace_output_pins")
    .select("generated_meme_id, pinned_at")
    .eq("workspace_id", workspaceId)
    .order("pinned_at", { ascending: true });
  const pinnedIdsOrdered = (pinRows ?? [])
    .map((row: any) => String(row.generated_meme_id ?? "").trim())
    .filter(Boolean);
  const pinnedIdSet = new Set(pinnedIdsOrdered);
  const pinnedOrderMap = new Map<string, number>();
  pinnedIdsOrdered.forEach((id, index) => pinnedOrderMap.set(id, index));

  outputs = outputs
    .map((output) => ({
      ...output,
      is_pinned: pinnedIdSet.has(output.id),
    }))
    .sort((a, b) => {
      if (a.is_pinned && b.is_pinned) {
        return (pinnedOrderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (pinnedOrderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER);
      }
      if (a.is_pinned) return -1;
      if (b.is_pinned) return 1;
      return 0;
    });

  const gateState: "anonymous_blocked" | "authenticated_plan_required" | "unlocked" =
    "unlocked";

  return {
    state: {
      workspace: {
        id: String(workspace.id),
        user_id: (workspace.user_id as string | null) ?? null,
        linked_at: (workspace.linked_at as string | null) ?? null,
        gate_state: gateState,
        status: String(workspace.status ?? "active"),
        initial_prompt: String(workspace.initial_prompt ?? ""),
        preview_generations_used: Number(workspace.preview_generations_used ?? 0),
        current_plan: currentPlan,
        created_at: String(workspace.created_at),
      },
      messages: (messages ?? []) as WorkspaceMessage[],
      latestJob,
      outputs,
    },
    error: null,
  };
}

export async function pinWorkspaceOutput(
  workspaceId: string,
  outputId: string
): Promise<{ error: string | null }> {
  const normalizedOutputId = String(outputId ?? "").trim();
  if (!normalizedOutputId) return { error: "Invalid output." };

  const loaded = await loadAccessibleWorkspace(workspaceId);
  if (!loaded.workspace || !loaded.admin) {
    return { error: loaded.error ?? "Workspace not found." };
  }
  const { admin } = loaded as {
    admin: ReturnType<typeof createWorkspaceAdminClient>;
  };

  const { data: existingPin } = await admin
    .schema("public")
    .from("workspace_output_pins")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("generated_meme_id", normalizedOutputId)
    .maybeSingle();
  if (existingPin?.id) return { error: null };

  const { data: currentPins } = await admin
    .schema("public")
    .from("workspace_output_pins")
    .select("id")
    .eq("workspace_id", workspaceId)
    .order("pinned_at", { ascending: true });
  if ((currentPins ?? []).length >= 3) {
    return { error: "You can pin up to 3 templates." };
  }

  const { data: workspaceJobs } = await admin
    .schema("public")
    .from("generation_jobs")
    .select("id")
    .eq("workspace_id", workspaceId)
    .limit(500);
  const workspaceJobIds = (workspaceJobs ?? [])
    .map((job: any) => String(job.id ?? "").trim())
    .filter(Boolean);
  if (workspaceJobIds.length === 0) return { error: "Output not found in this workspace." };

  const { data: mappedOutput } = await admin
    .schema("public")
    .from("generation_job_outputs")
    .select("generated_meme_id")
    .eq("generated_meme_id", normalizedOutputId)
    .in("generation_job_id", workspaceJobIds)
    .limit(1)
    .maybeSingle();
  if (!mappedOutput?.generated_meme_id) {
    return { error: "Output not found in this workspace." };
  }

  const { error: pinError } = await admin
    .schema("public")
    .from("workspace_output_pins")
    .insert({
      workspace_id: workspaceId,
      generated_meme_id: normalizedOutputId,
      pinned_at: new Date().toISOString(),
    });
  if (pinError?.code === "23505") return { error: null };
  if (pinError) return { error: pinError.message };

  return { error: null };
}

export async function unpinWorkspaceOutput(
  workspaceId: string,
  outputId: string
): Promise<{ error: string | null }> {
  const normalizedOutputId = String(outputId ?? "").trim();
  if (!normalizedOutputId) return { error: "Invalid output." };

  const loaded = await loadAccessibleWorkspace(workspaceId);
  if (!loaded.workspace || !loaded.admin) {
    return { error: loaded.error ?? "Workspace not found." };
  }
  const { admin } = loaded as {
    admin: ReturnType<typeof createWorkspaceAdminClient>;
  };

  const { error } = await admin
    .schema("public")
    .from("workspace_output_pins")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("generated_meme_id", normalizedOutputId);

  return { error: error?.message ?? null };
}

function parseStorageObjectFromPublicUrl(
  value: string
): { bucket: string; objectPath: string } | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const marker = "/storage/v1/object/public/";
  const markerIndex = trimmed.indexOf(marker);
  if (markerIndex < 0) return null;
  const rawPath = trimmed.slice(markerIndex + marker.length);
  const slashIndex = rawPath.indexOf("/");
  if (slashIndex <= 0) return null;
  const bucket = rawPath.slice(0, slashIndex).trim();
  const objectPath = rawPath.slice(slashIndex + 1).trim();
  if (!bucket || !objectPath) return null;
  return { bucket, objectPath };
}

export async function updateWorkspaceEngagementOutputStyle(
  workspaceId: string,
  generatedMemeId: string,
  style: EngagementVisualStyle
): Promise<{
  error: string | null;
  image_url?: string | null;
  variant_metadata?: Record<string, unknown> | null;
}> {
  const normalizedId = String(generatedMemeId ?? "").trim();
  if (!normalizedId) return { error: "Invalid output." };

  const loaded = await loadAccessibleWorkspace(workspaceId);
  if (!loaded.workspace || !loaded.admin) {
    return { error: loaded.error ?? "Workspace not found." };
  }
  const { admin } = loaded as {
    admin: ReturnType<typeof createWorkspaceAdminClient>;
  };

  const { data: workspaceJobs } = await admin
    .schema("public")
    .from("generation_jobs")
    .select("id")
    .eq("workspace_id", workspaceId)
    .limit(500);
  const workspaceJobIds = (workspaceJobs ?? [])
    .map((job: { id?: unknown }) => String(job.id ?? "").trim())
    .filter(Boolean);
  if (workspaceJobIds.length === 0) {
    return { error: "Output not found in this workspace." };
  }

  const { data: mappedOutput } = await admin
    .schema("public")
    .from("generation_job_outputs")
    .select("generated_meme_id")
    .eq("generated_meme_id", normalizedId)
    .in("generation_job_id", workspaceJobIds)
    .limit(1)
    .maybeSingle();
  if (!mappedOutput?.generated_meme_id) {
    return { error: "Output not found in this workspace." };
  }

  const { data: memeRow, error: memeError } = await admin
    .schema("public")
    .from("generated_memes")
    .select("id, template_id, top_text, bottom_text, variant_metadata, image_url")
    .eq("id", normalizedId)
    .maybeSingle();

  if (memeError || !memeRow?.id) {
    return { error: memeError?.message ?? "Output no longer exists." };
  }

  const meme = memeRow as {
    template_id?: unknown;
    top_text?: unknown;
    bottom_text?: unknown;
    variant_metadata?: unknown;
    image_url?: unknown;
  };

  const templateId = String(meme.template_id ?? "").trim();
  if (!templateId) return { error: "Missing template for this output." };

  const { data: templateRow, error: templateError } = await admin
    .schema("public")
    .from("meme_templates")
    .select("*")
    .eq("template_id", templateId)
    .maybeSingle();

  if (templateError || !templateRow) {
    return { error: templateError?.message ?? "Template not found." };
  }

  const t = templateRow as Record<string, unknown>;
  const templateFamily = String(t.template_family ?? "").trim();
  if (templateFamily !== "engagement_text" && templateFamily !== "square_text") {
    return { error: "This output does not support style toggling." };
  }

  const meta =
    meme.variant_metadata && typeof meme.variant_metadata === "object"
      ? ({ ...(meme.variant_metadata as Record<string, unknown>) } as Record<
          string,
          unknown
        >)
      : {};

  const layoutKey = String(t.text_layout_type ?? "")
    .trim()
    .toLowerCase();
  const namesRaw = meta.engagement_names;
  const names = Array.isArray(namesRaw)
    ? namesRaw.map((n) => String(n ?? "").trim()).filter(Boolean)
    : undefined;

  if (layoutKey === "birthday_names_list") {
    if (!names || names.length !== 24) {
      return { error: "Birthday engagement output is missing name data." };
    }
  }

  const template = mapMemeTemplateRowForRender(t);
  const engagedStyle = coerceEngagementVisualStyle(style);

  let png: Buffer;
  try {
    if (templateFamily === "engagement_text") {
      png = await renderEngagementTextMemePng({
        template,
        keyword: String(meme.top_text ?? ""),
        topText: String(meme.top_text ?? ""),
        bottomText:
          meme.bottom_text == null || meme.bottom_text === ""
            ? null
            : String(meme.bottom_text),
        names: layoutKey === "birthday_names_list" ? names : undefined,
        engagementStyle: engagedStyle,
      });
    } else {
      png = await renderSquareTextMemePng({
        topText: String(meme.top_text ?? ""),
        bottomText:
          meme.bottom_text == null || meme.bottom_text === ""
            ? null
            : String(meme.bottom_text),
        slot1MaxLines:
          typeof t.slot_1_max_lines === "number"
            ? Math.max(1, Math.floor(t.slot_1_max_lines))
            : 8,
        slot2MaxLines:
          typeof t.slot_2_max_lines === "number"
            ? Math.max(0, Math.floor(t.slot_2_max_lines))
            : 4,
        engagementStyle: engagedStyle,
      });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Render failed";
    return { error: message };
  }

  const generatedMemeBucket =
    process.env.MEME_GENERATED_MEMES_BUCKET ?? "generated-memes";
  const objectPath = `generated_memes/${workspaceId}/${templateId}/${randomUUID()}.png`;

  const oldUrl = String(meme.image_url ?? "").trim();
  const oldObject = parseStorageObjectFromPublicUrl(oldUrl);

  const { error: uploadError } = await admin.storage
    .from(generatedMemeBucket)
    .upload(objectPath, png, {
      contentType: "image/png",
      upsert: true,
    });

  if (uploadError) {
    return { error: uploadError.message ?? "Upload failed." };
  }

  const { data: publicRef } = admin.storage
    .from(generatedMemeBucket)
    .getPublicUrl(objectPath);
  const publicUrl = publicRef.publicUrl ?? null;
  if (!publicUrl) {
    return { error: "Could not resolve public URL for upload." };
  }

  const nextMeta: Record<string, unknown> = {
    ...meta,
    engagement_style: engagedStyle,
    content_template_family: templateFamily,
  };

  const { error: updateError } = await admin
    .schema("public")
    .from("generated_memes")
    .update({
      image_url: publicUrl,
      variant_metadata: nextMeta as Json,
    })
    .eq("id", normalizedId);

  if (updateError) {
    return { error: updateError.message ?? "Failed to update output." };
  }

  if (oldObject) {
    await admin.storage.from(oldObject.bucket).remove([oldObject.objectPath]);
  }

  return {
    error: null,
    image_url: publicUrl,
    variant_metadata: nextMeta,
  };
}

export async function deleteWorkspaceOutput(
  workspaceId: string,
  outputId: string
): Promise<{ error: string | null }> {
  const normalizedOutputId = String(outputId ?? "").trim();
  if (!normalizedOutputId) return { error: "Invalid output." };

  const loaded = await loadAccessibleWorkspace(workspaceId);
  if (!loaded.workspace || !loaded.admin) {
    return { error: loaded.error ?? "Workspace not found." };
  }
  const { admin } = loaded as {
    admin: ReturnType<typeof createWorkspaceAdminClient>;
  };

  const { data: workspaceJobs } = await admin
    .schema("public")
    .from("generation_jobs")
    .select("id")
    .eq("workspace_id", workspaceId)
    .limit(500);
  const workspaceJobIds = (workspaceJobs ?? [])
    .map((job: any) => String(job.id ?? "").trim())
    .filter(Boolean);
  if (workspaceJobIds.length === 0) return { error: "Output not found in this workspace." };

  const { data: mappedOutput } = await admin
    .schema("public")
    .from("generation_job_outputs")
    .select("generated_meme_id")
    .eq("generated_meme_id", normalizedOutputId)
    .in("generation_job_id", workspaceJobIds)
    .limit(1)
    .maybeSingle();
  if (!mappedOutput?.generated_meme_id) {
    return { error: "Output not found in this workspace." };
  }

  const { data: memeRow } = await admin
    .schema("public")
    .from("generated_memes")
    .select("id, image_url")
    .eq("id", normalizedOutputId)
    .maybeSingle();
  if (!memeRow?.id) return { error: "Output no longer exists." };

  const imageUrl = String((memeRow as any).image_url ?? "").trim();
  const storageObject = parseStorageObjectFromPublicUrl(imageUrl);
  if (storageObject) {
    await admin.storage
      .from(storageObject.bucket)
      .remove([storageObject.objectPath]);
  }

  const { error: deleteError } = await admin
    .schema("public")
    .from("generated_memes")
    .delete()
    .eq("id", normalizedOutputId);

  return { error: deleteError?.message ?? null };
}

export async function startGenerationIfQueued(
  workspaceId: string
): Promise<{ started: boolean; error: string | null }> {
  const loaded = await loadAccessibleWorkspace(workspaceId);
  if (!loaded.workspace || !loaded.admin) {
    return { started: false, error: loaded.error ?? "Workspace not found." };
  }

  const { admin } = loaded;
  const { data: queued } = await admin
    .schema("public")
    .from("generation_jobs")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("status", "queued")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!queued?.id) return { started: false, error: null };
  await runGenerationJob(String(queued.id));
  return { started: true, error: null };
}

export async function sendWorkspaceMessage(
  workspaceId: string,
  prompt: string,
  options?: HomepageSubmitOptions
): Promise<{ state: WorkspaceState | null; error: string | null }> {
  const normalizedPrompt = normalizePrompt(prompt);
  if (!normalizedPrompt) return { state: null, error: "Prompt is required." };

  const loaded = await loadAccessibleWorkspace(workspaceId);
  if (!loaded.workspace || !loaded.admin) {
    return { state: null, error: loaded.error ?? "Workspace not found." };
  }

  const { workspace, admin, currentUserId = null } = loaded as {
    workspace: any;
    admin: ReturnType<typeof createWorkspaceAdminClient>;
    currentUserId?: string | null;
  };
  const resetContextTurn = Boolean(options?.resetContext);

  const { data: userMessage } = await admin
    .schema("public")
    .from("workspace_messages")
    .insert({
      workspace_id: workspaceId,
      role: "user",
      message_type: "text",
      content: { text: normalizedPrompt } as Json,
      metadata: {} as Json,
    })
    .select("id")
    .single();

  await admin
    .schema("public")
    .from("workspaces")
    .update({
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", workspaceId);

  const workingWorkspace: Record<string, unknown> = { ...workspace };
  let profileForSummary = parseBusinessProfileFromWorkspaceRow(
    workingWorkspace as { metadata?: unknown }
  );
  if (
    (resetContextTurn || !profileForSummary) &&
    normalizedPrompt.length >= 8
  ) {
    profileForSummary = await resolveBusinessProfileFromUserText(normalizedPrompt);
    await persistWorkspaceBusinessProfile(
      workspaceId,
      workingWorkspace.metadata,
      profileForSummary
    );
    workingWorkspace.metadata = mergeWorkspaceMetadataWithBusinessProfile(
      workingWorkspace.metadata,
      profileForSummary
    );
    workingWorkspace.business_summary = profileForSummary.businessName;
  }
  console.log({
    businessProfile: profileForSummary,
    usingEnrichedContext: Boolean(
      profileForSummary && isValidBusinessProfile(profileForSummary)
    ),
  });

  const previewUsed = Number(workspace.preview_generations_used ?? 0);

  const { data: recentMessagesRaw } = await admin
    .schema("public")
    .from("workspace_messages")
    .select("role, message_type, content")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(10);
  const recentMessages = [...(recentMessagesRaw ?? [])].reverse() as Array<{
    role: "user" | "assistant" | "system";
    message_type: "text" | "status" | "generation_result" | "gate_notice";
    content: Record<string, unknown>;
  }>;

  const { data: latestJobRow } = await admin
    .schema("public")
    .from("generation_jobs")
    .select("id, status, prompt, output_format, metadata")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let hasLatestCompletedOutputs = false;
  if (latestJobRow?.id && latestJobRow.status === "completed") {
    const { data: outputProbe } = await admin
      .schema("public")
      .from("generation_job_outputs")
      .select("id")
      .eq("generation_job_id", latestJobRow.id)
      .limit(1);
    hasLatestCompletedOutputs = (outputProbe ?? []).length > 0;
  }

  const plan = interpretWorkspaceMessage({
    userMessage: normalizedPrompt,
    recentMessages,
    latestJob: latestJobRow
      ? {
          prompt: String(latestJobRow.prompt ?? ""),
          output_format:
            latestJobRow.output_format === "square_image" ||
            latestJobRow.output_format === "square_video" ||
            latestJobRow.output_format === "vertical_slideshow" ||
            latestJobRow.output_format === "square_text"
              ? latestJobRow.output_format
              : null,
          status: latestJobRow.status as
            | "queued"
            | "running"
            | "completed"
            | "failed"
            | "blocked_auth"
            | "blocked_payment"
            | "cancelled",
          template_family_preference:
            latestJobRow.metadata && typeof latestJobRow.metadata === "object"
              ? (latestJobRow.metadata.template_family_preference as
                  | "engagement_text"
                  | null
                  | undefined) ?? null
              : null,
        }
      : null,
    hasLatestCompletedOutputs,
    workspace: {
      initial_prompt: String(workingWorkspace.initial_prompt ?? ""),
      business_url: workingWorkspace.business_url
        ? String(workingWorkspace.business_url)
        : null,
      business_summary: workingWorkspace.business_summary
        ? String(workingWorkspace.business_summary)
        : null,
      preview_generations_used: previewUsed,
    },
    resetContext: resetContextTurn,
  });

  const resolvedPrompt = plan.prompt_for_generation?.trim() || normalizedPrompt;
  const jobContextSummary = workspaceContextSummaryForJob(
    resetContextTurn,
    profileForSummary,
    workingWorkspace as { business_summary?: unknown; initial_prompt?: unknown }
  );
  const resolvedTemplateFamilyPreference =
    options?.templateFamilyPreference === "engagement_text"
      ? "engagement_text"
      : plan.template_family_preference ?? null;
  const resolvedOutputFormat =
    options?.preferredOutputFormat ??
    plan.output_format ??
    resolveWorkspaceOutputFormat({
      prompt: resolvedPrompt,
      businessUrl: String(workspace.business_url ?? ""),
    });
  const requestedVariantCount = 1;

  console.log("[workspace-intent]", {
    workspaceId,
    intent: plan.intent,
    shouldGenerate: plan.should_generate,
    confidence: plan.confidence,
    outputFormat: resolvedOutputFormat,
    variantCount: requestedVariantCount,
    relationToPreviousJob: plan.relation_to_previous_job,
    explicitPromoIntent: plan.explicit_promo_intent,
    resetContext: resetContextTurn,
    resolvedPromptPreview: resolvedPrompt.slice(0, 220),
  });

  await admin.schema("public").from("workspace_messages").insert({
    workspace_id: workspaceId,
    role: "assistant",
    message_type: "text",
    content: { text: plan.assistant_response } as Json,
    metadata: {
      intent: plan.intent,
      confidence: plan.confidence,
      relation_to_previous_job: plan.relation_to_previous_job,
      explicit_promo_intent: plan.explicit_promo_intent,
      promo_context_excerpt: plan.promo_context_excerpt ?? null,
      ui_pills: plan.ui_pills ?? [],
      suggested_formats: plan.suggested_formats ?? [],
      suggested_actions: plan.suggested_actions ?? [],
    } as Json,
  });

  const { data: inflightAfterInterpret } = await admin
    .schema("public")
    .from("generation_jobs")
    .select("id")
    .eq("workspace_id", workspaceId)
    .in("status", ["queued", "running"])
    .limit(1);
  const hasActiveGeneration = (inflightAfterInterpret ?? []).length > 0;

  if (!plan.should_generate) {
    return getWorkspaceState(workspaceId);
  }

  if (hasActiveGeneration) {
    const followupPayload = {
      prompt: resolvedPrompt,
      output_format: resolvedOutputFormat,
      template_family_preference: resolvedTemplateFamilyPreference,
      reset_context: resetContextTurn,
      requested_variant_count: requestedVariantCount,
      relation_to_previous_job: plan.relation_to_previous_job,
      trigger_message_id: userMessage?.id ?? null,
      deferred_from_intent: plan.intent,
      explicit_promo_intent: plan.explicit_promo_intent,
      promo_context_excerpt: plan.promo_context_excerpt ?? null,
      workspace_context_summary: jobContextSummary,
      based_on_job_id: resetContextTurn ? null : latestJobRow?.id ?? null,
      based_on_output_ids: [],
    } as Json;

    const { data: existingFollowup } = await admin
      .schema("public")
      .from("pending_actions")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("action_type", "followup_request")
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingFollowup?.id) {
      await admin
        .schema("public")
        .from("pending_actions")
        .update({ payload: followupPayload })
        .eq("id", existingFollowup.id);
    } else {
      await admin.schema("public").from("pending_actions").insert({
        workspace_id: workspaceId,
        action_type: "followup_request",
        payload: followupPayload,
      });
    }

    await admin.schema("public").from("workspace_messages").insert({
      workspace_id: workspaceId,
      role: "assistant",
      message_type: "status",
      content: {
        text:
          "Finishing this batch — applying that next.",
      } as Json,
      metadata: {
        reason: "active_generation_in_progress",
        deferred_intent: plan.intent,
        has_deferred_followup: true,
        ui_pills: [
          { label: "Image Meme", message: "Generate image memes for this idea", kind: "format" },
          { label: "Video Meme", message: "Turn this idea into video memes", kind: "format" },
          { label: "Text Meme", message: "Generate text memes for this idea", kind: "format" },
          { label: "Engagement post", message: "Turn this idea into an engagement post", kind: "format" },
        ],
      } as Json,
    });
    return getWorkspaceState(workspaceId);
  }

  await admin.schema("public").from("workspace_messages").insert({
    workspace_id: workspaceId,
    role: "assistant",
    message_type: "status",
    content: {
      text:
          "Generating a version now.",
    } as Json,
    metadata: {
      stage: "pre_enqueue_generation",
      output_format: resolvedOutputFormat,
      workflow_mode: "single_output",
      selection_strategy:
        resolvedOutputFormat === "square_text"
          ? "square_text_open_variant"
          : "random_template",
      plan: {
        workspaceId,
        intent: plan.intent,
        mode: "single_output",
        outputFormat: resolvedOutputFormat,
        promptForGeneration: resolvedPrompt,
        selectedTemplateSlug: null,
        selectionStrategy:
          resolvedOutputFormat === "square_text"
            ? "square_text_open_variant"
            : "random_template",
        basedOnJobId: latestJobRow?.id ?? null,
        basedOnOutputIds: [],
      },
    } as Json,
  });

  console.log("BEFORE JOB CREATE", {
    entry: "sendWorkspaceMessage",
    resolvedPrompt,
    jobContextSummary,
    profileForSummary,
  });

  const generationPlan = buildWorkspaceGenerationPlan({
    workspaceId,
    prompt: resolvedPrompt,
    requestedByUserId: currentUserId,
    triggerMessageId: userMessage?.id ?? null,
    outputFormat: resolvedOutputFormat,
    requestedVariantCount,
    metadata: mergeDebugIntoMetadata(
      {
        workflow_mode: "single_output",
        output_format: resolvedOutputFormat,
        selection_strategy:
          resolvedOutputFormat === "square_text"
            ? "square_text_open_variant"
            : "random_template",
        selected_template_id: null,
        selected_template_slug: null,
        based_on_job_id: resetContextTurn ? null : latestJobRow?.id ?? null,
        based_on_output_ids: [],
        deferred_followup: false,
        reset_context: resetContextTurn,
        source: "workspace_send_message",
        intent: plan.intent,
        template_family_preference: resolvedTemplateFamilyPreference,
        relation_to_previous_job: plan.relation_to_previous_job,
        explicit_promo_intent: plan.explicit_promo_intent,
        promo_context_excerpt: plan.promo_context_excerpt ?? null,
        workspace_context_summary: jobContextSummary,
      },
      {
        inputType: "workspace_message",
        rawInput: normalizedPrompt,
        normalizedUrl: null,
        metadataExtracted: null,
        enrichedProfile: profileToDebugRecord(profileForSummary),
        finalProfile: profileToDebugRecord(profileForSummary),
        contextSummary: jobContextSummary,
        resolvedPrompt,
        intent: plan.intent,
      }
    ) as Json,
  });
  const queued = await enqueueGenerationJob({
    workspaceId: generationPlan.workspaceId,
    prompt: generationPlan.prompt,
    requestedByUserId: generationPlan.requestedByUserId ?? null,
    triggerMessageId: generationPlan.triggerMessageId ?? null,
    outputFormat: generationPlan.outputFormat,
    requestedVariantCount: generationPlan.requestedVariantCount,
    metadata: generationPlan.metadata as Json,
  });
  if (queued.error || !queued.jobId) {
    return { state: null, error: queued.error ?? "Failed to queue generation." };
  }
  return getWorkspaceState(workspaceId);
}

export async function unlockWorkspacePlan(
  workspaceId: string,
  planCode: WorkspacePlanCode
): Promise<{ error: string | null }> {
  if (planCode !== "starter_pack" && planCode !== "unlimited") {
    return { error: "Invalid plan." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in first." };

  const loaded = await loadAccessibleWorkspace(workspaceId);
  if (!loaded.workspace || !loaded.admin) {
    return { error: loaded.error ?? "Workspace not found." };
  }

  const { workspace, admin } = loaded as {
    workspace: any;
    admin: ReturnType<typeof createWorkspaceAdminClient>;
  };

  if (workspace.user_id && workspace.user_id !== user.id) {
    return { error: "Access denied." };
  }

  await admin
    .schema("public")
    .from("workspaces")
    .update({
      user_id: user.id,
      linked_at: workspace.linked_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", workspaceId);

  const now = new Date();
  const endsAt =
    planCode === "starter_pack"
      ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
      : null;

  const alreadyOnPlan = await hasActiveEntitlementForPlan(user.id, planCode);
  if (!alreadyOnPlan) {
    await admin.schema("public").from("entitlements").insert({
      user_id: user.id,
      source: "manual",
      status: "active",
      plan_code: planCode,
      starts_at: now.toISOString(),
      ends_at: endsAt,
      metadata: { mode: "fake_unlock_workspace" } as Json,
      updated_at: now.toISOString(),
    });
  }

  const { data: pending } = await admin
    .schema("public")
    .from("pending_actions")
    .select("id, payload")
    .eq("workspace_id", workspaceId)
    .eq("action_type", "payment_required")
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pending?.id) {
    await admin
      .schema("public")
      .from("pending_actions")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", pending.id);
  }

  const payload =
    pending?.payload && typeof pending.payload === "object"
      ? (pending.payload as Record<string, unknown>)
      : {};
  const resumePrompt = String(payload.prompt ?? "").trim();
  const resumeOutputFormat =
    payload.output_format === "square_image" ||
    payload.output_format === "square_video" ||
    payload.output_format === "vertical_slideshow" ||
    payload.output_format === "square_text"
      ? payload.output_format
      : "square_image";
  const resumeTemplateFamilyPreference =
    payload.template_family_preference === "engagement_text"
      ? "engagement_text"
      : null;
  const requestedVariantCount = Number(payload.requested_variant_count ?? 1);
  const triggerMessageId = String(payload.trigger_message_id ?? "").trim() || null;
  const { data: existingActiveJob } = await admin
    .schema("public")
    .from("generation_jobs")
    .select("id")
    .eq("workspace_id", workspaceId)
    .in("status", ["queued", "running"])
    .limit(1)
    .maybeSingle();

  if (resumePrompt && !existingActiveJob?.id) {
    await admin.schema("public").from("workspace_messages").insert({
      workspace_id: workspaceId,
      role: "system",
      message_type: "status",
      content: {
        text:
          planCode === "starter_pack"
            ? "Starter unlocked — continuing."
            : "Unlimited unlocked — continuing.",
      } as Json,
      metadata: { reason: "manual_unlock", plan_code: planCode } as Json,
    });

    console.log("BEFORE JOB CREATE", {
      entry: "unlockWorkspacePlan",
      resumePrompt,
      resumeOutputFormat,
    });

    const generationPlan = buildWorkspaceGenerationPlan({
      workspaceId,
      prompt: resumePrompt,
      requestedByUserId: user.id,
      triggerMessageId,
      outputFormat: resumeOutputFormat,
      requestedVariantCount:
        Number.isFinite(requestedVariantCount) && requestedVariantCount > 0
          ? requestedVariantCount
          : 1,
      metadata: mergeDebugIntoMetadata(
        {
          workflow_mode: "single_output",
          output_format: resumeOutputFormat,
          selection_strategy:
            resumeOutputFormat === "square_text"
              ? "square_text_open_variant"
              : "random_template",
          selected_template_id: null,
          selected_template_slug: null,
          based_on_job_id: null,
          based_on_output_ids: [],
          deferred_followup: false,
          source: "workspace_unlock_resume",
          resumed_from_pending_action: Boolean(pending?.id),
          template_family_preference: resumeTemplateFamilyPreference,
        },
        {
          inputType: "unlock_resume",
          rawInput: resumePrompt,
          normalizedUrl: null,
          metadataExtracted: null,
          enrichedProfile: null,
          finalProfile: null,
          contextSummary: null,
        }
      ) as Json,
    });
    const queued = await enqueueGenerationJob({
      workspaceId: generationPlan.workspaceId,
      prompt: generationPlan.prompt,
      requestedByUserId: generationPlan.requestedByUserId ?? null,
      triggerMessageId: generationPlan.triggerMessageId ?? null,
      outputFormat: generationPlan.outputFormat,
      requestedVariantCount: generationPlan.requestedVariantCount,
      metadata: generationPlan.metadata as Json,
    });
    if (queued.error) {
      return { error: queued.error };
    }
  }

  return { error: null };
}

function shareLinkExpiresAtStillValid(expiresAt: string | null | undefined): boolean {
  if (expiresAt == null || expiresAt === "") return true;
  const t = new Date(String(expiresAt)).getTime();
  return !Number.isNaN(t) && t > Date.now();
}

export async function createOrGetShareLinkForWorkspaceOutput(
  workspaceId: string,
  generatedMemeId: string
): Promise<{
  error: string | null;
  url: string | null;
  path: string | null;
}> {
  const normalizedOutputId = String(generatedMemeId ?? "").trim();
  const normalizedWorkspaceId = String(workspaceId ?? "").trim();
  if (!normalizedOutputId || !normalizedWorkspaceId) {
    return { error: "Invalid output.", url: null, path: null };
  }

  const loaded = await loadAccessibleWorkspace(normalizedWorkspaceId);
  if (!loaded.workspace || !loaded.admin) {
    return { error: loaded.error ?? "Workspace not found.", url: null, path: null };
  }
  if (!loaded.currentUserId) {
    return { error: "Sign in to share.", url: null, path: null };
  }

  const { admin } = loaded as {
    admin: ReturnType<typeof createWorkspaceAdminClient>;
  };

  const { data: workspaceJobs } = await admin
    .schema("public")
    .from("generation_jobs")
    .select("id")
    .eq("workspace_id", normalizedWorkspaceId)
    .limit(500);
  const workspaceJobIds = (workspaceJobs ?? [])
    .map((job: { id?: unknown }) => String(job.id ?? "").trim())
    .filter(Boolean);
  if (workspaceJobIds.length === 0) {
    return { error: "Output not found in this workspace.", url: null, path: null };
  }

  const { data: mappedOutput } = await admin
    .schema("public")
    .from("generation_job_outputs")
    .select("generated_meme_id")
    .eq("generated_meme_id", normalizedOutputId)
    .in("generation_job_id", workspaceJobIds)
    .limit(1)
    .maybeSingle();
  if (!mappedOutput?.generated_meme_id) {
    return { error: "Output not found in this workspace.", url: null, path: null };
  }

  const { data: memeRow } = await admin
    .schema("public")
    .from("generated_memes")
    .select("id")
    .eq("id", normalizedOutputId)
    .maybeSingle();
  if (!memeRow?.id) {
    return { error: "Output no longer exists.", url: null, path: null };
  }

  const { data: existingRows } = await admin
    .schema("public")
    .from("share_links")
    .select("token, expires_at")
    .eq("generated_meme_id", normalizedOutputId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(8);

  const existingActive = (existingRows ?? []).find((row) =>
    shareLinkExpiresAtStillValid(row.expires_at as string | null)
  );
  if (existingActive?.token) {
    const path = `/s/${String(existingActive.token)}`;
    const url = await absoluteUrlForSharePath(path);
    return { error: null, url, path };
  }

  let token = randomBytes(32).toString("base64url");
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error: insertError } = await admin.schema("public").from("share_links").insert({
      token,
      generated_meme_id: normalizedOutputId,
      created_by_user_id: loaded.currentUserId,
    });
    if (!insertError) {
      const path = `/s/${token}`;
      const url = await absoluteUrlForSharePath(path);
      return { error: null, url, path };
    }
    if (insertError.code === "23505") {
      token = randomBytes(32).toString("base64url");
      continue;
    }
    return { error: insertError.message, url: null, path: null };
  }

  return { error: "Could not create a share link.", url: null, path: null };
}

