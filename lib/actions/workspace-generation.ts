"use server";

import { randomUUID } from "node:crypto";
import { generateMockMemes } from "@/lib/actions/memes";
import { createWorkspaceAdminClient } from "@/lib/workspace/auth";

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

type WorkspaceRow = {
  id: string;
  user_id: string | null;
  initial_prompt: string;
  business_summary: string | null;
  preview_generations_used: number;
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
  outputCount: number
): string {
  if (outputCount <= 0) {
    return "I could not map outputs from that pass. I can retry with a tighter brief or switch format.";
  }
  if (outputFormat === "vertical_slideshow") {
    return "I drafted a slideshow set. Next move: sharpen the hook, or spin this into image memes or text memes.";
  }
  if (outputFormat === "square_video") {
    return "I made a square video version. Want a funnier pass or a format switch?";
  }
  if (outputFormat === "square_text") {
    return "I made a text meme version. Want another one or a format switch?";
  }
  return "I made an image meme version. Want another one, a funnier pass, or a format switch?";
}

function completionUiPills(outputFormat: JobRow["output_format"]) {
  const base = [
    { label: "More ideas", message: "Give me another one in this direction.", kind: "action" as const },
    { label: "Make it funnier", message: "Keep the idea, but make it funnier.", kind: "action" as const },
    { label: "More niche", message: "Make this more niche for my target audience.", kind: "action" as const },
  ];
  if (outputFormat === "vertical_slideshow") {
    return [
      ...base.slice(0, 2),
      { label: "Image Meme", message: "Turn this into image memes.", kind: "format" as const },
      { label: "Text Meme", message: "Make text-only meme versions.", kind: "format" as const },
    ];
  }
  if (outputFormat === "square_video") {
    return [
      ...base.slice(0, 2),
      { label: "Slideshow", message: "Turn this into a slideshow.", kind: "format" as const },
      { label: "Text Meme", message: "Make text-only meme versions.", kind: "format" as const },
    ];
  }
  if (outputFormat === "square_text") {
    return [
      ...base.slice(0, 2),
      { label: "Image Meme", message: "Turn this into image memes.", kind: "format" as const },
      { label: "Video Meme", message: "Turn this into short square video memes.", kind: "format" as const },
    ];
  }
  return [
    ...base.slice(0, 2),
    { label: "Video Meme", message: "Turn this into short square video memes.", kind: "format" as const },
    { label: "Slideshow", message: "Turn this into a slideshow.", kind: "format" as const },
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

  const { data: existing } = await admin
    .schema("public")
    .from("generation_jobs")
    .select("id")
    .eq("workspace_id", workspaceId)
    .in("status", ["queued", "running"])
    .limit(1);
  if ((existing ?? []).length > 0) {
    return { jobId: null, error: "A generation is already in progress." };
  }

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
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

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
}) {
  const { job, workspace, generationRunId } = params;
  return generateMockMemes(job.prompt, {
    limit: job.requested_variant_count || 1,
    outputFormat: job.output_format ?? "square_text",
    generationRunIdOverride: generationRunId,
    workspaceContext: {
      allowAnonymousWrite: true,
      actorUserId: workspace.user_id,
      storagePathNamespace: workspace.id,
      workspaceId: workspace.id,
      profileOverride: {
        id: workspace.user_id ?? workspace.id,
        brand_name: "Mimly Workspace",
        what_you_do: workspace.business_summary ?? workspace.initial_prompt,
        audience: "social media audience",
        country: null,
        english_variant: "en-GB",
      },
    },
  });
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
    .select("id, user_id, initial_prompt, business_summary, preview_generations_used")
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

  try {
    const result = await runGenerationPlan({
      job,
      workspace: ws,
      generationRunId,
    });

    if (result.error) {
      await admin
        .schema("public")
        .from("generation_jobs")
        .update({
          status: "failed",
          error_message: result.error,
          generation_run_id: generationRunId,
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
          text: completionFollowupMessage(job.output_format, outputs.length),
          output_count: outputs.length,
          generation_job_id: job.id,
        } as Json,
        metadata: {
          output_format: job.output_format,
          follow_up_hint: true,
          ui_pills: completionUiPills(job.output_format),
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

    const existingJobMetadata =
      job.metadata && typeof job.metadata === "object"
        ? (job.metadata as Record<string, unknown>)
        : {};

    await admin
      .schema("public")
      .from("generation_jobs")
      .update({
        status: "completed",
        generation_run_id: generationRunId,
        metadata: {
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
          selected_template_id: selectedTemplateId,
          selected_template_slug: selectedTemplateSlug || null,
          based_on_job_id:
            existingJobMetadata.based_on_job_id ?? null,
          based_on_output_ids: Array.isArray(existingJobMetadata.based_on_output_ids)
            ? existingJobMetadata.based_on_output_ids
            : [],
          deferred_followup:
            Boolean(existingJobMetadata.deferred_followup) || false,
        } as Json,
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
              ? "Applying that refinement now."
              : "Running that next request now.";

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
            metadata: {
              workflow_mode: "single_output",
              output_format: followupOutputFormat,
              selection_strategy:
                followupOutputFormat === "square_text"
                  ? "square_text_open_variant"
                  : "random_template",
              selected_template_id: null,
              selected_template_slug: null,
              based_on_job_id: basedOnJobId,
              based_on_output_ids: basedOnOutputIds,
              deferred_followup: true,
              deferred_from_intent: deferredFromIntent,
            } as Json,
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
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return { ok: false, status: "failed", error: message };
  }
}
