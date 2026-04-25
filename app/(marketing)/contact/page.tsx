"use client";

import { useState } from "react";
import { PageShell } from "@/components/marketing/page-shell";
import { FramedSection } from "@/components/marketing/framed-section";
import { HeroNav } from "@/components/marketing/hero-nav";
import { FooterSection } from "@/components/marketing/footer-section";

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
    <PageShell>
      <FramedSection variant="hero" backgroundVariant="hero" className="w-full">
        <div className="flex min-h-[60vh] flex-col gap-10 pb-12 md:gap-14 md:pb-16">
          <div className="w-full">
            <HeroNav />
          </div>

          <div className="mx-auto flex w-full max-w-4xl flex-col items-center px-4 text-center">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
              Contact
            </p>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-stone-900 sm:text-5xl md:text-6xl">
              Let&apos;s talk about
              <br />
              your meme engine.
            </h1>
            <p className="marketing-copy mx-auto mt-5 max-w-2xl">
              Whether you have product questions, partnership ideas, or just want
              to understand how Mimly works, this page gives you a simple way to
              reach out.
            </p>
          </div>

          <div className="mx-auto w-full max-w-xl px-4">
            <div className="rounded-[2rem] border border-stone-200/80 bg-white/85 p-6 shadow-[0_18px_40px_rgba(0,0,0,0.05)] md:p-8">
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
      </FramedSection>

      <FooterSection />
    </PageShell>
  );
}
