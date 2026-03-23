import { createClient } from "@/lib/supabase/server";
import { linkAnonymousWorkspacesToUser } from "@/lib/workspace/auth";
import { getOrCreateDefaultWorkspaceForUser } from "@/lib/workspace/default-workspace";
import { NextResponse } from "next/server";

function isAllowedWorkspacePath(path: string): boolean {
  return /^\/workspace\/[0-9a-f-]+(?:\/settings)?$/i.test(path);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/workspace";

  const nextPath =
    next === "/dashboard" ||
    next === "/workspace" ||
    isAllowedWorkspacePath(next)
      ? next
      : "/workspace";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Re-create client after code exchange so subsequent queries
      // use the updated auth cookies/tokens.
      const supabaseAfter = await createClient();
      const {
        data: { user: linkedUser },
      } = await supabaseAfter.auth.getUser();
      if (linkedUser?.id) {
        await linkAnonymousWorkspacesToUser(linkedUser.id);
        if (nextPath === "/dashboard" || nextPath === "/workspace") {
          const workspaceId = await getOrCreateDefaultWorkspaceForUser(linkedUser.id);
          return NextResponse.redirect(new URL(`/workspace/${workspaceId}`, request.url));
        }
      }

      return NextResponse.redirect(new URL(nextPath, request.url));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth", request.url));
}
