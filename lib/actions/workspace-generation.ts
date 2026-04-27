import { randomUUID } from "node:crypto";
import { generateMockMemes } from "@/lib/actions/memes";
import { createWorkspaceAdminClient } from "@/lib/workspace/auth";
import { buildPromptFromEnrichment } from "@/lib/url/build-context";
import {
  getNextAngle,
  parseBusinessProfileFromWorkspaceRow,
} from "@/lib/workspace/business-profile";
import { mergeDebugIntoMetadata } from "@/lib/workspace/generation-job-debug";

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

type WorkspaceRow = {
  id: string;
  user_id: string | null;
  initial_prompt: string;
  business_summary: string | null;
  preview_generations_used: number;
  metadata?: Record<string, unknown> | null;
};

type FollowupPayload = {
  prompt?: unknown;
  output_format?: unknown;
  requested_variant_count?: unknown;
  relation_to_previous_job?: unknown;
  trigger_message_id?: unknown;
  based_on_job_id?: unknown;
  based_on_output_ids?: unknown;
  deferred_from_intent?: unknown;
  explicit_promo_intent?: unknown;
  promo_context_excerpt?: unknown;
  template_family_preference?: unknown;
  workspace_context_summary?: unknown;
  reset_context?: unknown;
};

type JobRow = {
  id: string;
  workspace_id: string;
  prompt: string;
  status:
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "blocked_auth"
    | "blocked_payment"
    | "cancelled";
  output_format: "square_image" | "square_video" | "vertical_slideshow" | "square_text" | null;
  requested_variant_count: number;
  started_at: string | null;
  metadata?: Record<string, unknown> | null;
};

export type WorkspaceGenerationPlan = {
  workspaceId: string;
  prompt: string;
  outputFormat: "square_image" | "square_video" | "vertical_slideshow" | "square_text";
  requestedVariantCount: number;
  requestedByUserId?: string | null;
  triggerMessageId?: string | null;
  metadata?: Json;
};

export function buildWorkspaceGenerationPlan(params: {
  workspaceId: string;
  prompt: string;
  outputFormat: "square_image" | "square_video" | "vertical_slideshow" | "square_text";
  requestedVariantCount?: number;
  requestedByUserId?: string | null;
  triggerMessageId?: string | null;
  metadata?: Json;
}): WorkspaceGenerationPlan {
  return {
    workspaceId: params.workspaceId,
    prompt: String(params.prompt ?? "").trim(),
    outputFormat: params.outputFormat,
    requestedVariantCount: Number.isFinite(params.requestedVariantCount)
      ? Math.max(1, Math.floor(params.requestedVariantCount ?? 1))
      : 1,
    requestedByUserId: params.requestedByUserId ?? null,
    triggerMessageId: params.triggerMessageId ?? null,
    metadata: (params.metadata ?? {}) as Json,
  };
}

function completionFollowupMessage(
  outputFormat: JobRow["output_format"],
  outputCount: number,
  templateFamilyPreference?: "engagement_text" | null
): string {
  if (outputCount <= 0) {
    return "I could not map outputs from that pass. I can retry with a tighter brief or switch format.";
  }
  if (outputFormat === "square_text" && templateFamilyPreference === "engagement_text") {
    return "I made an engagement post version. Want another one or a format switch?";
  }
  if (outputFormat === "vertical_slideshow") {
    return "I drafted this multi-slide set. Next move: sharpen the hook, or spin this into image memes or text memes.";
  }
  if (outputFormat === "square_video") {
    return "I made a square video version. Want a funnier pass or a format switch?";
  }
  if (outputFormat === "square_text") {
    return "I made a text meme version. Want another one or a format switch?";
  }
  return "I made an image meme version. Want another one, a funnier pass, or a format switch?";
}

function completionUiPills() {
  return [
    { label: "Image Meme", message: "Generate image memes for this idea", kind: "format" as const },
    { label: "Video Meme", message: "Turn this idea into video memes", kind: "format" as const },
    { label: "Text Meme", message: "Generate text memes for this idea", kind: "format" as const },
    { label: "Engagement post", message: "Turn this idea into an engagement post", kind: "format" as const },
  ];
}

function coerceOutputFormat(
  value: unknown
): "square_image" | "square_video" | "vertical_slideshow" | "square_text" {
  return value === "square_image" ||
    value === "square_video" ||
    value === "vertical_slideshow" ||
    value === "square_text"
    ? value
    : "square_image";
}

const STALE_GENERATION_JOB_MS = 60_000;

/** Marks queued/running jobs older than STALE_GENERATION_JOB_MS as failed so they do not block new work. */
export async function expireStaleGenerationJobs(
  admin: ReturnType<typeof createWorkspaceAdminClient>,
  workspaceId: string
): Promise<void> {
  const cutoffIso = new Date(Date.now() - STALE_GENERATION_JOB_MS).toISOString();
  const { error } = await admin
    .schema("public")
    .from("generation_jobs")
    .update({
      status: "failed",
      error_message: "Stale job cleared (exceeded inactivity window).",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .in("status", ["queued", "running"])
    .lt("created_at", cutoffIso);
  if (error) {
    console.warn("[workspace-gen] expireStaleGenerationJobs:", error.message);
  }
}

export async function enqueueGenerationJob(params: {
  workspaceId: string;
  prompt: string;
  requestedByUserId?: string | null;
  triggerMessageId?: string | null;
  outputFormat?: "square_image" | "square_video" | "vertical_slideshow" | "square_text";
  requestedVariantCount?: number;
  metadata?: Json;
}): Promise<{ jobId: string | null; error: string | null }> {
  const admin = createWorkspaceAdminClient();
  const {
    workspaceId,
    prompt,
    requestedByUserId = null,
    triggerMessageId = null,
    outputFormat = "square_text",
    requestedVariantCount = 1,
    metadata = {} as Json,
  } = params;

  const normalizedPrompt = String(prompt ?? "").trim();
  if (!normalizedPrompt) return { jobId: null, error: "Prompt is required." };

  console.log("JOB METADATA", { workspaceId, prompt: normalizedPrompt, metadata });

  await expireStaleGenerationJobs(admin, workspaceId);

  const { data: runningExisting } = await admin
    .schema("public")
    .from("generation_jobs")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("status", "running")
    .limit(1);
  if ((runningExisting ?? []).length > 0) {
    return { jobId: null, error: "A generation job is already running." };
  }

  const { data: workspaceRow } = await admin
    .schema("public")
    .from("workspaces")
    .select("session_id")
    .eq("id", workspaceId)
    .maybeSingle();

  const sessionIdFromWorkspace =
    workspaceRow &&
    typeof (workspaceRow as { session_id?: unknown }).session_id === "string"
      ? String((workspaceRow as { session_id: string }).session_id).trim() ||
        null
      : null;

  const { data, error } = await admin
    .schema("public")
    .from("generation_jobs")
    .insert({
      workspace_id: workspaceId,
      requested_by_user_id: requestedByUserId,
      trigger_message_id: triggerMessageId,
      status: "queued",
      prompt: normalizedPrompt,
      output_format: outputFormat,
      requested_variant_count: requestedVariantCount,
      metadata,
      session_id: sessionIdFromWorkspace,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (!error && data) {
    console.log("[jobs] session_id on job:", sessionIdFromWorkspace);
  }

  if (error || !data) {
    if (error?.code === "23505") {
      return { jobId: null, error: "A generation is already in progress." };
    }
    return { jobId: null, error: error?.message ?? "Failed to queue generation." };
  }
  return { jobId: data.id as string, error: null };
}

export async function runGenerationPlan(params: {
  job: JobRow;
  workspace: WorkspaceRow;
  generationRunId: string;
}): Promise<{
  result: Awaited<ReturnType<typeof generateMockMemes>>;
  runtimeDebug: { angleUsed: string | null; finalPrompt: string };
}> {
  const { job, workspace, generationRunId } = params;
  const metadata =
    job.metadata && typeof job.metadata === "object"
      ? (job.metadata as Record<string, unknown>)
      : {};
  console.log("RUN GENERATION INPUT", {
    jobId: job.id,
    jobPrompt: job.prompt,
    metadata: job.metadata,
  });
  const explicitPromoIntent = Boolean(metadata.explicit_promo_intent);
  const resetContext = Boolean(metadata.reset_context);
  const explicitPromoContext = explicitPromoIntent
    ? String(metadata.promo_context_excerpt ?? "").trim() || null
    : null;
  const profile = parseBusinessProfileFromWorkspaceRow(workspace);
  const rawBp =
    workspace.metadata &&
    typeof workspace.metadata === "object" &&
    !Array.isArray(workspace.metadata)
      ? (workspace.metadata as Record<string, unknown>).businessProfile
      : null;
  const rawBusinessName =
    rawBp &&
    typeof rawBp === "object" &&
    !Array.isArray(rawBp) &&
    "businessName" in rawBp
      ? String((rawBp as Record<string, unknown>).businessName ?? "")
      : undefined;
  console.log("RUN GENERATION PLAN INPUT:", {
    workspaceId: workspace.id,
    hasProfile: Boolean(rawBp),
    businessName: rawBusinessName,
  });
  const explicitJobSummary =
    !resetContext && typeof metadata.workspace_context_summary === "string"
      ? String(metadata.workspace_context_summary).trim()
      : "";
  let workspaceContextSummary: string | null = null;
  if (!resetContext) {
    if (explicitJobSummary) {
      workspaceContextSummary = explicitJobSummary;
    } else if (profile) {
      workspaceContextSummary = buildPromptFromEnrichment(profile);
    } else {
      workspaceContextSummary =
        String(workspace.business_summary ?? workspace.initial_prompt ?? "").trim() ||
        null;
    }
  }
  const { angle, nextState: nextAngleState } = profile
    ? getNextAngle(profile, workspace.metadata)
    : { angle: null, nextState: null };
  const angleUsed =
    angle && String(angle).trim() ? String(angle).trim() : null;

  console.log({
    businessProfile: profile,
    usingEnrichedContext: Boolean(profile),
    angle,
    nextAngleState,
  });
  const templateFamilyPreference =
    metadata.template_family_preference === "engagement_text"
      ? "engagement_text"
      : null;
  console.log("[workspace-gen] runGenerationPlan payload", {
    outputFormat: job.output_format ?? "square_text",
    templateFamilyPreference,
    resetContext,
    requestedVariantCount: job.requested_variant_count || 1,
    workspaceId: workspace.id,
    jobId: job.id,
  });

  const context = String(job.prompt ?? "").trim();

  const angleDirective = angleUsed
    ? `

---

Content Angle Focus:

You must base this content on the following specific scenario:

${angleUsed}

Expand this into a clear, real-world situation that would happen in this industry.

The idea should strongly reflect this angle and not drift into generic humour.
`
    : "";

  const enrichedPrompt = context + angleDirective;

  const finalPrompt =
    enrichedPrompt +
    `

Final requirement:

The output MUST clearly reflect both:
1. The business context
2. The selected content angle

If it could apply to any business, it is not specific enough.

---

Process:

1. First, identify a specific situation that directly involves:
   - the business
   - its customers or clients
   - or the service it provides

2. The scenario MUST be clearly connected to the industry or audience.
   It should involve:
   - client behaviour
   - customer expectations
   - real interactions
   - or industry-specific frustrations

3. Then create a meme based on that situation.

The scenario should be:
- realistic
- specific to the industry
- immediately recognisable to the target audience

Avoid:
- generic life situations (e.g. forgetting lunch, waking up late)
- scenarios that could apply to anyone regardless of business

Critical constraint:

If the scenario does not directly involve the business, its customers, or its services, it is invalid.
You must choose a different scenario.

Angle enforcement:

The scenario must clearly reflect the selected content angle.
Do not drift away from the angle into general humour.

Tone requirement:

The humour should feel like insider knowledge of the industry.
It should make the audience feel "this is so accurate".
`;

  console.log("ANGLE USED:", angle);
  console.log("FINAL PROMPT:", finalPrompt);

  const result = await generateMockMemes(finalPrompt, {
    limit: job.requested_variant_count || 1,
    outputFormat: job.output_format ?? "square_text",
    generationRunIdOverride: generationRunId,
    explicitPromoContext,
    workspaceContextSummary,
    templateFamilyPreference,
    workspaceContext: {
      allowAnonymousWrite: true,
      actorUserId: workspace.user_id,
      storagePathNamespace: workspace.id,
      workspaceId: workspace.id,
      profileOverride: {
        id: workspace.user_id ?? workspace.id,
        brand_name: "Mimly Workspace",
        what_you_do: resetContext
          ? (String(job.prompt ?? "").trim() ||
              workspace.business_summary ||
              workspace.initial_prompt)
          : workspaceContextSummary ||
            workspace.business_summary ||
            workspace.initial_prompt,
        audience: "social media audience",
        country: null,
        english_variant: "en-GB",
      },
    },
  });

  if (!result.error && nextAngleState !== null) {
    const admin = createWorkspaceAdminClient();
    const baseMeta =
      workspace.metadata &&
      typeof workspace.metadata === "object" &&
      !Array.isArray(workspace.metadata)
        ? { ...(workspace.metadata as Record<string, unknown>) }
        : {};
    await admin
      .schema("public")
      .from("workspaces")
      .update({
        metadata: { ...baseMeta, angleState: nextAngleState } as Json,
        updated_at: new Date().toISOString(),
      })
      .eq("id", workspace.id);
  }

  return {
    result,
    runtimeDebug: { angleUsed, finalPrompt },
  };
}

export async function runGenerationJob(
  jobId: string
): Promise<{ ok: boolean; status: string; error?: string | null }> {
  const admin = createWorkspaceAdminClient();

  const { data: lockedJob, error: lockError } = await admin
    .schema("public")
    .from("generation_jobs")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("status", "queued")
    .select("id, workspace_id, prompt, output_format, requested_variant_count, status, started_at, metadata")
    .single();

  if (lockError || !lockedJob) {
    return { ok: false, status: "not_queued", error: lockError?.message ?? null };
  }

  const job = lockedJob as JobRow;

  const { data: workspace, error: workspaceError } = await admin
    .schema("public")
    .from("workspaces")
    .select(
      "id, user_id, initial_prompt, business_summary, preview_generations_used, metadata"
    )
    .eq("id", job.workspace_id)
    .single();

  if (workspaceError || !workspace) {
    await admin
      .schema("public")
      .from("generation_jobs")
      .update({
        status: "failed",
        error_message: workspaceError?.message ?? "Workspace not found.",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return { ok: false, status: "failed", error: workspaceError?.message ?? "Workspace missing." };
  }

  const ws = workspace as WorkspaceRow;
  const generationRunId = randomUUID();
  const startedAt = (job.started_at ?? new Date().toISOString()).toString();
  const jobMetaBase =
    job.metadata && typeof job.metadata === "object"
      ? { ...(job.metadata as Record<string, unknown>) }
      : {};

  let runtimeDebug: { angleUsed: string | null; finalPrompt: string } | null = null;

  try {
    const planOutcome = await runGenerationPlan({
      job,
      workspace: ws,
      generationRunId,
    });
    runtimeDebug = planOutcome.runtimeDebug;
    const result = planOutcome.result;

    if (result.error) {
      await admin
        .schema("public")
        .from("generation_jobs")
        .update({
          status: "failed",
          error_message: result.error,
          generation_run_id: generationRunId,
          metadata: mergeDebugIntoMetadata(jobMetaBase, {
            angleUsed: runtimeDebug.angleUsed,
            finalPrompt: runtimeDebug.finalPrompt,
          }) as Json,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      return { ok: false, status: "failed", error: result.error };
    }

    let runRowsQuery = admin
      .schema("public")
      .from("generated_memes")
      .select("id, template_id, variant_metadata")
      .eq("generation_run_id", generationRunId)
      .gte("created_at", startedAt);

    if (ws.user_id) {
      runRowsQuery = runRowsQuery.eq("user_id", ws.user_id);
    } else {
      runRowsQuery = runRowsQuery.contains("variant_metadata", {
        workspace_id: ws.id,
      });
    }

    const { data: runRows, error: runRowsError } = await runRowsQuery.order(
      "created_at",
      { ascending: true }
    );

    if (runRowsError) {
      await admin
        .schema("public")
        .from("generation_jobs")
        .update({
          status: "failed",
          error_message: runRowsError.message,
          generation_run_id: generationRunId,
          metadata: mergeDebugIntoMetadata(jobMetaBase, {
            angleUsed: runtimeDebug.angleUsed,
            finalPrompt: runtimeDebug.finalPrompt,
          }) as Json,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      return { ok: false, status: "failed", error: runRowsError.message };
    }

    const rawOutputs =
      (runRows ?? []) as Array<{
        id: string;
        template_id?: string | null;
        variant_metadata?: Record<string, unknown> | null;
      }>;
    if (rawOutputs.length > 1) {
      console.warn("[workspace-gen] Multiple outputs returned for single-output job; keeping first only", {
        jobId: job.id,
        outputCount: rawOutputs.length,
      });
    }
    const outputs = rawOutputs.slice(0, 1);
    if (outputs.length > 0) {
      const payload = outputs.map((row, index) => ({
        generation_job_id: job.id,
        generated_meme_id: row.id,
        output_order: index,
      }));
      const { error: mapError } = await admin
        .schema("public")
        .from("generation_job_outputs")
        .insert(payload);
      if (mapError) {
        console.error("[workspace-gen] Failed to map job outputs", mapError);
      }
    }

    await admin
      .schema("public")
      .from("workspace_messages")
      .insert({
        workspace_id: ws.id,
        role: "assistant",
        message_type: "generation_result",
        content: {
          text: completionFollowupMessage(
            job.output_format,
            outputs.length,
            (job.metadata?.template_family_preference as
              | "engagement_text"
              | null
              | undefined) ?? null
          ),
          output_count: outputs.length,
          generation_job_id: job.id,
        } as Json,
        metadata: {
          output_format: job.output_format,
          follow_up_hint: true,
          ui_pills: completionUiPills(),
        } as Json,
      });

    const selectedOutput = outputs[0] ?? null;
    const selectedTemplateId = selectedOutput?.template_id ?? null;
    const selectedTemplateSlug =
      selectedOutput?.variant_metadata &&
      typeof selectedOutput.variant_metadata === "object"
        ? String((selectedOutput.variant_metadata as Record<string, unknown>).selected_template_slug ?? "")
        : "";
    const selectionStrategy =
      selectedOutput?.variant_metadata &&
      typeof selectedOutput.variant_metadata === "object"
        ? String((selectedOutput.variant_metadata as Record<string, unknown>).selection_strategy ?? "")
        : "";
    const workflowMode =
      selectedOutput?.variant_metadata &&
      typeof selectedOutput.variant_metadata === "object"
        ? String((selectedOutput.variant_metadata as Record<string, unknown>).workflow_mode ?? "")
        : "";
    const selectionScope =
      selectedOutput?.variant_metadata &&
      typeof selectedOutput.variant_metadata === "object"
        ? String((selectedOutput.variant_metadata as Record<string, unknown>).selection_scope ?? "")
        : "";
    const cycleResetApplied =
      selectedOutput?.variant_metadata &&
      typeof selectedOutput.variant_metadata === "object"
        ? Boolean(
            (selectedOutput.variant_metadata as Record<string, unknown>)
              .cycle_reset_applied
          )
        : false;
    const cycleExhausted =
      selectedOutput?.variant_metadata &&
      typeof selectedOutput.variant_metadata === "object"
        ? Boolean(
            (selectedOutput.variant_metadata as Record<string, unknown>)
              .cycle_exhausted
          )
        : false;
    const selectionStage =
      selectedOutput?.variant_metadata &&
      typeof selectedOutput.variant_metadata === "object"
        ? String((selectedOutput.variant_metadata as Record<string, unknown>).selection_stage ?? "")
        : "";

    const existingJobMetadata =
      job.metadata && typeof job.metadata === "object"
        ? (job.metadata as Record<string, unknown>)
        : {};

    const completedMetadataBase = {
      ...existingJobMetadata,
      workflow_mode:
        String(existingJobMetadata.workflow_mode ?? "") ||
        workflowMode ||
        "single_output",
      output_format: job.output_format,
      selection_strategy:
        String(existingJobMetadata.selection_strategy ?? "") ||
        selectionStrategy ||
        (job.output_format === "square_text"
          ? "square_text_open_variant"
          : "random_template"),
      selection_scope:
        String(existingJobMetadata.selection_scope ?? "") ||
        selectionScope ||
        "workspace_family_cycle",
      cycle_exhausted:
        typeof existingJobMetadata.cycle_exhausted === "boolean"
          ? existingJobMetadata.cycle_exhausted
          : cycleExhausted,
      cycle_reset_applied:
        typeof existingJobMetadata.cycle_reset_applied === "boolean"
          ? existingJobMetadata.cycle_reset_applied
          : cycleResetApplied,
      selection_stage:
        String(existingJobMetadata.selection_stage ?? "") ||
        selectionStage ||
        null,
      selected_template_id: selectedTemplateId,
      selected_template_slug: selectedTemplateSlug || null,
      based_on_job_id: existingJobMetadata.based_on_job_id ?? null,
      based_on_output_ids: Array.isArray(existingJobMetadata.based_on_output_ids)
        ? existingJobMetadata.based_on_output_ids
        : [],
      deferred_followup: Boolean(existingJobMetadata.deferred_followup) || false,
    };

    const completedJobMetadata = mergeDebugIntoMetadata(completedMetadataBase, {
      angleUsed: runtimeDebug.angleUsed,
      finalPrompt: runtimeDebug.finalPrompt,
    }) as Json;

    const priorMeta = job.metadata && typeof job.metadata === "object" ? job.metadata : null;
    const priorDebug =
      priorMeta && "debug" in priorMeta && priorMeta.debug && typeof priorMeta.debug === "object"
        ? (priorMeta.debug as Record<string, unknown>)
        : null;

    console.log("WRITING DEBUG TO DB", {
      jobId: job.id,
      finalProfile: priorDebug?.finalProfile,
      finalPrompt: runtimeDebug.finalPrompt,
    });

    await admin
      .schema("public")
      .from("generation_jobs")
      .update({
        status: "completed",
        generation_run_id: generationRunId,
        metadata: completedJobMetadata,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    await admin
      .schema("public")
      .from("workspaces")
      .update({
        preview_generations_used: Math.max(0, ws.preview_generations_used) + 1,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", ws.id);

    const { data: deferredFollowup } = await admin
      .schema("public")
      .from("pending_actions")
      .select("id, payload")
      .eq("workspace_id", ws.id)
      .eq("action_type", "followup_request")
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (deferredFollowup?.id) {
      const payload =
        deferredFollowup.payload && typeof deferredFollowup.payload === "object"
          ? (deferredFollowup.payload as FollowupPayload)
          : {};
      const followupPrompt = String(payload.prompt ?? "").trim();
      const followupOutputFormat = coerceOutputFormat(payload.output_format);
      const followupVariantCount = Number(payload.requested_variant_count ?? 1);
      const followupTriggerMessageId =
        String(payload.trigger_message_id ?? "").trim() || null;
      const basedOnJobId = String(payload.based_on_job_id ?? "").trim() || null;
      const basedOnOutputIds = Array.isArray(payload.based_on_output_ids)
        ? (payload.based_on_output_ids as unknown[])
            .map((id) => String(id).trim())
            .filter(Boolean)
        : [];
      const deferredFromIntent = String(payload.deferred_from_intent ?? "").trim() || null;
      const explicitPromoIntent = Boolean(payload.explicit_promo_intent);
      const promoContextExcerpt = explicitPromoIntent
        ? String(payload.promo_context_excerpt ?? "").trim() || null
        : null;
      const workspaceContextSummary =
        String(payload.workspace_context_summary ?? ws.business_summary ?? ws.initial_prompt ?? "").trim() ||
        null;
      const templateFamilyPreference =
        payload.template_family_preference === "engagement_text"
          ? ("engagement_text" as const)
          : null;
      const resetContext = Boolean(payload.reset_context);

      await admin
        .schema("public")
        .from("pending_actions")
        .update({ resolved_at: new Date().toISOString() })
        .eq("id", deferredFollowup.id);

      if (followupPrompt) {
        const { data: existingActiveJob } = await admin
          .schema("public")
          .from("generation_jobs")
          .select("id")
          .eq("workspace_id", ws.id)
          .in("status", ["queued", "running"])
          .limit(1)
          .maybeSingle();

        if (!existingActiveJob?.id) {
          const relationText =
            payload.relation_to_previous_job === "refine_last_generation"
              ? "Applying your refinement."
              : "Running that next.";

          await admin.schema("public").from("workspace_messages").insert({
            workspace_id: ws.id,
            role: "assistant",
            message_type: "status",
            content: { text: relationText } as Json,
            metadata: {
              reason: "running_deferred_followup",
              output_format: followupOutputFormat,
            } as Json,
          });

          const deferredPlan = buildWorkspaceGenerationPlan({
            workspaceId: ws.id,
            prompt: followupPrompt,
            requestedByUserId: ws.user_id,
            triggerMessageId: followupTriggerMessageId,
            outputFormat: followupOutputFormat,
            requestedVariantCount:
              Number.isFinite(followupVariantCount) && followupVariantCount > 0
                ? Math.min(9, Math.max(1, Math.floor(followupVariantCount)))
                : 1,
            metadata: mergeDebugIntoMetadata(
              {
                workflow_mode: "single_output",
                output_format: followupOutputFormat,
                selection_strategy:
                  followupOutputFormat === "square_text"
                    ? "square_text_open_variant"
                    : "random_template",
                template_family_preference: templateFamilyPreference,
                reset_context: resetContext,
                selected_template_id: null,
                selected_template_slug: null,
                based_on_job_id: resetContext ? null : basedOnJobId,
                based_on_output_ids: basedOnOutputIds,
                deferred_followup: true,
                deferred_from_intent: deferredFromIntent,
                explicit_promo_intent: explicitPromoIntent,
                promo_context_excerpt: promoContextExcerpt,
                workspace_context_summary: resetContext ? null : workspaceContextSummary,
              },
              {
                inputType: "deferred_followup",
                rawInput: followupPrompt,
                normalizedUrl: null,
                metadataExtracted: null,
                enrichedProfile: null,
                finalProfile: null,
                contextSummary: resetContext ? null : workspaceContextSummary,
              }
            ) as Json,
          });
          const queuedFollowup = await enqueueGenerationJob({
            workspaceId: deferredPlan.workspaceId,
            prompt: deferredPlan.prompt,
            requestedByUserId: deferredPlan.requestedByUserId ?? null,
            triggerMessageId: deferredPlan.triggerMessageId ?? null,
            outputFormat: deferredPlan.outputFormat,
            requestedVariantCount: deferredPlan.requestedVariantCount,
            metadata: deferredPlan.metadata as Json,
          });

          if (queuedFollowup.jobId) {
            void runGenerationJob(queuedFollowup.jobId);
          }
        }
      }
    }

    return { ok: true, status: "completed" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown generation error";
    await admin
      .schema("public")
      .from("generation_jobs")
      .update({
        status: "failed",
        error_message: message,
        generation_run_id: generationRunId,
        ...(runtimeDebug
          ? {
              metadata: mergeDebugIntoMetadata(jobMetaBase, {
                angleUsed: runtimeDebug.angleUsed,
                finalPrompt: runtimeDebug.finalPrompt,
              }) as Json,
            }
          : {}),
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return { ok: false, status: "failed", error: message };
  }
}
