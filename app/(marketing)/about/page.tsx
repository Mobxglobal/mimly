"use client";

import Image from "next/image";
import Link from "next/link";
import { PageShell } from "@/components/marketing/page-shell";
import { FramedSection } from "@/components/marketing/framed-section";
import { HeroNav } from "@/components/marketing/hero-nav";
import { FooterSection } from "@/components/marketing/footer-section";

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
    <PageShell>
      <FramedSection variant="hero" backgroundVariant="hero" className="w-full">
        <div className="flex min-h-[64vh] flex-col gap-10 md:gap-14">
          <div className="w-full">
            <HeroNav />
          </div>

          <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-4 pb-4 text-center">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
              About Mimly
            </p>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-stone-900 sm:text-5xl md:text-6xl">
              Built for brands
              <br />
              that want to speak internet.
            </h1>
            <p className="marketing-copy mx-auto mt-5 max-w-2xl">
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
                className="rounded-full border border-stone-200 bg-white/80 px-5 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-white hover:text-stone-900"
              >
                Contact us
              </Link>
            </div>
          </div>
        </div>
      </FramedSection>

      <FramedSection variant="default" backgroundVariant="gallery" className="w-full">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
            What we believe
          </p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-stone-900 md:text-5xl">
            Great meme marketing needs both taste and context
          </h2>
          <p className="marketing-copy mx-auto mt-4 max-w-2xl">
            Internet-native content only works when it feels right for the
            brand, the moment, and the audience. That balance is what Mimly is
            built to support.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-5xl gap-5 md:grid-cols-3">
          {BELIEFS.map((item) => (
            <article
              key={item.title}
              className="rounded-[2rem] border border-stone-200/80 bg-white/85 p-6 shadow-[0_18px_40px_rgba(0,0,0,0.05)]"
            >
              <h3 className="text-xl font-semibold tracking-tight text-stone-900">
                {item.title}
              </h3>
              <p className="marketing-copy mt-3 text-sm leading-relaxed text-stone-700">
                {item.copy}
              </p>
            </article>
          ))}
        </div>
      </FramedSection>

      <FramedSection variant="default" backgroundVariant="founder" className="w-full">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
              Founder story
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-stone-900 md:text-5xl">
              Built by someone who understands what makes memes travel
            </h2>
            <div className="mt-5 space-y-4">
              <p className="marketing-copy text-stone-700">
                More than a decade ago, Alex grew a Facebook page to over two
                million followers by sharing memes and internet-native content.
              </p>
              <p className="marketing-copy text-stone-700">
                Since then, he has worked with some of the biggest social media
                publishers and seen first-hand how fast culture moves online and
                how hard it is for brands to keep up.
              </p>
              <p className="marketing-copy text-stone-700">
                Mimly was created to bridge that gap: combining brand context,
                timing, and meme literacy into a product that helps businesses
                publish with more confidence and speed.
              </p>
            </div>
          </div>

          <div className="rounded-[2rem] border border-stone-200/80 bg-white/80 p-5 shadow-[0_20px_50px_rgba(0,0,0,0.06)] sm:p-6">
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
            <div className="mt-5 text-center">
              <p className="text-lg font-semibold leading-tight text-stone-900">
                Alex Attinger
              </p>
              <p className="mt-0.5 text-sm text-stone-500">Founder, Mimly</p>

              <a
                href="https://x.com/alexattinger"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 hover:text-stone-900"
              >
                Follow on X
              </a>
            </div>
            </div>
          </div>
        </div>
      </FramedSection>

      <FooterSection />
    </PageShell>
  );
}
