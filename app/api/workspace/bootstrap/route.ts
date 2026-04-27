import { NextResponse } from "next/server";
import { bootstrapHomepageWorkspace } from "@/lib/actions/workspace";

export async function POST(request: Request) {
  let sessionId: string | null = null;
  try {
    const body = (await request.json()) as { session_id?: unknown };
    if (typeof body.session_id === "string" && body.session_id.trim()) {
      sessionId = body.session_id.trim();
    }
  } catch {
    /* empty body */
  }

  console.log("[workspace] session_id:", sessionId);

  const startedAt = Date.now();
  const result = await bootstrapHomepageWorkspace(sessionId);
  if (result.error || !result.workspaceId) {
    return NextResponse.json(
      { error: result.error ?? "Failed to bootstrap workspace." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      workspaceId: result.workspaceId,
      reused: result.reused,
      elapsedMs: Date.now() - startedAt,
    },
    { status: 200 }
  );
}
