import Image from "next/image";
import Link from "next/link";
import { Sparkles, Images } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export default function DashboardPage() {
  return (
    <DashboardShell>
      <div className="mx-auto w-full max-w-6xl">
        {/* Hero */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            What are you going to create today?
          </h1>
          <p className="mt-2 text-sm text-stone-400 sm:text-base">
            Start a new meme or slideshow, or pick up where you left off.
          </p>
        </div>

        {/* Primary actions */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
          <Link
            href="/dashboard/create"
            className="flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-6 py-3.5 text-sm font-medium text-white shadow-[0_10px_30px_rgba(99,102,241,0.35)] transition-colors hover:bg-indigo-400"
          >
            <Sparkles className="h-4 w-4" />
            Create meme or slideshow
          </Link>
          <Link
            href="/dashboard/memes"
            className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-6 py-3.5 text-sm font-medium text-stone-200 transition-colors hover:bg-white/[0.1] hover:text-white"
          >
            <Images className="h-4 w-4" />
            View my memes
          </Link>
        </div>

        {/* Help strip */}
        <div className="mt-12 rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:p-4">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/5">
              <Image
                src="/founder/mLwsIoTp_400x400.jpg"
                alt="Alex Attinger"
                fill
                sizes="48px"
                className="object-cover"
              />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Got a question?</p>
              <p className="text-xs text-stone-500">
                Ask about strategy or getting better results.
              </p>
            </div>
          </div>
          <a
            href="https://x.com/alexattinger"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-stone-300 transition-colors hover:bg-white/[0.06] hover:text-white sm:mt-0"
          >
            Message Alex on X
          </a>
        </div>
      </div>
    </DashboardShell>
  );
}
