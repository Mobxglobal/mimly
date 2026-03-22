import { createClient } from "@/lib/supabase/server";
import { normalizeGenerationMode } from "@/lib/onboarding/generation-mode";
import { NextResponse } from "next/server";

type DraftBody = {
  email: string;
  brand_name: string;
  what_you_do: string;
  audience: string;
  country: string;
  generation_mode?: string | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; draft?: Partial<DraftBody> };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const draft = body.draft;

    if (!email || !draft) {
      return NextResponse.json({ error: "email and draft required" }, { status: 400 });
    }

    const mode = normalizeGenerationMode(draft.generation_mode);

    const normalized = {
      email,
      brand_name: String(draft.brand_name ?? "").trim(),
      what_you_do: String(draft.what_you_do ?? "").trim(),
      audience: String(draft.audience ?? "").trim(),
      country: String(draft.country ?? "").trim(),
      ...(mode ? { generation_mode: mode } : {}),
    };

    const supabase = await createClient();
    const { error } = await supabase.from("onboarding_drafts").upsert(
      { email, draft: normalized, created_at: new Date().toISOString() },
      { onConflict: "email" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
