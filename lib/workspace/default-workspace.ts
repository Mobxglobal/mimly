import { createWorkspaceAdminClient } from "@/lib/workspace/auth";

const DEFAULT_WORKSPACE_PROMPT = "Help me create memes for my business.";

export async function getOrCreateDefaultWorkspaceForUser(
  userId: string,
  sessionId?: string | null
): Promise<string> {
  const admin = createWorkspaceAdminClient();
  const sid = typeof sessionId === "string" ? sessionId.trim() : "";

  let existingQuery = admin
    .schema("public")
    .from("workspaces")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active");

  if (sid) {
    existingQuery = existingQuery.eq("session_id", sid);
  } else {
    existingQuery = existingQuery.is("session_id", null);
  }

  const { data: existing } = await existingQuery
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) return String(existing.id);

  const nowIso = new Date().toISOString();
  const { data: created, error } = await admin
    .schema("public")
    .from("workspaces")
    .insert({
      user_id: userId,
      anon_token_hash: null,
      session_id: sid || null,
      initial_prompt: DEFAULT_WORKSPACE_PROMPT,
      business_summary: DEFAULT_WORKSPACE_PROMPT,
      detected_content_type: "meme",
      status: "active",
      preview_generations_used: 0,
      last_message_at: nowIso,
      linked_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .single();

  if (error || !created?.id) {
    throw new Error(error?.message ?? "Failed to create default workspace.");
  }

  return String(created.id);
}
