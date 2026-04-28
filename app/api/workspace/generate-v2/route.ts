import { NextResponse } from "next/server";
import { generateFromInput } from "@/lib/generation/v2/core";

type GenerateV2Body = {
  workspaceId?: unknown;
  input?: unknown;
  outputFormat?: unknown;
};

export async function POST(request: Request) {
  let body: GenerateV2Body = {};
  try {
    body = (await request.json()) as GenerateV2Body;
  } catch {
    body = {};
  }

  const workspaceId = String(body.workspaceId ?? "").trim();
  const input = String(body.input ?? "").trim();
  const outputFormat = String(body.outputFormat ?? "").trim();

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required." }, { status: 400 });
  }
  if (!input) {
    return NextResponse.json({ error: "input is required." }, { status: 400 });
  }
  if (!outputFormat) {
    return NextResponse.json({ error: "outputFormat is required." }, { status: 400 });
  }

  try {
    const result = await generateFromInput({
      workspaceId,
      input,
      outputFormat: outputFormat as
        | "square_image"
        | "square_video"
        | "square_text",
    });
    return NextResponse.json({ success: true, result }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
