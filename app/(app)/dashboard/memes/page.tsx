import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { MemeResultsSection } from "@/components/dashboard/meme-results-section";
import { generateMoreMemes } from "@/lib/actions/memes";

type OutputFormat = "square_image" | "square_video";

function getFormatFromVariantMetadata(value: unknown): OutputFormat | null {
  if (!value || typeof value !== "object") return null;
  const record = value as {
    output_format?: unknown;
    requested_output_format?: unknown;
    media_type?: unknown;
  };

  const outputFormat = String(
    record.output_format ?? record.requested_output_format ?? ""
  )
    .trim()
    .toLowerCase();
  if (outputFormat === "square_video" || outputFormat === "square_image") {
    return outputFormat;
  }

  const mediaType = String(record.media_type ?? "")
    .trim()
    .toLowerCase();
  if (mediaType === "video") return "square_video";
  if (mediaType === "image") return "square_image";

  return null;
}

function getFormatFromAssetUrl(url: unknown): OutputFormat | null {
  const value = String(url ?? "").trim();
  if (!value) return null;
  if (/\.(mp4|webm|m4v)(\?|#|$)/i.test(value)) return "square_video";
  return "square_image";
}

function inferDefaultContinuationFormat(memes: any[]): OutputFormat {
  const mostRecent = memes[0];
  if (!mostRecent) return "square_image";

  return (
    getFormatFromVariantMetadata(mostRecent.variant_metadata) ??
    getFormatFromAssetUrl(mostRecent.image_url) ??
    "square_image"
  );
}

export default async function MemesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memes } = await supabase
    .from("generated_memes")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const list = memes ?? [];
  const defaultContinuationFormat = inferDefaultContinuationFormat(list);

  async function handleGenerateMoreDefault() {
    "use server";

    const { error } = await generateMoreMemes(defaultContinuationFormat);
    if (error) {
      console.error("[memes-page] Generate more failed", { error });
    }
    redirect("/dashboard/memes");
  }

  async function handleGenerateMoreImages() {
    "use server";

    const { error } = await generateMoreMemes("square_image");
    if (error) {
      console.error("[memes-page] Generate more failed", { error });
    }
    redirect("/dashboard/memes");
  }

  async function handleGenerateMoreVideos() {
    "use server";

    const { error } = await generateMoreMemes("square_video");
    if (error) {
      console.error("[memes-page] Generate more failed", { error });
    }
    redirect("/dashboard/memes");
  }

  return (
    <DashboardShell>
      <div className="mx-auto w-full max-w-6xl">
        {list.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center">
            <p className="text-stone-400">No memes yet. Create your first set.</p>
            <Link
              href="/dashboard/create"
              className="cta-funky mt-4 inline-flex rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-400"
            >
              Create memes
            </Link>
          </div>
        ) : (
          <MemeResultsSection
            memes={list}
            defaultContinuationFormat={defaultContinuationFormat}
            onGenerateMore={handleGenerateMoreDefault}
            onGenerateMoreImages={handleGenerateMoreImages}
            onGenerateMoreVideos={handleGenerateMoreVideos}
          />
        )}
      </div>
    </DashboardShell>
  );
}
