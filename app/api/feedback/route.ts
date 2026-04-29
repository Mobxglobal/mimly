import { NextResponse } from "next/server";
import { createWorkspaceAdminClient } from "@/lib/workspace/auth";

type FeedbackBody = {
  workspaceId?: string;
  sessionId?: string;
  postability?: "yes" | "tweak" | "no" | null;
  blocker?: "quality" | "control" | "formats" | "not_for_me" | null;
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
    if (
      body.postability != null &&
      body.postability !== "yes" &&
      body.postability !== "tweak" &&
      body.postability !== "no"
    ) {
      return NextResponse.json(
        { error: "postability must be yes, tweak, or no." },
        { status: 400 }
      );
    }
    if (
      body.blocker != null &&
      body.blocker !== "quality" &&
      body.blocker !== "control" &&
      body.blocker !== "formats" &&
      body.blocker !== "not_for_me"
    ) {
      return NextResponse.json(
        { error: "blocker must be quality, control, formats, or not_for_me." },
        { status: 400 }
      );
    }

    const admin = createWorkspaceAdminClient();
    const userAgent = request.headers.get("user-agent");
    const { error } = await admin.schema("public").from("mimly_feedback").insert({
      workspace_id: workspaceId,
      session_id: sessionId,
      postability: body.postability ?? null,
      blocker: body.blocker ?? null,
      was_content_good: false,
      would_use_again: false,
      looks_like_ai_slop: "not_really",
      user_agent: userAgent,
      source: "workspace_modal",
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
