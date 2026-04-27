import { PageShell } from "@/components/marketing/page-shell";
import { FramedSection } from "@/components/marketing/framed-section";
import { HeroNav } from "@/components/marketing/hero-nav";
import { FooterSection } from "@/components/marketing/footer-section";
import { FAQSection } from "@/components/marketing/faq-section";
import { HERO_BACKGROUND_IMAGE_SRC } from "@/lib/marketing/hero-background";
import { MARKETING_SECTION_GAP_CLASS } from "@/lib/marketing/marketing-layout";

export default function FAQPage() {
  return (
    <PageShell className={MARKETING_SECTION_GAP_CLASS}>
      <FramedSection
        variant="hero"
        backgroundVariant="hero"
        className="w-full"
        heroBackgroundSrc={HERO_BACKGROUND_IMAGE_SRC}
      >
        <div className="flex min-h-[52vh] flex-col items-center gap-8 md:min-h-[58vh] md:gap-12">
          <div className="w-full">
            <HeroNav />
          </div>

          <div className="flex w-full flex-1 flex-col items-center justify-start gap-8 px-4 pb-10 pt-2 text-center sm:pt-3 md:gap-10 md:pb-14 md:pt-4">
            <div className="relative w-full max-w-3xl">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500 sm:text-xs">
                FAQ
              </p>
              <h1
                id="faq-page-heading"
                className="mx-auto mt-3 max-w-3xl text-pretty text-3xl font-[550] leading-tight tracking-normal text-stone-900 sm:text-4xl md:text-5xl"
              >
                Frequently asked questions
              </h1>
              <p className="marketing-copy mx-auto mt-3 max-w-lg text-pretty leading-relaxed">
                Quick answers to common questions about how Mimly works, what you can expect from generated memes, and
                how we keep formats current.
              </p>
            </div>

            <div className="mx-auto w-full max-w-3xl text-left">
              <div className="relative overflow-hidden rounded-[30px] border border-stone-200/90 bg-gradient-to-b from-white to-stone-50 p-2 shadow-[0_12px_36px_rgba(20,24,40,0.12)] ring-1 ring-white/80">
                <div className="rounded-[24px] border border-stone-200/80 bg-white/95 p-4 sm:p-5 md:p-6">
                  <FAQSection aria-labelledby="faq-page-heading" />
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
