import Link from "next/link";
import { Check } from "lucide-react";
import { FramedSection } from "./framed-section";

const STARTER_FEATURES = [
  "Unlimited meme generation",
  "Unlimited engagement post generation",
  "Unlimited content creation for 7 days",
  "No restrictions",
  "No monthly commitment",
] as const;

const PRO_FEATURES = [
  "Unlimited meme generation",
  "Unlimited engagement post generation",
  "Unlimited ongoing access",
  "No restrictions",
  "Monthly subscription",
] as const;

const PLANS = [
  {
    id: "starter_pack",
    name: "Starter Pack",
    badge: "Best place to start",
    price: "£10",
    billingLabel: "One-off payment",
    accessLine: "Unlimited access for 7 days",
    tagline: "7 days. Unlimited access. No commitment.",
    description:
      "Perfect for one-off campaigns, testing Mimly, and building content fast without a monthly commitment.",
    features: STARTER_FEATURES,
    cta: "Get 7 days access",
    href: "/onboarding",
    emphasis: "hero" as const,
  },
  {
    id: "pro",
    name: "Pro",
    badge: null as string | null,
    price: "£29.99",
    billingLabel: "Per month",
    accessLine: "Unlimited monthly access",
    tagline: "For consistent content and ongoing growth",
    description:
      "Built for ongoing content creation, regular posting, and brands that want consistent organic growth.",
    features: PRO_FEATURES,
    cta: "Go Pro",
    href: "/onboarding",
    emphasis: "standard" as const,
  },
] as const;

export function PricingMarketingBlock() {
  return (
    <>
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
          Pricing
        </p>
        <h2
          id="pricing-title"
          className="mt-4 text-4xl font-bold tracking-normal text-stone-900 md:text-6xl"
        >
          Two ways to create
          <br />
          with Mimly
        </h2>
        <p className="marketing-copy mx-auto mt-4 max-w-xl text-center text-stone-600 md:text-[17px]">
          Unlimited memes, engagement posts, and social content—choose a 7-day sprint or go monthly.
        </p>
      </div>

      <div className="mx-auto mt-12 grid max-w-5xl gap-6 md:grid-cols-2 md:gap-8">
        {PLANS.map((plan) => {
          const isHero = plan.emphasis === "hero";
          return (
            <article
              key={plan.id}
              className={`relative flex h-full flex-col overflow-hidden rounded-[2rem] p-6 sm:p-8 ${
                isHero
                  ? "border-2 border-amber-200/90 bg-gradient-to-b from-white via-amber-50/50 to-white text-stone-900 shadow-[0_24px_60px_rgba(245,158,11,0.12)] ring-1 ring-amber-100/80 md:shadow-[0_28px_70px_rgba(245,158,11,0.14)]"
                  : "border border-stone-200/90 bg-white/95 text-stone-900 shadow-[0_18px_44px_rgba(15,23,42,0.07)] ring-1 ring-stone-200/60"
              }`}
            >
              {isHero ? (
                <>
                  <div
                    className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-amber-200/25 blur-3xl"
                    aria-hidden
                  />
                  <div
                    className="pointer-events-none absolute bottom-0 left-8 h-28 w-28 rounded-full bg-amber-100/30 blur-2xl"
                    aria-hidden
                  />
                </>
              ) : null}

              <div className="relative z-10 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-2xl font-semibold tracking-normal text-stone-900 sm:text-3xl">
                    {plan.name}
                  </h3>
                  <p className={`mt-2 text-sm font-medium ${isHero ? "text-amber-900/90" : "text-stone-600"}`}>
                    {plan.tagline}
                  </p>
                </div>
                {plan.badge ? (
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                      isHero
                        ? "border border-amber-300/80 bg-gradient-to-r from-amber-100 to-amber-50 text-amber-950 shadow-sm"
                        : ""
                    }`}
                  >
                    {plan.badge}
                  </span>
                ) : null}
              </div>

              <p className="relative z-10 mt-5 text-sm leading-relaxed text-stone-600">{plan.description}</p>

              <div className="relative z-10 mt-8 flex flex-wrap items-end gap-1">
                <span className="text-5xl font-semibold tracking-normal text-stone-900 sm:text-[3.25rem]">
                  {plan.price}
                </span>
              </div>
              <p className="relative z-10 mt-1 text-sm font-medium text-stone-700">{plan.billingLabel}</p>
              <p className={`relative z-10 mt-2 text-sm ${isHero ? "font-semibold text-amber-950/90" : "font-medium text-stone-700"}`}>
                {plan.accessLine}
              </p>

              <Link
                href={plan.href}
                className={`relative z-10 cta-funky mt-8 inline-flex w-full items-center justify-center rounded-full px-5 py-3.5 text-center text-sm font-semibold shadow-sm transition-colors font-display sm:w-auto ${
                  isHero
                    ? "bg-stone-900 !text-white hover:bg-stone-800"
                    : "border border-stone-200 bg-white !text-stone-900 hover:bg-stone-50"
                }`}
              >
                {plan.cta}
              </Link>

              <ul
                className={`relative z-10 mt-8 flex flex-col gap-3 border-t pt-6 ${
                  isHero ? "border-amber-200/60" : "border-stone-200"
                }`}
              >
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm leading-relaxed text-stone-700">
                    <Check
                      className={`mt-0.5 h-4 w-4 shrink-0 ${isHero ? "text-amber-700" : "text-stone-500"}`}
                      aria-hidden
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </>
  );
}

export function PricingSection() {
  return (
    <FramedSection
      variant="hero"
      backgroundVariant="pricing"
      id="pricing-heading"
      aria-labelledby="pricing-title"
      className="w-full"
    >
      <PricingMarketingBlock />
    </FramedSection>
  );
}
