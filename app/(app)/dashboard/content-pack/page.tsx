import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/actions/profile";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ContentPackBatchPreview } from "@/components/dashboard/content-pack-batch-preview";
import { dashboardGenerationMode } from "@/lib/onboarding/generation-mode";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ContentPackPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; batch?: string }>;
}) {
  const sp = await searchParams;
  const run = sp.run?.trim() ?? "";
  const batchRaw = sp.batch;
  const batchNum: 1 | 2 | 3 =
    batchRaw === "2" ? 2 : batchRaw === "3" ? 3 : 1;

  if (!UUID_RE.test(run)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getProfile();
  const mode = dashboardGenerationMode(profile?.generation_mode);
  if (mode !== "content_pack") redirect("/dashboard");

  const { data: memes, error } = await supabase
    .schema("public")
    .from("generated_memes")
    .select(
      "id, title, format, top_text, bottom_text, post_caption, image_url, variant_metadata, created_at"
    )
    .eq("user_id", user.id)
    .eq("generation_run_id", run)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[content-pack] fetch memes", error);
    redirect("/dashboard");
  }

  const list = memes ?? [];
  if (list.length === 0) redirect("/dashboard");

  const packUnlocked = Boolean(profile?.content_pack_unlocked_at);

  const summaryByBatch = {
    1: {
      heading: "Your first batch is ready",
      subtext:
        "You've generated the first 12 posts in your 36-post content pack.",
    },
    2: {
      heading: "Your next batch is ready",
      subtext:
        "You've generated the next 12 posts in your 36-post content pack.",
    },
    3: {
      heading: "Your final batch is ready",
      subtext:
        "You've generated the final 12 posts in your 36-post content pack.",
    },
  } as const;

  const s = summaryByBatch[batchNum];
  const postsProgressLabel = `${batchNum * 12} of 36 posts generated`;

  return (
    <DashboardShell>
      <ContentPackBatchPreview
        memes={list}
        batch={batchNum}
        packUnlocked={packUnlocked}
        summaryHeading={s.heading}
        summarySubtext={s.subtext}
        postsProgressLabel={postsProgressLabel}
      />
    </DashboardShell>
  );
}
