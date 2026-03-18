import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type DraftProfile = {
  email: string;
  brand_name: string;
  what_you_do: string;
  audience: string;
  country: string;
};

type CleanResult = {
  clean: DraftProfile;
  needs_clarification: boolean;
  issues: string[];
};

function decodeDraft(draftB64: string): DraftProfile | null {
  try {
    const json = decodeURIComponent(
      Array.prototype.map
        .call(atob(draftB64), (c: string) => {
          return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join("")
    );
    const parsed = JSON.parse(json) as Partial<DraftProfile>;
    return {
      email: String(parsed.email ?? "").trim(),
      brand_name: String(parsed.brand_name ?? "").trim(),
      what_you_do: String(parsed.what_you_do ?? "").trim(),
      audience: String(parsed.audience ?? "").trim(),
      country: String(parsed.country ?? "").trim(),
    };
  } catch {
    return null;
  }
}

function basicIssues(draft: DraftProfile): string[] {
  const issues: string[] = [];
  const what = draft.what_you_do.toLowerCase();
  const aud = draft.audience.toLowerCase();

  if (draft.what_you_do.trim().length < 8) issues.push("What you sell is too short.");
  if (what.includes("idk") || what.includes("not sure")) issues.push("What you sell is unclear.");

  if (draft.audience.trim().length < 8) issues.push("Audience is too short.");
  if (aud.includes("everyone") || aud.includes("anyone")) issues.push("Audience is too broad.");
  if (aud.includes("all") && aud.includes("people")) issues.push("Audience is too broad.");

  return issues;
}

async function cleanWithOpenAI(draft: DraftProfile): Promise<CleanResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const issues = basicIssues(draft);
    return { clean: draft, needs_clarification: issues.length > 0, issues };
  }

  const prompt = `You are cleaning user onboarding inputs for a content generator.\n\nRules:\n- Do NOT invent facts. Only rewrite/normalize what the user wrote.\n- Fix obvious typos and make wording concise.\n- If either field is vague (e.g. audience = \"everyone\"), set needs_clarification=true and add specific issues.\n- Output JSON only.\n\nInput JSON:\n${JSON.stringify(draft)}\n\nReturn JSON with:\n{\n  \"clean\": {\"email\": string, \"brand_name\": string, \"what_you_do\": string, \"audience\": string, \"country\": string},\n  \"needs_clarification\": boolean,\n  \"issues\": string[]\n}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return only valid JSON. No markdown." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const issues = basicIssues(draft);
    return { clean: draft, needs_clarification: issues.length > 0, issues };
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content) as Partial<CleanResult>;

  const clean = (parsed.clean ?? {}) as Partial<DraftProfile>;
  const normalized: DraftProfile = {
    email: String(clean.email ?? draft.email).trim(),
    brand_name: String(clean.brand_name ?? draft.brand_name).trim(),
    what_you_do: String(clean.what_you_do ?? draft.what_you_do).trim(),
    audience: String(clean.audience ?? draft.audience).trim(),
    country: String(clean.country ?? draft.country).trim(),
  };

  const issues = Array.isArray(parsed.issues)
    ? parsed.issues.map((s) => String(s)).filter(Boolean)
    : basicIssues(normalized);

  const needs = Boolean(parsed.needs_clarification) || issues.length > 0;

  return { clean: normalized, needs_clarification: needs, issues };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/dashboard";
  const draftB64 = searchParams.get("draft");

  const allowedNext = new Set(["/dashboard", "/onboarding/complete"]);
  const nextPath = allowedNext.has(next) ? next : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (draftB64) {
        const draft = decodeDraft(draftB64);
        if (draft) {
          const cleaned = await cleanWithOpenAI(draft);
          if (cleaned.needs_clarification) {
            const params = new URLSearchParams();
            params.set("review", "1");
            params.set("issues", cleaned.issues.join(" "));
            params.set("email", cleaned.clean.email);
            params.set("brand_name", cleaned.clean.brand_name);
            params.set("what_you_do", cleaned.clean.what_you_do);
            params.set("audience", cleaned.clean.audience);
            params.set("country", cleaned.clean.country);
            return NextResponse.redirect(
              new URL(`/onboarding/manual?${params.toString()}`, request.url)
            );
          }

          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) {
            await supabase.from("profiles").upsert(
              {
                id: user.id,
                email: cleaned.clean.email || null,
                brand_name: cleaned.clean.brand_name || null,
                what_you_do: cleaned.clean.what_you_do || null,
                audience: cleaned.clean.audience || null,
                country: cleaned.clean.country || null,
                onboarding_completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              { onConflict: "id" }
            );
          }
        }
      }

      return NextResponse.redirect(new URL(nextPath, request.url));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth", request.url));
}
