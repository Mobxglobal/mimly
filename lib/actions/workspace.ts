"use server";

import { createClient } from "@/lib/supabase/server";
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
} from "@/lib/actions/workspace-generation";
import { resolveWorkspaceOutputFormat } from "@/lib/workspace/output-format-resolver";
import { interpretWorkspaceMessage } from "@/lib/workspace/message-interpreter";
import {
  getActiveEntitlement,
  hasActiveEntitlement,
  hasActiveEntitlementForPlan,
  type WorkspacePlanCode,
} from "@/lib/workspace/entitlements";

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

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
  prompt: string
): Promise<{ workspaceId: string | null; error: string | null }> {
  const normalizedPrompt = normalizePrompt(prompt);
  if (!normalizedPrompt) return { workspaceId: null, error: "Prompt is required." };

  const token = await ensureWorkspaceToken();
  const tokenHash = hashWorkspaceToken(token);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createWorkspaceAdminClient();
  const nowIso = new Date().toISOString();
  const { data: workspace, error: workspaceError } = await admin
    .schema("public")
    .from("workspaces")
    .insert({
      user_id: user?.id ?? null,
      anon_token_hash: tokenHash,
      initial_prompt: normalizedPrompt,
      business_url: tryExtractUrlFromPrompt(normalizedPrompt),
      business_summary: normalizedPrompt,
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
  const resolvedOutputFormat = resolveWorkspaceOutputFormat({
    prompt: normalizedPrompt,
    businessUrl: tryExtractUrlFromPrompt(normalizedPrompt),
  });

  const { data: firstMessage } = await admin
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

  const generationPlan = buildWorkspaceGenerationPlan({
    workspaceId,
    prompt: normalizedPrompt,
    requestedByUserId: user?.id ?? null,
    triggerMessageId: firstMessage?.id ?? null,
    outputFormat: resolvedOutputFormat,
    requestedVariantCount: 1,
    metadata: {
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
      source: "workspace_initial_prompt",
    } as Json,
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
  if (initialQueued.jobId) {
    void runGenerationJob(initialQueued.jobId);
  }

  return { workspaceId, error: null };
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
      "id, status, block_reason, prompt, output_format, error_message, created_at, completed_at"
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
      });
  }

  const isAuthenticated = Boolean(currentUserId || workspace.user_id);
  const hasEntitlement = currentPlan !== "free_preview";
  const gateState: "anonymous_blocked" | "authenticated_plan_required" | "unlocked" =
    latestJob?.status === "blocked_auth" && !isAuthenticated
      ? "anonymous_blocked"
      : isAuthenticated &&
          !hasEntitlement &&
          (latestJob?.status === "blocked_auth" || latestJob?.status === "blocked_payment")
        ? "authenticated_plan_required"
        : "unlocked";

  // After auth succeeds on a previously blocked-auth workspace,
  // force plan-required UX instead of showing sign-in again.
  if (gateState === "authenticated_plan_required" && latestJob?.status === "blocked_auth") {
    latestJob = {
      ...latestJob,
      status: "blocked_payment",
      block_reason: "payment_required",
    };
  }

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
  void runGenerationJob(String(queued.id));
  return { started: true, error: null };
}

export async function sendWorkspaceMessage(
  workspaceId: string,
  prompt: string
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

  const isAnonymousWorkspace = !workspace.user_id;
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
    .select("id, status, prompt, output_format")
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
        }
      : null,
    hasLatestCompletedOutputs,
    workspace: {
      initial_prompt: String(workspace.initial_prompt ?? ""),
      business_url: workspace.business_url ? String(workspace.business_url) : null,
      business_summary: workspace.business_summary
        ? String(workspace.business_summary)
        : null,
      preview_generations_used: previewUsed,
    },
  });

  const resolvedPrompt = plan.prompt_for_generation?.trim() || normalizedPrompt;
  const resolvedOutputFormat =
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
      requested_variant_count: requestedVariantCount,
      relation_to_previous_job: plan.relation_to_previous_job,
      trigger_message_id: userMessage?.id ?? null,
      deferred_from_intent: plan.intent,
      based_on_job_id: latestJobRow?.id ?? null,
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
          "Finishing this batch first, then applying that next.",
      } as Json,
      metadata: {
        reason: "active_generation_in_progress",
        deferred_intent: plan.intent,
        has_deferred_followup: true,
        ui_pills: [
          { label: "More ideas", message: "Give me another one in this direction.", kind: "action" },
          { label: "Make it funnier", message: "Keep the idea, but make it funnier.", kind: "action" },
          { label: "Switch format", message: "Switch this into another format.", kind: "action" },
        ],
      } as Json,
    });
    return getWorkspaceState(workspaceId);
  }

  if (isAnonymousWorkspace && previewUsed >= 1) {
    await admin
      .schema("public")
      .from("generation_jobs")
      .insert({
        workspace_id: workspaceId,
        requested_by_user_id: currentUserId,
        trigger_message_id: userMessage?.id ?? null,
        status: "blocked_auth",
        block_reason: "preview_limit",
        prompt: resolvedPrompt,
        output_format: resolvedOutputFormat,
        requested_variant_count: requestedVariantCount,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    await admin.schema("public").from("pending_actions").insert({
      workspace_id: workspaceId,
      action_type: "auth_required",
      payload: { reason: "preview_limit" } as Json,
    });

    await admin.schema("public").from("workspace_messages").insert({
      workspace_id: workspaceId,
      role: "system",
      message_type: "gate_notice",
      content: {
        text: "You have used your free preview - sign in and I will keep this going.",
      } as Json,
      metadata: { reason: "blocked_auth" } as Json,
    });

    return getWorkspaceState(workspaceId);
  }

  if (!isAnonymousWorkspace) {
    if (!currentUserId) {
      await admin.schema("public").from("generation_jobs").insert({
        workspace_id: workspaceId,
        requested_by_user_id: null,
        trigger_message_id: userMessage?.id ?? null,
        status: "blocked_auth",
        block_reason: "auth_required",
        prompt: resolvedPrompt,
        output_format: resolvedOutputFormat,
        requested_variant_count: requestedVariantCount,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      await admin.schema("public").from("workspace_messages").insert({
        workspace_id: workspaceId,
        role: "system",
        message_type: "gate_notice",
        content: {
          text: "Your session expired - sign in and I will continue this thread.",
        } as Json,
        metadata: { reason: "blocked_auth" } as Json,
      });
      return getWorkspaceState(workspaceId);
    }

    const entitled = await hasActiveEntitlement(currentUserId);
    if (!entitled) {
      const { data: blockedJob } = await admin
        .schema("public")
        .from("generation_jobs")
        .insert({
          workspace_id: workspaceId,
          requested_by_user_id: currentUserId,
          trigger_message_id: userMessage?.id ?? null,
          status: "blocked_payment",
          block_reason: "payment_required",
          prompt: resolvedPrompt,
          output_format: resolvedOutputFormat,
          requested_variant_count: requestedVariantCount,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      const pendingPayload = {
        reason: "payment_required",
        blocked_job_id: blockedJob?.id ?? null,
        trigger_message_id: userMessage?.id ?? null,
        prompt: resolvedPrompt,
        output_format: resolvedOutputFormat,
        requested_variant_count: requestedVariantCount,
      } as Json;

      const { data: existingPending } = await admin
        .schema("public")
        .from("pending_actions")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("action_type", "payment_required")
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingPending?.id) {
        await admin
          .schema("public")
          .from("pending_actions")
          .update({ payload: pendingPayload })
          .eq("id", existingPending.id);
      } else {
        const { error: pendingInsertError } = await admin
          .schema("public")
          .from("pending_actions")
          .insert({
            workspace_id: workspaceId,
            action_type: "payment_required",
            payload: pendingPayload,
          });

        if (pendingInsertError?.code === "23505") {
          const { data: racedPending } = await admin
            .schema("public")
            .from("pending_actions")
            .select("id")
            .eq("workspace_id", workspaceId)
            .eq("action_type", "payment_required")
            .is("resolved_at", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (racedPending?.id) {
            await admin
              .schema("public")
              .from("pending_actions")
              .update({ payload: pendingPayload })
              .eq("id", racedPending.id);
          }
        }
      }

      await admin.schema("public").from("workspace_messages").insert({
        workspace_id: workspaceId,
        role: "system",
        message_type: "gate_notice",
        content: {
          text: "Unlock a plan and I will continue this thread instantly.",
        } as Json,
        metadata: { reason: "blocked_payment" } as Json,
      });

      return getWorkspaceState(workspaceId);
    }
  }

  await admin.schema("public").from("workspace_messages").insert({
    workspace_id: workspaceId,
    role: "assistant",
    message_type: "status",
    content: {
      text:
          "Creating one version for this now.",
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

  const generationPlan = buildWorkspaceGenerationPlan({
    workspaceId,
    prompt: resolvedPrompt,
    requestedByUserId: currentUserId,
    triggerMessageId: userMessage?.id ?? null,
    outputFormat: resolvedOutputFormat,
    requestedVariantCount,
    metadata: {
      workflow_mode: "single_output",
      output_format: resolvedOutputFormat,
      selection_strategy:
        resolvedOutputFormat === "square_text"
          ? "square_text_open_variant"
          : "random_template",
      selected_template_id: null,
      selected_template_slug: null,
      based_on_job_id: latestJobRow?.id ?? null,
      based_on_output_ids: [],
      deferred_followup: false,
      source: "workspace_send_message",
      intent: plan.intent,
      relation_to_previous_job: plan.relation_to_previous_job,
    } as Json,
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
  void runGenerationJob(queued.jobId);
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
            ? "Starter Pack unlocked — continuing your generation..."
            : "Unlimited unlocked — continuing your generation...",
      } as Json,
      metadata: { reason: "manual_unlock", plan_code: planCode } as Json,
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
      metadata: {
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
      } as Json,
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
    if (queued.jobId) {
      void runGenerationJob(queued.jobId);
    }
  }

  return { error: null };
}

