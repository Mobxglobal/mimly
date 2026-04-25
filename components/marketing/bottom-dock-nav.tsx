"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Images,
  Sparkles,
  CreditCard,
  HelpCircle,
  LogIn,
} from "lucide-react";
import { cn } from "@/lib/utils";

const DOCK_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/#gallery", label: "Gallery", icon: Images },
  { href: "/#features-heading", label: "Features", icon: Sparkles },
  { href: "/pricing", label: "Pricing", icon: CreditCard },
  { href: "/faq", label: "FAQ", icon: HelpCircle },
  { href: "/login", label: "Login", icon: LogIn },
];

export function BottomDockNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2"
      aria-label="Bottom navigation"
    >
      <div className="flex items-center gap-1 rounded-2xl border border-white/20 bg-white/40 px-3 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.08)] backdrop-blur-xl sm:gap-2 sm:px-4 sm:py-3">
        {DOCK_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href.replace(/#.*/, ""));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-center rounded-xl p-3 text-neutral-500 transition-all duration-200 hover:scale-110 hover:text-neutral-600 sm:p-3.5",
                isActive && "bg-white/60 text-neutral-600 shadow-sm"
              )}
              title={item.label}
              aria-label={item.label}
            >
              <Icon className="h-7 w-7 sm:h-8 sm:w-8" />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
