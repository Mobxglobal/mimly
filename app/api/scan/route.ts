import { NextResponse } from "next/server";

type ScanRequest = { website: string };
type ScanResult = {
  brand_name: string;
  what_you_do: string;
  audience: string;
  country?: string;
};

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function callOpenAI(prompt: string): Promise<ScanResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

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
        {
          role: "system",
          content:
            "You extract onboarding fields from website text. Return ONLY valid JSON with keys: brand_name, what_you_do, audience, country. Keep values short, concrete, and based on evidence. If unsure, set country to empty string.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error: ${res.status} ${text}`);
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content ?? "";
  const parsed = JSON.parse(content) as Partial<ScanResult>;

  return {
    brand_name: String(parsed.brand_name ?? "").trim(),
    what_you_do: String(parsed.what_you_do ?? "").trim(),
    audience: String(parsed.audience ?? "").trim(),
    country: String(parsed.country ?? "").trim(),
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ScanRequest>;
    const website = normalizeUrl(body.website ?? "");
    if (!website) {
      return NextResponse.json({ error: "Missing website" }, { status: 400 });
    }

    const htmlRes = await fetch(website, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; MimlyBot/1.0; +https://mimly.ai)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!htmlRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch website (${htmlRes.status})` },
        { status: 400 }
      );
    }

    const html = await htmlRes.text();
    const text = stripHtmlToText(html).slice(0, 12000);

    const extracted = await callOpenAI(
      `Website URL: ${website}\n\nWebsite text (may be truncated):\n${text}`
    );

    return NextResponse.json({ website, extracted });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

