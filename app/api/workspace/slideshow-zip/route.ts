import JSZip from "jszip";
import { createWorkspaceAdminClient, resolveWorkspaceAccessContext } from "@/lib/workspace/auth";

type SlideMeta = {
  image_url?: unknown;
};

function extensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split("/").pop() ?? "";
    const ext = last.includes(".") ? last.split(".").pop() ?? "png" : "png";
    const normalized = ext.toLowerCase().trim();
    return normalized || "png";
  } catch {
    return "png";
  }
}

function parseSlideUrls(variantMetadata: unknown): string[] {
  const meta =
    variantMetadata && typeof variantMetadata === "object"
      ? (variantMetadata as Record<string, unknown>)
      : null;
  if (!meta) return [];
  const outputFormat = String(meta.output_format ?? "").trim().toLowerCase();
  if (outputFormat !== "vertical_slideshow") return [];
  const slides = Array.isArray(meta.slides) ? (meta.slides as SlideMeta[]) : [];
  return slides
    .map((slide) =>
      slide && typeof slide === "object" ? String(slide.image_url ?? "").trim() : ""
    )
    .filter(Boolean);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const workspaceId = String(searchParams.get("workspaceId") ?? "").trim();
  const outputId = String(searchParams.get("outputId") ?? "").trim();

  if (!workspaceId || !outputId) {
    return new Response("Missing workspaceId or outputId.", { status: 400 });
  }

  const admin = createWorkspaceAdminClient();
  const { data: workspace, error: workspaceError } = await admin
    .schema("public")
    .from("workspaces")
    .select("id, user_id, anon_token_hash")
    .eq("id", workspaceId)
    .single();

  if (workspaceError || !workspace) {
    return new Response("Workspace not found.", { status: 404 });
  }

  const access = await resolveWorkspaceAccessContext({
    user_id: workspace.user_id,
    anon_token_hash: workspace.anon_token_hash,
  });
  if (!access.allowed) {
    return new Response("Access denied.", { status: 403 });
  }

  const { data: outputLink } = await admin
    .schema("public")
    .from("generation_job_outputs")
    .select("generated_meme_id, generation_job_id")
    .eq("generated_meme_id", outputId)
    .limit(1)
    .maybeSingle();

  if (!outputLink?.generation_job_id) {
    return new Response("Output not found.", { status: 404 });
  }

  const { data: job } = await admin
    .schema("public")
    .from("generation_jobs")
    .select("id")
    .eq("id", outputLink.generation_job_id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!job?.id) {
    return new Response("Output does not belong to this workspace.", {
      status: 403,
    });
  }

  const { data: meme } = await admin
    .schema("public")
    .from("generated_memes")
    .select("id, variant_metadata")
    .eq("id", outputId)
    .maybeSingle();
  if (!meme?.id) {
    return new Response("Output not found.", { status: 404 });
  }

  const slideUrls = parseSlideUrls(meme.variant_metadata);
  if (slideUrls.length === 0) {
    return new Response("No slideshow slides found for this output.", {
      status: 400,
    });
  }

  const zip = new JSZip();
  const downloadResults = await Promise.allSettled(
    slideUrls.map(async (slideUrl, index) => {
      const res = await fetch(slideUrl);
      if (!res.ok) {
        throw new Error(`Slide ${index + 1} fetch failed.`);
      }
      const bytes = await res.arrayBuffer();
      const ext = extensionFromUrl(slideUrl);
      const fileName = `slide-${String(index + 1).padStart(2, "0")}.${ext}`;
      zip.file(fileName, bytes);
    })
  );

  const failed = downloadResults.filter((result) => result.status === "rejected");
  if (failed.length > 0) {
    return new Response("Could not fetch all slides for zip download.", {
      status: 502,
    });
  }

  const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });
  return new Response(zipBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="mimly-${outputId}-slides.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
