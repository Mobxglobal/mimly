"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, Images, Settings, Sparkles, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useDashboardGenerationMode } from "@/components/dashboard/dashboard-generation-context";

const NAV_SECTIONS = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Home", icon: LayoutGrid },
      { href: "/dashboard/memes", label: "Memes", icon: Images },
    ],
  },
  {
    label: "Configuration",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

export function DashboardShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const generationMode = useDashboardGenerationMode();
  const primaryCtaLabel =
    generationMode === "content_pack"
      ? "Generate your content pack"
      : "Create content";

  async function handleLogOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[#05070b] text-stone-100">
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
      />
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_28%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_22%),linear-gradient(180deg,#090b10_0%,#05070b_100%)]" />
      <div className="relative z-10 flex min-h-screen flex-col md:flex-row">
        <aside className="shrink-0 border-b border-white/8 bg-black/30 px-4 py-3 backdrop-blur-xl md:flex md:w-64 md:flex-col md:border-b-0 md:border-r md:border-r-white/8 md:px-4 md:py-5">
          <Link
            href="/"
            className="hidden shrink-0 transition-opacity hover:opacity-90 md:mb-5 md:block"
            aria-label="Mimly home"
          >
            <Image
              src="/Mimly_footer.png"
              alt="Mimly"
              width={88}
              height={26}
              className="h-6 w-auto"
            />
          </Link>
          <Link
            href={
              generationMode === "content_pack"
                ? "/dashboard/generating?mode=content_pack&batch=1"
                : "/dashboard/create"
            }
            className="cta-funky flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-3 py-2.5 text-sm font-medium text-white shadow-[0_10px_30px_rgba(99,102,241,0.35)] hover:bg-indigo-400 md:flex"
          >
            <Sparkles className="h-4 w-4" />
            {primaryCtaLabel}
          </Link>
          <div className="hidden md:mt-6 md:flex md:flex-col md:gap-5">
            {NAV_SECTIONS.map((section) => (
              <div key={section.label}>
                <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                  {section.label}
                </p>
                <div className="mt-2 flex flex-col gap-1">
                  {section.items.map((item) => {
                    const isActive =
                      item.href === "/dashboard"
                        ? pathname === "/dashboard"
                        : pathname.startsWith(item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-white/8 text-white"
                            : "text-stone-400 hover:bg-white/5 hover:text-stone-200"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-row items-center gap-2 overflow-x-auto md:hidden">
            {NAV_SECTIONS.flatMap((section) => section.items).map((item) => {
              const isActive =
                item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-stone-400 hover:bg-white/5 hover:text-stone-200"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </aside>

        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-white/8 bg-black/20 px-4 backdrop-blur-xl md:px-6">
            <Link
              href="/"
              className="flex items-center gap-2 hover:opacity-80 transition-opacity md:hidden"
              aria-label="Mimly home"
            >
              <Image
                src="/Mimly_footer.png"
                alt="Mimly"
                width={90}
                height={27}
                className="h-6 w-auto"
              />
            </Link>
            <div className="hidden md:block">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-stone-200">Home</p>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                  Free
                </span>
              </div>
              <p className="text-xs text-stone-500">Create and manage your memes.</p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/" className="text-sm font-medium text-stone-400 hover:text-white transition-colors">
                Back to home
              </Link>
              <button
                type="button"
                onClick={handleLogOut}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-stone-400 hover:bg-white/5 hover:text-stone-200 transition-colors"
                aria-label="Log out"
              >
                <LogOut className="h-3.5 w-3.5" />
                Log out
              </button>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
