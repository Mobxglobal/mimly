import { createClient } from "@/lib/supabase/server";
import {
  createWorkspaceAdminClient,
  ensureWorkspaceToken,
  hashWorkspaceToken,
} from "@/lib/workspace/auth";
import { getOrCreateDefaultWorkspaceForUser } from "@/lib/workspace/default-workspace";

/**
 * Homepage/session bootstrap only — keep separate from `lib/actions/workspace.ts`
 * so API routes do not pull in meme renderers (canvas/sharp) during Next build.
 */
export async function bootstrapHomepageWorkspace(
  sessionId?: string | null
): Promise<{ workspaceId: string; reused: boolean }> {
  console.log("[bootstrap] step: ensure workspace token");
  const token = await ensureWorkspaceToken();
  const tokenHash = hashWorkspaceToken(token);

  console.log("[bootstrap] step: admin client");
  const admin = createWorkspaceAdminClient();
  const nowIso = new Date().toISOString();

  console.log("[bootstrap] step: load auth user");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const sid =
    sessionId != null && typeof sessionId === "string"
      ? sessionId.trim()
      : "";

  if (user?.id) {
    console.log("[bootstrap] step: get or create default workspace (authenticated)");
    const workspaceId = await getOrCreateDefaultWorkspaceForUser(user.id, sid || null);
    console.log("[bootstrap] workspace created/reused", {
      workspaceId,
      reused: true,
      actor: "authenticated",
      sessionId: sid || null,
    });
    return { workspaceId, reused: true };
  }

  if (sid) {
    console.log("[bootstrap] step: anonymous session workspace lookup");
    const { data: sessionWorkspace, error: lookupError } = await admin
      .schema("public")
      .from("workspaces")
      .select("id")
      .eq("anon_token_hash", tokenHash)
      .eq("session_id", sid)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      console.error("[bootstrap] session workspace lookup failed:", lookupError);
      throw new Error(
        typeof lookupError === "string"
          ? lookupError
          : lookupError?.message || JSON.stringify(lookupError)
      );
    }

    if (sessionWorkspace?.id) {
      const workspaceId = String(sessionWorkspace.id);
      console.log("[bootstrap] workspace created/reused", {
        workspaceId,
        reused: true,
        actor: "anonymous",
        sessionId: sid,
      });
      return { workspaceId, reused: true };
    }
  }

  console.log("[bootstrap] step: insert new anonymous workspace");
  const insertPayload = {
    user_id: null as string | null,
    anon_token_hash: tokenHash,
    session_id: sid ? sid : null,
    initial_prompt: "",
    business_url: null as string | null,
    business_summary: "",
    detected_content_type: "meme" as const,
    status: "active" as const,
    preview_generations_used: 0,
    last_message_at: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
  };
  console.log("[bootstrap] workspace insert payload:", {
    session_id: insertPayload.session_id,
    initial_prompt: insertPayload.initial_prompt,
    business_url: insertPayload.business_url,
  });

  const { data: createdWorkspace, error } = await admin
    .schema("public")
    .from("workspaces")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error || !createdWorkspace?.id) {
    console.error("[bootstrap] workspace insert failed:", error);
    if (error) {
      throw new Error(
        typeof error === "string"
          ? error
          : error?.message || JSON.stringify(error)
      );
    }
    throw new Error("Workspace insert returned no row id");
  }

  const workspaceId = String(createdWorkspace.id);
  if (!workspaceId) {
    throw new Error("Workspace creation returned no ID");
  }
  console.log("[bootstrap] workspace created/reused", {
    workspaceId,
    reused: false,
    actor: "anonymous",
    sessionId: sid || null,
  });
  return { workspaceId, reused: false };
}
