"use client";

import Link from "next/link";
import { PageShell } from "@/components/marketing/page-shell";
import { FramedSection } from "@/components/marketing/framed-section";
import { HeroNav } from "@/components/marketing/hero-nav";
import { FooterSection } from "@/components/marketing/footer-section";
import { HERO_BACKGROUND_IMAGE_SRC } from "@/lib/marketing/hero-background";
import { MARKETING_SECTION_GAP_CLASS } from "@/lib/marketing/marketing-layout";

const LAST_UPDATED = "March 27, 2026";

export default function PrivacyPolicyPage() {
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

          <div className="flex w-full flex-1 flex-col items-center justify-start gap-6 px-4 pb-4 pt-2 text-center sm:pt-3 md:pt-4">
            <div className="relative w-full max-w-3xl">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500 sm:text-xs">
                Legal
              </p>
              <h1 className="mx-auto mt-3 max-w-3xl text-pretty text-3xl font-bold leading-tight tracking-normal text-stone-900 sm:text-4xl md:text-5xl">
                Privacy Policy
              </h1>
              <p className="marketing-copy mx-auto mt-3 max-w-lg text-pretty text-[11px] leading-relaxed sm:text-xs">
                This page explains what data Mimly collects, how we use it, and the controls you have.
              </p>
              <p className="mt-2 text-xs text-stone-500">Last updated: {LAST_UPDATED}</p>
            </div>
          </div>
        </div>
      </FramedSection>

      <FramedSection variant="default" backgroundVariant="gallery" className="w-full">
        <div className="mx-auto w-full max-w-4xl px-4">
          <div className="relative overflow-hidden rounded-[30px] border border-stone-200/90 bg-gradient-to-b from-white to-stone-50 p-2 shadow-[0_12px_36px_rgba(20,24,40,0.12)] ring-1 ring-white/80">
            <div className="rounded-[24px] border border-stone-200/80 bg-white/95 p-4 sm:p-5 md:p-6">
              <div className="space-y-5 text-stone-700 md:space-y-6">
                <section>
                  <h2 className="text-lg font-semibold tracking-normal text-stone-900 md:text-xl">
                    1. Information we collect
                  </h2>
                  <p className="marketing-copy mt-2 text-xs leading-relaxed sm:text-sm">
                    We collect account information you provide, such as your name, email address, and profile details.
                    We also collect workspace content and prompts you submit in order to generate outputs.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold tracking-normal text-stone-900 md:text-xl">
                    2. How we use information
                  </h2>
                  <p className="marketing-copy mt-2 text-xs leading-relaxed sm:text-sm">
                    We use information to operate Mimly, improve product quality, secure the service, and communicate
                    account or support updates. We may use aggregated and de-identified usage data for analytics and
                    product improvements.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold tracking-normal text-stone-900 md:text-xl">
                    3. Sharing and processors
                  </h2>
                  <p className="marketing-copy mt-2 text-xs leading-relaxed sm:text-sm">
                    We share data with trusted infrastructure and service providers that help us run Mimly, such as cloud
                    hosting, authentication, analytics, and payment vendors. These providers are only given access needed
                    to perform their services.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold tracking-normal text-stone-900 md:text-xl">
                    4. Data retention
                  </h2>
                  <p className="marketing-copy mt-2 text-xs leading-relaxed sm:text-sm">
                    We retain information for as long as your account is active or as needed to provide the service,
                    resolve disputes, and comply with legal obligations.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold tracking-normal text-stone-900 md:text-xl">
                    5. Your choices
                  </h2>
                  <p className="marketing-copy mt-2 text-xs leading-relaxed sm:text-sm">
                    You can request account updates or deletion by contacting us. Where required by law, you may have
                    additional rights to access, correct, or export your data.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold tracking-normal text-stone-900 md:text-xl">6. Contact</h2>
                  <p className="marketing-copy mt-2 text-xs leading-relaxed sm:text-sm">
                    For privacy questions, contact us through the{" "}
                    <Link
                      href="/contact"
                      className="text-sky-700 underline underline-offset-2 hover:text-sky-800"
                    >
                      contact page
                    </Link>
                    .
                  </p>
                </section>
              </div>
            </div>
          </div>
        </div>
      </FramedSection>

      <FooterSection className="!mt-0" />
    </PageShell>
  );
}
