import { NextResponse } from "next/server";
import { bootstrapHomepageWorkspace } from "@/lib/actions/workspace";

export async function POST(request: Request) {
  try {
    console.log("[bootstrap] step: parsing input");
    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
    console.log("[bootstrap] request received:", JSON.stringify(body));

    const session_id =
      body.session_id && typeof body.session_id === "string"
        ? body.session_id.trim() || null
        : null;

    const prompt =
      typeof body.prompt === "string" && body.prompt.trim()
        ? body.prompt.trim()
        : "";
    const url =
      typeof body.url === "string" && body.url.trim() ? body.url.trim() : "";

    console.log("[bootstrap] step: validating optional fields");
    if (!prompt && !url) {
      console.warn(
        "[bootstrap] missing input: no prompt or url in body (expected for session-only homepage bootstrap)"
      );
    }

    console.log("[bootstrap] insert payload:", {
      session_id,
      prompt: prompt || null,
      url: url || null,
    });

    console.log("[bootstrap] step: creating workspace");
    const startedAt = Date.now();
    const result = await bootstrapHomepageWorkspace(session_id);

    if (!result) {
      console.error("[bootstrap] invalid result:", result);
      throw new Error("Invalid workspace result");
    }

    if (!result.workspaceId) {
      throw new Error("Workspace creation returned no ID");
    }

    console.log("[bootstrap] success:", {
      workspaceId: result.workspaceId,
      reused: result.reused,
    });

    return NextResponse.json(
      {
        workspaceId: result.workspaceId,
        reused: result.reused,
        elapsedMs: Date.now() - startedAt,
      },
      { status: 200 }
    );
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : JSON.stringify(err);

    console.error("[bootstrap] fatal error:", {
      message,
      raw: err,
    });

    return NextResponse.json(
      {
        error: "Bootstrap failed",
        message,
      },
      { status: 500 }
    );
  }
}
