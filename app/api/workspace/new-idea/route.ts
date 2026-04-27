import { NextResponse } from "next/server";
import { processWorkspaceHomepageIntent } from "@/lib/actions/workspace";

type Body = {
  workspaceId?: string;
  inputType?: "prompt" | "url";
  prompt?: string;
  url?: string;
  preferredOutputFormat?:
    | "square_image"
    | "square_video"
    | "vertical_slideshow"
    | "square_text";
  templateFamilyPreference?: "engagement_text" | null;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const workspaceId = String(body.workspaceId ?? "").trim();
  const inputType = body.inputType === "url" ? "url" : "prompt";
  const value = String(inputType === "url" ? body.url ?? "" : body.prompt ?? "").trim();

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required." }, { status: 400 });
  }
  if (!value) {
    return NextResponse.json(
      { error: inputType === "url" ? "url is required." : "prompt is required." },
      { status: 400 }
    );
  }

  const result = await processWorkspaceHomepageIntent(workspaceId, inputType, value, {
    preferredOutputFormat: body.preferredOutputFormat,
    templateFamilyPreference: body.templateFamilyPreference ?? null,
  });
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
