import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { MemeResultsSection } from "@/components/dashboard/meme-results-section";
import { generateMoreMemes } from "@/lib/actions/memes";

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

  async function handleGenerateMore() {
    "use server";

    const { error } = await generateMoreMemes();
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
          <MemeResultsSection memes={list} onGenerateMore={handleGenerateMore} />
        )}
      </div>
    </DashboardShell>
  );
}
