"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useCallback } from "react";
import { Menu, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const NAV_LINKS = [
  { href: "/#features-heading", label: "Product" },
  { href: "/#pricing-heading", label: "Pricing" },
  { href: "/#faq-heading", label: "FAQ" },
];

interface HeroNavProps {
  onFixedChange?: (fixed: boolean) => void;
}

export function HeroNav({ onFixedChange }: HeroNavProps) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [isFixed, setIsFixed] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  async function handleLogOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    closeMenu();
    router.push("/");
    router.refresh();
  }

  const closeMenu = useCallback(() => {
    if (!mobileOpen) return;
    setClosing(true);
  }, [mobileOpen]);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleScroll = () => {
      const fixed = window.scrollY > 16;
      setIsFixed(fixed);
      onFixedChange?.(fixed);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [onFixedChange]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (mobileOpen && !closing) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen, closing]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen, closeMenu]);

  const handleMenuTransitionEnd = useCallback(
    (e: React.TransitionEvent) => {
      if (e.target !== e.currentTarget) return;
      if (closing) {
        setMobileOpen(false);
        setClosing(false);
      }
    },
    [closing]
  );

  return (
    <header
      className={cn(
        "w-full transition-transform duration-200",
        isFixed ? "fixed top-0 left-0 right-0 z-[100]" : "relative z-20"
      )}
      aria-label="Main navigation"
    >
      <nav
        className={cn(
          "relative mx-auto flex max-w-4xl items-center justify-between gap-4",
          "rounded-full border border-white/40 bg-white/40 px-4 py-1.5 shadow-lg shadow-black/5 backdrop-blur-md",
          "sm:px-5 sm:py-2"
        )}
      >
        <Link href="/" className="shrink-0 hover:opacity-80 transition-opacity">
          <Image
            src="/Mimly.png"
            alt="Mimly"
            width={80}
            height={24}
            className="h-6 w-auto"
            priority
          />
        </Link>

        {/* Desktop links */}
        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 sm:flex">
          {NAV_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </div>

        {/* Desktop CTA */}
        <div className="hidden items-center gap-3 sm:flex">
          {hasSession ? (
            <>
              <button
                type="button"
                onClick={handleLogOut}
                className="rounded-full px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100 transition-colors"
              >
                Log out
              </button>
              <Link
                href="/workspace"
                className="cta-funky rounded-full bg-stone-900 px-3 py-1.5 text-sm font-medium !text-white shadow-sm hover:bg-stone-800 transition-colors font-display"
              >
                Workspace
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="cta-funky rounded-full bg-stone-900 px-3 py-1.5 text-sm font-medium !text-white shadow-sm hover:bg-stone-800 transition-colors font-display"
              >
                Log in
              </Link>
            </>
          )}
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          onClick={() => (mobileOpen ? closeMenu() : setMobileOpen(true))}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full text-stone-600 transition-colors duration-200 sm:hidden",
            "hover:bg-stone-200/60 active:bg-stone-200/80"
          )}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          <span className="relative flex h-5 w-5 items-center justify-center">
            <Menu
              className={cn(
                "h-5 w-5 transition-all duration-200",
                mobileOpen && "rotate-90 opacity-0 absolute"
              )}
              aria-hidden
            />
            <X
              className={cn(
                "h-5 w-5 transition-all duration-200",
                !mobileOpen && "rotate-90 opacity-0 absolute"
              )}
              aria-hidden
            />
          </span>
        </button>
      </nav>

      {/* Mobile menu overlay + panel */}
      {(mobileOpen || closing) && (
        <>
          <div
            role="button"
            tabIndex={-1}
            onClick={closeMenu}
            className={cn(
              "fixed inset-0 z-20 bg-stone-900/20 backdrop-blur-[2px] sm:hidden",
              "transition-[opacity,visibility] duration-200 ease-out",
              closing ? "opacity-0 visibility-hidden" : "opacity-100"
            )}
            aria-hidden
          />
          <div
            className={cn(
              "hero-mobile-menu absolute left-0 right-0 top-full z-30 mt-2 origin-top sm:hidden",
              "rounded-2xl border border-stone-200/60 bg-amber-50/85 p-3 shadow-xl shadow-stone-900/10 backdrop-blur-sm",
              "transition-[transform,opacity] duration-200 ease-out",
              closing
                ? "scale-[0.98] opacity-0 -translate-y-1"
                : "scale-100 opacity-100 translate-y-0"
            )}
            data-opening={!closing}
            onTransitionEnd={handleMenuTransitionEnd}
          >
            <div className="flex flex-col gap-1">
              {NAV_LINKS.map((item, i) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMenu}
                  className="hero-mobile-link rounded-full px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-100 active:bg-stone-200/80 transition-colors duration-150"
                  style={{
                    animationDelay: closing ? "0ms" : `${60 + i * 45}ms`,
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="mt-3 flex gap-2 border-t border-stone-200/80 pt-3">
              {hasSession ? (
                <>
                  <button
                    type="button"
                    onClick={handleLogOut}
                    className="flex-1 rounded-full border border-stone-200 py-2.5 text-center text-sm font-medium text-stone-700 hover:bg-stone-100 transition-colors"
                  >
                    Log out
                  </button>
                  <Link
                    href="/workspace"
                    onClick={closeMenu}
                    className="cta-funky flex-1 rounded-full bg-stone-900 py-2.5 text-center text-sm font-medium !text-white shadow-sm hover:bg-stone-800 transition-colors font-display"
                  >
                    Workspace
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={closeMenu}
                    className="cta-funky flex-1 rounded-full bg-stone-900 py-2.5 text-center text-sm font-medium !text-white shadow-sm hover:bg-stone-800 transition-colors font-display"
                  >
                    Log in
                  </Link>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </header>
  );
}
