type ExtractedMetadata = {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  h1?: string;
};

function pickMatch(html: string, regex: RegExp): string {
  const match = html.match(regex);
  return String(match?.[1] ?? "").trim();
}

export async function extractMetadata(url: string): Promise<ExtractedMetadata> {
  const target = String(url ?? "").trim();
  if (!target) {
    throw new Error("URL is required.");
  }

  const response = await fetch(target, {
    method: "GET",
    redirect: "follow",
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; MimlyBot/1.0)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL (${response.status}).`);
  }

  const html = await response.text();
  const title = pickMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = pickMatch(
    html,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i
  );
  const ogTitle = pickMatch(
    html,
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i
  );
  const ogDescription = pickMatch(
    html,
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i
  );
  const h1 = pickMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i).replace(/<[^>]*>/g, "");

  return {
    title,
    description,
    ogTitle,
    ogDescription,
    h1: h1 || undefined,
  };
}
