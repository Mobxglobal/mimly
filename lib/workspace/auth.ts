import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";

export const WORKSPACE_TOKEN_COOKIE = "mimly_ws_token";

export function generateWorkspaceToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashWorkspaceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function getWorkspaceTokenFromCookie(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(WORKSPACE_TOKEN_COOKIE)?.value?.trim() ?? "";
  return value || null;
}

export async function setWorkspaceTokenCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(WORKSPACE_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function ensureWorkspaceToken(): Promise<string> {
  const existing = await getWorkspaceTokenFromCookie();
  if (existing) return existing;
  const token = generateWorkspaceToken();
  await setWorkspaceTokenCookie(token);
  return token;
}

export function createWorkspaceAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error("Missing Supabase service-role env for workspace actions.");
  }
  return createSupabaseAdminClient(url, serviceRole, {
    auth: { persistSession: false },
  });
}

export async function resolveWorkspaceAccessContext(workspace: {
  user_id: string | null;
  anon_token_hash: string | null;
}): Promise<{ allowed: boolean; currentUserId: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const currentUserId = user?.id ?? null;

  if (currentUserId && workspace.user_id === currentUserId) {
    return { allowed: true, currentUserId };
  }

  const rawToken = await getWorkspaceTokenFromCookie();
  if (!rawToken || !workspace.anon_token_hash) {
    return { allowed: false, currentUserId };
  }

  const tokenHash = hashWorkspaceToken(rawToken);
  return {
    allowed: tokenHash === workspace.anon_token_hash,
    currentUserId,
  };
}

export async function linkAnonymousWorkspacesToUser(userId: string): Promise<void> {
  const token = await getWorkspaceTokenFromCookie();
  if (!token) return;
  const tokenHash = hashWorkspaceToken(token);
  const admin = createWorkspaceAdminClient();
  await admin
    .schema("public")
    .from("workspaces")
    .update({
      user_id: userId,
      linked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("anon_token_hash", tokenHash)
    .is("user_id", null);
}
