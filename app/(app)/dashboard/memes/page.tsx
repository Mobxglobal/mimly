import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

const ACCENTS = [
  "from-indigo-500/30 via-sky-500/10 to-transparent",
  "from-emerald-500/25 via-transparent to-transparent",
  "from-amber-500/20 via-orange-500/10 to-transparent",
];

function getDownloadHref(title: string, topText: string | null, bottomText: string | null) {
  const top = (topText ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/&/g, "&amp;");
  const bottom = (bottomText ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/&/g, "&amp;");
  const safeTitle = (title ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/&/g, "&amp;");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="100%" stop-color="#111827" />
        </linearGradient>
      </defs>
      <rect width="1080" height="1080" rx="44" fill="url(#bg)" />
      <rect x="40" y="40" width="1000" height="1000" rx="32" fill="#020617" stroke="#334155" />
      <text x="540" y="146" text-anchor="middle" fill="#f8fafc" font-family="Arial, Helvetica, sans-serif" font-size="48" font-weight="700">${top}</text>
      <text x="540" y="944" text-anchor="middle" fill="#e2e8f0" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="700">${bottom}</text>
      <text x="540" y="540" text-anchor="middle" fill="#64748b" font-family="Arial, Helvetica, sans-serif" font-size="36">${safeTitle}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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

  return (
    <DashboardShell>
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
              Your memes are ready
            </h1>
            <p className="mt-1 text-sm text-stone-400">
              Review your generated set and download the ones you want to post.
            </p>
          </div>
          <span className="rounded-full border border-emerald-400/20 bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
            {list.length} meme{list.length !== 1 ? "s" : ""} generated
          </span>
        </div>

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
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {list.map((meme, index) => {
              const accent = ACCENTS[index % ACCENTS.length];
              const topText = meme.top_text ?? "";
              const bottomText = meme.bottom_text ?? "";
              const title = meme.title ?? "Meme";
              return (
                <div
                  key={meme.id}
                  className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl"
                >
                  <div
                    className={`relative aspect-square w-full bg-gradient-to-br ${accent} p-5`}
                  >
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_26%)]" />
                    <div className="relative flex h-full flex-col justify-between">
                      <div className="flex items-start justify-between gap-3">
                        <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-stone-300">
                          {meme.format ?? "Meme"}
                        </span>
                      </div>
                      <div className="space-y-3">
                        <p className="max-w-[18ch] text-lg font-semibold leading-tight text-white sm:text-xl">
                          {topText}
                        </p>
                        <p className="max-w-[22ch] text-sm leading-relaxed text-stone-300">
                          {bottomText}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-white/10 bg-black/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-semibold text-white">{title}</h2>
                        <p className="mt-1 text-xs text-stone-300">
                          {meme.image_url ? "Image ready" : "1080 x 1080 meme export"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-col gap-3">
                      <a
                        href={getDownloadHref(title, topText, bottomText)}
                        download={`${meme.id}.svg`}
                        className="cta-funky inline-flex items-center justify-center rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white shadow-[0_10px_30px_rgba(99,102,241,0.35)] hover:bg-indigo-400"
                      >
                        Download meme
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
