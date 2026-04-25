"use client";

import Link from "next/link";
import { PageShell } from "@/components/marketing/page-shell";
import { FramedSection } from "@/components/marketing/framed-section";
import { HeroNav } from "@/components/marketing/hero-nav";
import { FooterSection } from "@/components/marketing/footer-section";
import { HERO_BACKGROUND_IMAGE_SRC } from "@/lib/marketing/hero-background";
import { MARKETING_SECTION_GAP_CLASS } from "@/lib/marketing/marketing-layout";

const LAST_UPDATED = "March 27, 2026";

export default function TermsOfServicePage() {
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
                Terms of Service
              </h1>
              <p className="marketing-copy mx-auto mt-3 max-w-lg text-pretty text-[11px] leading-relaxed sm:text-xs">
                These terms govern your access to and use of Mimly and related services.
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
                  <h2 className="text-lg font-semibold tracking-normal text-stone-900 md:text-xl">1. Use of Mimly</h2>
                  <p className="marketing-copy mt-2 text-xs leading-relaxed sm:text-sm">
                    You agree to use Mimly in compliance with applicable laws and these terms. You are responsible for
                    prompts, content requests, and outputs you publish or distribute.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold tracking-normal text-stone-900 md:text-xl">
                    2. Accounts and access
                  </h2>
                  <p className="marketing-copy mt-2 text-xs leading-relaxed sm:text-sm">
                    You are responsible for safeguarding your account credentials and activities under your account. We may
                    suspend or terminate access for violations, abuse, fraud, or service risk.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold tracking-normal text-stone-900 md:text-xl">
                    3. Billing and plans
                  </h2>
                  <p className="marketing-copy mt-2 text-xs leading-relaxed sm:text-sm">
                    Paid features may require a subscription. Fees, billing intervals, and cancellation details are
                    provided in-product at purchase time. Unless otherwise stated, fees are non-refundable.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold tracking-normal text-stone-900 md:text-xl">
                    4. Intellectual property
                  </h2>
                  <p className="marketing-copy mt-2 text-xs leading-relaxed sm:text-sm">
                    Mimly and its software, branding, and site content are protected by intellectual property laws. You
                    retain rights to your original inputs and are responsible for reviewing generated outputs before use.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold tracking-normal text-stone-900 md:text-xl">
                    5. Disclaimers and liability
                  </h2>
                  <p className="marketing-copy mt-2 text-xs leading-relaxed sm:text-sm">
                    Mimly is provided on an &quot;as is&quot; and &quot;as available&quot; basis. To the maximum extent permitted by law,
                    we disclaim warranties and limit liability for indirect, incidental, or consequential damages.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold tracking-normal text-stone-900 md:text-xl">6. Contact</h2>
                  <p className="marketing-copy mt-2 text-xs leading-relaxed sm:text-sm">
                    Questions about these terms can be sent through the{" "}
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
