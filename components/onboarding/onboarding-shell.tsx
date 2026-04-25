"use client";

import Link from "next/link";
import Image from "next/image";
import { FramedSection } from "@/components/marketing/framed-section";
import { PageShell } from "@/components/marketing/page-shell";
import { MARKETING_SECTION_GAP_CLASS } from "@/lib/marketing/marketing-layout";

type OnboardingShellProps = Readonly<{
  children: React.ReactNode;
  /** Full marketing hero photo behind the card (e.g. login). Omit for default plain shell. */
  heroBackgroundSrc?: string | null;
  /** Narrower frame and tighter padding (e.g. login). */
  compactCard?: boolean;
}>;

export function OnboardingShell({ children, heroBackgroundSrc, compactCard }: OnboardingShellProps) {
  const useMarketingHero =
    typeof heroBackgroundSrc === "string" && heroBackgroundSrc.trim().length > 0;

  const card = (
    <FramedSection
      variant="onboarding"
      backgroundVariant="features"
      className={compactCard ? "w-full" : "w-full max-w-lg"}
      frameClassName={
        compactCard
          ? "max-w-[17.5rem] !px-3 !pb-3 !pt-2.5 sm:max-w-xs sm:!px-3.5 sm:!pb-3.5 sm:!pt-3"
          : undefined
      }
    >
      <div
        className={
          compactCard
            ? "w-full px-3 pt-1 pb-2 sm:px-3.5 sm:pt-1.5 sm:pb-2.5"
            : "w-full px-4 pt-2 pb-3 sm:px-5 sm:pt-3 sm:pb-4"
        }
      >
        {children}
      </div>
    </FramedSection>
  );

  const logo = (
    <Link
      href="/"
      className={
        useMarketingHero
          ? "shrink-0 hover:opacity-80 transition-opacity"
          : "mb-4 shrink-0 hover:opacity-80 transition-opacity sm:mb-5"
      }
      aria-label="Mimly home"
    >
      <Image
        src="/Mimly.png"
        alt="Mimly"
        width={64}
        height={20}
        className={useMarketingHero ? "h-5 w-auto" : "h-7 w-auto sm:h-8"}
        priority
      />
    </Link>
  );

  if (useMarketingHero) {
    return (
      <PageShell className={MARKETING_SECTION_GAP_CLASS}>
        <FramedSection
          variant="hero"
          backgroundVariant="hero"
          className="w-full"
          heroBackgroundSrc={heroBackgroundSrc}
        >
          <div className="flex min-h-[70vh] flex-col items-center justify-center gap-8 px-4 py-10 md:min-h-[78vh] md:gap-10">
            {logo}
            {card}
          </div>
        </FramedSection>
      </PageShell>
    );
  }

  return (
    <div
      className={
        "min-h-screen flex flex-col items-center justify-center " +
        "px-3 pt-3 pb-3 sm:px-4 sm:pt-4 sm:pb-4 md:px-5 md:pt-5 md:pb-5 lg:px-4 lg:pt-6 lg:pb-6"
      }
    >
      {logo}
      {card}
    </div>
  );
}
