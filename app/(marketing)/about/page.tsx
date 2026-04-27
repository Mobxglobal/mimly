"use client";

import Image from "next/image";
import { PageShell } from "@/components/marketing/page-shell";
import { FramedSection } from "@/components/marketing/framed-section";
import { HeroNav } from "@/components/marketing/hero-nav";
import { FooterSection } from "@/components/marketing/footer-section";
import { HERO_BACKGROUND_IMAGE_SRC } from "@/lib/marketing/hero-background";
import { MARKETING_SECTION_GAP_CLASS } from "@/lib/marketing/marketing-layout";

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

          <div className="w-full px-4 pb-4 pt-2 sm:pt-3 md:pt-4">
            <div className="mx-auto w-full max-w-4xl rounded-[30px] border border-stone-200/90 bg-gradient-to-b from-white to-stone-50 p-2 shadow-[0_12px_36px_rgba(20,24,40,0.12)] ring-1 ring-white/80">
              <div className="rounded-[24px] border border-stone-200/80 bg-white/95 p-4 sm:p-5 md:p-6">
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500 sm:text-xs">
                  About Mimly
                </p>
                <h1 className="mt-3 text-pretty text-3xl font-[550] leading-tight tracking-normal text-stone-900 sm:text-4xl md:text-5xl">
                  About Mimly
                </h1>
                <div className="marketing-copy mt-4 space-y-3.5 text-left leading-relaxed text-stone-700">
                  <p>Mimly came from years of watching how the internet actually behaves.</p>
                  <p>
                    I&apos;m Alex, the person behind it. About 14 years ago, I accidentally grew a Facebook page to 2M+
                    followers just posting memes, then sold it to a retailer in the same niche. That&apos;s when it clicked:
                    memes don&apos;t just entertain, they drive real attention and real business.
                  </p>
                  <p>
                    Since then, I&apos;ve worked closely with social content and seen how hard it is for brands to show up
                    in a way that feels natural. Most either overthink it, move too slowly, or miss the tone completely.
                  </p>
                  <p>Mimly is my attempt to fix that.</p>
                  <p>
                    The goal isn&apos;t random memes. It&apos;s turning a brand&apos;s tone, audience, and offer into content that
                    actually feels native to the internet, the kind people share without thinking.
                  </p>
                  <p>
                    I&apos;m not a traditional developer, but I build using modern tools and AI, what people call vibe
                    coding. Mimly is built the same way: fast, iterative, and focused on what works.
                  </p>
                  <p>
                    This is an early beta, shaped by real use and feedback. If you&apos;re trying it, I want to know what
                    works, what doesn&apos;t, and where it breaks.
                  </p>
                </div>
                <div className="mt-6 flex items-center gap-3 border-t border-stone-100 pt-4">
                  <Image
                    src="/alex-v2.png"
                    alt="Alex"
                    width={56}
                    height={56}
                    className="h-14 w-14 rounded-full object-cover"
                  />
                  <div>
                    <p className="text-sm font-semibold text-stone-900">Alex Attinger</p>
                    <p className="text-xs text-stone-500">Founder, Mimly</p>
                    <div className="mt-1.5 flex items-center gap-3 text-xs">
                      <a
                        href="https://x.com/alexattinger"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="marketing-copy text-stone-700 transition-colors hover:text-stone-900 hover:underline"
                      >
                        X
                      </a>
                      <a
                        href="https://www.linkedin.com/in/alexattinger/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="marketing-copy text-stone-700 transition-colors hover:text-stone-900 hover:underline"
                      >
                        LinkedIn
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </FramedSection>

      <FooterSection className="!mt-0" />
    </PageShell>
  );
}
