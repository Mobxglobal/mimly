import { NextResponse } from "next/server";
import { bootstrapHomepageWorkspace } from "@/lib/actions/workspace";

export async function POST() {
  const startedAt = Date.now();
  const result = await bootstrapHomepageWorkspace();
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
