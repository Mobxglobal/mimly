"use client";

import { useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/marketing/page-shell";
import { FramedSection } from "@/components/marketing/framed-section";
import { HeroNav } from "@/components/marketing/hero-nav";
import { FooterSection } from "@/components/marketing/footer-section";

const CONTACT_OPTIONS = [
  {
    title: "Product questions",
    copy:
      "Want to understand how Mimly fits into your content workflow? We can help.",
  },
  {
    title: "Partnerships",
    copy:
      "Looking to collaborate, test Mimly, or explore a brand partnership? Reach out.",
  },
  {
    title: "Founder support",
    copy:
      "Need a quick answer? Alex is active on X and happy to help where he can.",
  },
];

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
        <div className="flex min-h-[60vh] flex-col gap-10 md:gap-14">
          <div className="w-full">
            <HeroNav />
          </div>

          <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-4 pb-4 text-center">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
              Contact
            </p>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-stone-900 sm:text-5xl md:text-6xl">
              Let&apos;s talk about
              <br />
              your meme engine.
            </h1>
            <p className="marketing-copy mx-auto mt-5 max-w-2xl">
              Whether you have product questions, partnership ideas, or just
              want to understand how Mimly works, this page gives you a simple
              way to reach out.
            </p>
          </div>
        </div>
      </FramedSection>

      <FramedSection variant="default" backgroundVariant="pricing" className="w-full">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
            Reach out
          </p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-stone-900 md:text-5xl">
            We keep it simple
          </h2>
          <p className="marketing-copy mx-auto mt-4 max-w-2xl">
            Send a note, share what you are working on, and we&apos;ll point you
            in the right direction.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-5xl gap-5 md:grid-cols-3">
          {CONTACT_OPTIONS.map((item) => (
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

      <FramedSection variant="default" backgroundVariant="gallery" className="w-full">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <section className="rounded-[2rem] border border-stone-200/80 bg-white/85 p-6 shadow-[0_18px_40px_rgba(0,0,0,0.05)] md:p-8">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
              Send a message
            </p>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-stone-900 md:text-3xl">
              Tell us a little about what you need
            </h2>
            <p className="marketing-copy mt-3 max-w-xl text-stone-700">
              This is a simple MVP contact flow for now, but it gives us the
              right context to understand how to help.
            </p>

            {submitted ? (
              <div className="mt-8 rounded-[1.5rem] border border-emerald-200 bg-emerald-50/90 p-5">
                <p className="text-sm font-medium text-emerald-900">
                  Message received.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-emerald-800">
                  Thanks for reaching out. For a faster reply, you can also
                  message Alex directly on X.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-8 grid gap-4">
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
          </section>

          <section className="rounded-[2rem] border border-stone-200/80 bg-white/85 p-6 shadow-[0_18px_40px_rgba(0,0,0,0.05)] md:p-8">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
              Quick links
            </p>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-stone-900 md:text-3xl">
              Prefer a faster route?
            </h2>

            <div className="mt-6 space-y-3">
              <a
                href="https://x.com/alexattinger"
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-[1.5rem] border border-stone-200 bg-white px-5 py-4 transition-colors hover:bg-stone-50"
              >
                <p className="text-sm font-semibold text-stone-900">
                  Message Alex on X
                </p>
                <p className="mt-1 text-sm text-stone-600">
                  Best for quick product questions and direct feedback.
                </p>
              </a>

              <Link
                href="/onboarding/manual"
                className="block rounded-[1.5rem] border border-stone-200 bg-white px-5 py-4 transition-colors hover:bg-stone-50"
              >
                <p className="text-sm font-semibold text-stone-900">
                  Start onboarding
                </p>
                <p className="mt-1 text-sm text-stone-600">
                  Want to try Mimly right away? Set up your meme engine first.
                </p>
              </Link>

              <Link
                href="/about"
                className="block rounded-[1.5rem] border border-stone-200 bg-white px-5 py-4 transition-colors hover:bg-stone-50"
              >
                <p className="text-sm font-semibold text-stone-900">
                  Learn more about Mimly
                </p>
                <p className="mt-1 text-sm text-stone-600">
                  Read more about the product, the founder, and the thinking
                  behind it.
                </p>
              </Link>
            </div>
          </section>
        </div>
      </FramedSection>

      <FooterSection />
    </PageShell>
  );
}
