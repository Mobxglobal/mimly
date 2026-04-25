"use client";

import { useState } from "react";
import { PageShell } from "@/components/marketing/page-shell";
import { FramedSection } from "@/components/marketing/framed-section";
import { HeroNav } from "@/components/marketing/hero-nav";
import { FooterSection } from "@/components/marketing/footer-section";
import { HERO_BACKGROUND_IMAGE_SRC } from "@/lib/marketing/hero-background";
import { MARKETING_SECTION_GAP_CLASS } from "@/lib/marketing/marketing-layout";

const inputClass =
  "mt-1 w-full rounded-xl border border-stone-200 bg-white/90 px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400";

const labelClass = "block text-sm font-medium text-stone-700";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

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
            <div className="relative w-full max-w-3xl">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500 sm:text-xs">
                Contact
              </p>
              <h1 className="mx-auto mt-3 max-w-3xl text-pretty text-3xl font-bold leading-tight tracking-normal text-stone-900 sm:text-4xl md:text-5xl">
                Let&apos;s talk about
                <br />
                your meme engine.
              </h1>
              <p className="marketing-copy mx-auto mt-3 max-w-lg text-pretty text-[11px] leading-relaxed sm:text-xs">
                Whether you have product questions, partnership ideas, or just want
                to understand how Mimly works, this page gives you a simple way to
                reach out.
              </p>
            </div>
          </div>

          <div className="mx-auto mt-8 w-full max-w-xl px-4">
            <div className="relative overflow-hidden rounded-[30px] border border-stone-200/90 bg-gradient-to-b from-white to-stone-50 p-2 shadow-[0_12px_36px_rgba(20,24,40,0.12)] ring-1 ring-white/80">
              <div className="rounded-[24px] border border-stone-200/80 bg-white/95 p-4 sm:p-5">
                {submitted ? (
                  <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50/90 p-5">
                    <p className="text-sm font-medium text-emerald-900">
                      Message received.
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-emerald-800">
                      Thanks for reaching out. We&apos;ll get back to you soon.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="grid gap-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="contact-name" className={labelClass}>
                          Name
                        </label>
                        <input
                          id="contact-name"
                          name="name"
                          className={inputClass}
                          placeholder="Alex"
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor="contact-email" className={labelClass}>
                          Email
                        </label>
                        <input
                          id="contact-email"
                          name="email"
                          type="email"
                          className={inputClass}
                          placeholder="you@company.com"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="contact-company" className={labelClass}>
                        Company
                      </label>
                      <input
                        id="contact-company"
                        name="company"
                        className={inputClass}
                        placeholder="Your brand or company"
                      />
                    </div>

                    <div>
                      <label htmlFor="contact-message" className={labelClass}>
                        How can we help?
                      </label>
                      <textarea
                        id="contact-message"
                        name="message"
                        rows={5}
                        className={`${inputClass} resize-none`}
                        placeholder="Tell us what you’re working on, what your brand does, or what you want to know about Mimly."
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      className="cta-funky mt-2 inline-flex w-fit items-center justify-center rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium !text-white shadow-sm transition-colors hover:bg-stone-800 font-display"
                    >
                      Send message
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </FramedSection>

      <FooterSection className="!mt-0" />
    </PageShell>
  );
}
