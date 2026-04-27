import { NextResponse } from "next/server";
import { createWorkspaceAdminClient } from "@/lib/workspace/auth";

type FeedbackBody = {
  workspaceId?: string;
  sessionId?: string;
  wasContentGood?: boolean;
  wouldUseAgain?: boolean;
  looksLikeAiSlop?: "not_really" | "a_bit";
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FeedbackBody;
    const sessionId = String(body.sessionId ?? "").trim();
    const workspaceId =
      typeof body.workspaceId === "string" ? body.workspaceId.trim() : null;

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
    }
    if (typeof body.wasContentGood !== "boolean") {
      return NextResponse.json(
        { error: "wasContentGood must be boolean." },
        { status: 400 }
      );
    }
    if (typeof body.wouldUseAgain !== "boolean") {
      return NextResponse.json(
        { error: "wouldUseAgain must be boolean." },
        { status: 400 }
      );
    }
    if (body.looksLikeAiSlop !== "not_really" && body.looksLikeAiSlop !== "a_bit") {
      return NextResponse.json(
        { error: "looksLikeAiSlop must be not_really or a_bit." },
        { status: 400 }
      );
    }

    const admin = createWorkspaceAdminClient();
    const userAgent = request.headers.get("user-agent");
    const { error } = await admin.schema("public").from("mimly_feedback").insert({
      workspace_id: workspaceId,
      session_id: sessionId,
      was_content_good: body.wasContentGood,
      would_use_again: body.wouldUseAgain,
      looks_like_ai_slop: body.looksLikeAiSlop,
      user_agent: userAgent,
      source: "beta_gate",
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
