import { NextResponse } from "next/server";
import {
  getImplicitNewIdeaText,
  processWorkspaceHomepageIntent,
} from "@/lib/actions/workspace";

type HomepageIntentBody = {
  preferredOutputFormat?:
    | "square_image"
    | "square_video"
    | "vertical_slideshow"
    | "square_text";
  templateFamilyPreference?: "engagement_text" | null;
};

function pickString(
  body: Record<string, unknown>,
  keys: string[]
): string {
  for (const key of keys) {
    const v = body[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function pickWorkspaceId(body: Record<string, unknown>): string {
  return pickString(body, ["workspaceId", "workspace_id", "id"]);
}

function inferInputType(body: Record<string, unknown>): "prompt" | "url" {
  const explicit = body.inputType;
  if (explicit === "url") return "url";
  if (explicit === "prompt") return "prompt";

  const urlish = pickString(body, ["url", "website", "link", "href"]);
  const promptish = pickString(body, [
    "prompt",
    "input",
    "text",
    "message",
    "value",
  ]);

  if (urlish && !promptish) return "url";
  if (!urlish && promptish) return "prompt";
  if (urlish && promptish) {
    return /^https?:\/\//i.test(urlish) ? "url" : "prompt";
  }
  return "prompt";
}

function resolveValue(
  inputType: "prompt" | "url",
  body: Record<string, unknown>
): string {
  if (inputType === "url") {
    return pickString(body, [
      "url",
      "website",
      "link",
      "href",
      "prompt",
      "input",
      "text",
      "value",
    ]);
  }
  return pickString(body, [
    "prompt",
    "input",
    "text",
    "message",
    "value",
    "url",
  ]);
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const workspaceIdEarly = pickWorkspaceId(body);
  console.log("[new-idea] request received", {
    workspaceId: workspaceIdEarly || null,
    timestamp: Date.now(),
  });

  console.log("[new-idea] raw body:", JSON.stringify(body));

  const workspaceId = workspaceIdEarly;
  let inputType = inferInputType(body);
  let value = resolveValue(inputType, body);

  const promptFromBody =
    (typeof body.prompt === "string" && body.prompt) ||
    (typeof body.input === "string" && body.input) ||
    (typeof body.text === "string" && body.text) ||
    (typeof body.message === "string" && body.message) ||
    (typeof body.value === "string" && body.value) ||
    "";

  if (!value && promptFromBody.trim()) {
    value = promptFromBody.trim();
    if (inputType !== "url" && /^https?:\/\//i.test(value)) {
      inputType = "url";
    }
  }

  const options: HomepageIntentBody = {
    preferredOutputFormat:
      typeof body.preferredOutputFormat === "string"
        ? (body.preferredOutputFormat as HomepageIntentBody["preferredOutputFormat"])
        : undefined,
    templateFamilyPreference:
      body.templateFamilyPreference === "engagement_text"
        ? "engagement_text"
        : body.templateFamilyPreference === null
          ? null
          : undefined,
  };

  if (!workspaceId) {
    console.error("[new-idea] 400: missing workspaceId", {
      reason: "workspaceId/workspace_id/id missing or empty after trim",
      body,
      derived: { workspaceId, inputType, value },
    });
    return NextResponse.json({ error: "workspaceId is required." }, { status: 400 });
  }

  if (!value) {
    const implicit = await getImplicitNewIdeaText(workspaceId);
    if (implicit.error) {
      console.error("[new-idea] 400: implicit workspace text failed", {
        reason: implicit.error,
        body,
        workspaceId,
      });
      return NextResponse.json({ error: implicit.error }, { status: 400 });
    }
    if (implicit.text?.trim()) {
      const t = implicit.text.trim();
      value = t;
      inputType = /^https?:\/\//i.test(t) ? "url" : "prompt";
    }
  }

  console.log("[new-idea] parsed:", {
    workspaceId: workspaceId || "(empty)",
    inputType,
    promptFromBodyPreview: String(promptFromBody).slice(0, 120),
    valueLength: value.length,
    valuePreview: value.slice(0, 120),
    preferredOutputFormat: options.preferredOutputFormat ?? null,
    templateFamilyPreference: options.templateFamilyPreference ?? null,
    contentType: request.headers.get("content-type"),
  });

  if (!value) {
    const fieldHint =
      inputType === "url"
        ? "url (or website/link/href, or prompt/input/text/value as fallback)"
        : "prompt (or input/text/message/value), or workspace initial_prompt/business_summary/business_url";
    console.error("[new-idea] 400: missing content value", {
      reason: `no non-empty string found for ${fieldHint}`,
      body,
      derived: { workspaceId, inputType, value },
    });
    return NextResponse.json(
      {
        error:
          inputType === "url"
            ? "url is required."
            : "prompt is required.",
      },
      { status: 400 }
    );
  }

  const result = await processWorkspaceHomepageIntent(
    workspaceId,
    inputType,
    value,
    {
      preferredOutputFormat: options.preferredOutputFormat,
      templateFamilyPreference: options.templateFamilyPreference ?? null,
    }
  );

  console.log("[new-idea] intent result:", {
    success: !result?.error,
    error: result?.error || null,
  });

  if (result?.error) {
    console.error("[new-idea] 400: processWorkspaceHomepageIntent failed", {
      reason: result.error,
      workspaceId,
      inputType,
      valuePreview: typeof value === "string" ? value.slice(0, 120) : null,
    });

    return NextResponse.json(
      { error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
