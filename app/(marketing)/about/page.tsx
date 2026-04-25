"use client";

import Image from "next/image";
import Link from "next/link";
import { PageShell } from "@/components/marketing/page-shell";
import { FramedSection } from "@/components/marketing/framed-section";
import { HeroNav } from "@/components/marketing/hero-nav";
import { FooterSection } from "@/components/marketing/footer-section";
import { HERO_BACKGROUND_IMAGE_SRC } from "@/lib/marketing/hero-background";
import { MARKETING_SECTION_GAP_CLASS } from "@/lib/marketing/marketing-layout";

const BELIEFS = [
  {
    title: "Built for speed",
    copy:
      "Brands should be able to move at internet speed without waiting on a full content production cycle.",
  },
  {
    title: "Grounded in context",
    copy:
      "The best memes are not random. They work when they reflect your audience, offer, tone, and timing.",
  },
  {
    title: "Made to be useful",
    copy:
      "Mimly is designed to help teams publish faster, test more often, and stay culturally relevant.",
  },
];

export default function AboutPage() {
  return (
    <PageShell className={MARKETING_SECTION_GAP_CLASS}>
      <FramedSection
        variant="hero"
        backgroundVariant="hero"
        className="w-full"
        heroBackgroundSrc={HERO_BACKGROUND_IMAGE_SRC}
      >
        <div className="flex min-h-[60vh] flex-col items-center gap-8 md:min-h-[65vh] md:gap-12">
          <div className="w-full">
            <HeroNav />
          </div>

          <div className="flex w-full flex-1 flex-col items-center justify-start gap-6 px-4 pb-4 pt-2 text-center sm:pt-3 md:pt-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500 sm:text-xs">
              About Mimly
            </p>
            <h1 className="mx-auto mt-3 max-w-3xl text-pretty text-3xl font-bold leading-tight tracking-normal text-stone-900 sm:text-4xl md:text-5xl">
              Built for brands
              <br />
              that want to speak internet.
            </h1>
            <p className="marketing-copy mx-auto mt-3 max-w-lg text-pretty text-[11px] leading-relaxed sm:text-xs">
              Mimly helps businesses turn their brand context into memes that
              feel current, platform-native, and ready to post. The goal is
              simple: make it easier for brands to create social content people
              actually want to share.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
              <Link
                href="/onboarding/manual"
                className="cta-funky rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium !text-white shadow-sm transition-colors hover:bg-stone-800 font-display"
              >
                Get started
              </Link>
              <Link
                href="/contact"
                className="rounded-full border border-stone-200 bg-white/85 px-5 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-white hover:text-stone-900"
              >
                Contact us
              </Link>
            </div>
          </div>
        </div>
      </FramedSection>

      <FramedSection variant="default" backgroundVariant="gallery" className="w-full">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500 sm:text-xs">
            What we believe
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-normal text-stone-900 sm:text-4xl md:text-5xl">
            Great meme marketing needs both taste and context
          </h2>
          <p className="marketing-copy mx-auto mt-3 max-w-2xl text-[11px] leading-relaxed sm:text-xs">
            Internet-native content only works when it feels right for the
            brand, the moment, and the audience. That balance is what Mimly is
            built to support.
          </p>
        </div>

        <div className="mx-auto mt-8 grid max-w-5xl gap-4 md:grid-cols-3">
          {BELIEFS.map((item) => (
            <article
              key={item.title}
              className="rounded-[2rem] border border-stone-200/80 bg-white/85 p-5 shadow-[0_14px_30px_rgba(0,0,0,0.05)]"
            >
              <h3 className="text-lg font-semibold tracking-normal text-stone-900">
                {item.title}
              </h3>
              <p className="marketing-copy mt-2.5 text-xs leading-relaxed text-stone-700">
                {item.copy}
              </p>
            </article>
          ))}
        </div>
      </FramedSection>

      <FramedSection variant="default" backgroundVariant="founder" className="w-full">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="max-w-2xl">
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500 sm:text-xs">
              Founder story
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-normal text-stone-900 sm:text-4xl md:text-5xl">
              Built by someone who understands what makes memes travel
            </h2>
            <div className="mt-4 space-y-3.5">
              <p className="marketing-copy text-xs leading-relaxed text-stone-700">
                More than a decade ago, Alex grew a Facebook page to over two
                million followers by sharing memes and internet-native content.
              </p>
              <p className="marketing-copy text-xs leading-relaxed text-stone-700">
                Since then, he has worked with some of the biggest social media
                publishers and seen first-hand how fast culture moves online and
                how hard it is for brands to keep up.
              </p>
              <p className="marketing-copy text-xs leading-relaxed text-stone-700">
                Mimly was created to bridge that gap: combining brand context,
                timing, and meme literacy into a product that helps businesses
                publish with more confidence and speed.
              </p>
            </div>
          </div>

          <div className="rounded-[2rem] border border-stone-200/80 bg-white/80 p-5 shadow-[0_14px_32px_rgba(0,0,0,0.06)] sm:p-6">
            <div className="mx-auto w-full max-w-[220px]">
              <div className="relative aspect-square overflow-hidden rounded-full bg-stone-100 ring-1 ring-stone-200/70">
              <Image
                src="/founder/mLwsIoTp_400x400.jpg"
                alt="Alex Attinger"
                fill
                sizes="(min-width: 1024px) 220px, 100vw"
                className="object-cover"
              />
            </div>
            <div className="mt-4 text-center">
              <p className="text-base font-semibold leading-tight text-stone-900">
                Alex Attinger
              </p>
              <p className="mt-0.5 text-xs text-stone-500">Founder, Mimly</p>

              <a
                href="https://x.com/alexattinger"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex w-full items-center justify-center rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50 hover:text-stone-900"
              >
                Follow on X
              </a>
            </div>
            </div>
          </div>
        </div>
      </FramedSection>

      <FooterSection className="!mt-0" />
    </PageShell>
  );
}
