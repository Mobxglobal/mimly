import Link from "next/link";
import { FramedSection } from "./framed-section";

const FREE_FEATURES = [
  "Generate 1 meme per day",
  "AI selects the best meme template",
  "Memes tailored to your brand profile",
  "Caption suggestion included",
  "Memes adapt to trending topics",
  "Uses global events and seasonal moments",
  "Promotion input supported",
  "Download ready-to-post meme images",
];

const PRO_FEATURES = [
  "Unlimited meme generation",
  "AI automatically chooses viral meme formats",
  "Memes tailored to your brand and audience",
  "Caption suggestions included",
  "Automatically adapts to trending topics",
  "Uses global events and internet culture",
  "Add promotions, deals or launches",
  "Priority access to new meme templates",
  "Faster generation speeds",
  "Ideal for daily social media posting",
];

const PLANS = [
  {
    name: "Free",
    price: "£0",
    period: "",
    subtext: "1 meme per day",
    features: FREE_FEATURES,
    cta: "Get Started Free",
    href: "/onboarding",
    featured: false,
  },
  {
    name: "Pro",
    price: "£19",
    period: "/ month",
    subtext: "Unlimited meme generation",
    features: PRO_FEATURES,
    cta: "Upgrade to Pro",
    href: "/onboarding",
    featured: true,
    badge: "Most Popular",
  },
];

export function PricingSection() {
  return (
    <FramedSection
      variant="hero"
      backgroundVariant="pricing"
      id="pricing-heading"
      aria-labelledby="pricing-heading"
      className="w-full"
    >
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
          Pricing
        </p>
        <h2
          id="pricing-heading"
          className="mt-4 text-3xl font-bold tracking-tight text-stone-900 md:text-5xl"
        >
          Your pace, your plan
        </h2>
        <p className="marketing-copy mx-auto mt-4 max-w-lg text-center">
          Start with one meme a day, then upgrade when Mimly becomes part of
          your daily social workflow.
        </p>
      </div>

      <div className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-2">
        {PLANS.map((plan) => (
          <article
            key={plan.name}
            className={`relative flex h-full flex-col overflow-hidden p-6 md:p-8 ${
              plan.featured
                ? "rounded-[2rem] border border-amber-300/20 bg-black text-white shadow-[0_24px_50px_rgba(0,0,0,0.14)]"
                : "rounded-[2rem] border border-stone-200/80 bg-white/95 text-stone-900 shadow-[0_18px_40px_rgba(0,0,0,0.06)]"
            }`}
          >
            {plan.featured && (
              <>
                <div
                  className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-amber-300/18 blur-3xl"
                  aria-hidden
                />
                <div
                  className="pointer-events-none absolute bottom-0 left-10 h-24 w-24 rounded-full bg-orange-300/10 blur-3xl"
                  aria-hidden
                />
              </>
            )}

            <div className="relative z-10 flex items-center justify-between gap-2">
              <h3 className={`text-3xl font-semibold ${plan.featured ? "text-white" : "text-stone-900"}`}>
                {plan.name}
              </h3>
              {plan.badge && (
                <span className="inline-flex items-center rounded-full border border-amber-200/70 bg-gradient-to-r from-amber-100 to-yellow-50 px-3 py-1 text-[11px] font-medium text-stone-900 shadow-[0_8px_20px_rgba(251,191,36,0.18)]">
                  {plan.badge}
                </span>
              )}
            </div>

            <p className={`relative z-10 mt-4 max-w-sm text-lg leading-snug ${plan.featured ? "text-stone-200" : "text-stone-700"}`}>
              {plan.featured
                ? "For brands that want to publish consistently and move faster with every meme."
                : "Full access to the essentials if you want to use Mimly a few times each week."}
            </p>

            <div className="relative z-10 mt-10 flex flex-wrap items-end gap-1">
              <span className={`text-5xl font-semibold tracking-tight ${plan.featured ? "text-white" : "text-stone-900"}`}>
                {plan.price}
              </span>
              {plan.period && (
                <span className={`pb-1 text-lg ${plan.featured ? "text-stone-300" : "text-stone-500"}`}>{plan.period}</span>
              )}
              {!plan.period && (
                <span className="pb-1 text-lg text-stone-500">/ month</span>
              )}
            </div>
            {plan.subtext && (
              <p className={`relative z-10 mt-2 text-sm ${plan.featured ? "text-stone-400" : "text-stone-500"}`}>{plan.subtext}</p>
            )}

            <Link
              href={plan.href}
              className={`relative z-10 cta-funky mt-8 inline-flex w-fit items-center justify-center rounded-full px-5 py-3 text-sm font-medium shadow-sm transition-colors font-display ${
                plan.featured
                  ? "bg-white text-stone-900 hover:bg-stone-100"
                  : "bg-stone-900 !text-white hover:bg-stone-800"
              }`}
            >
              {plan.cta}
            </Link>

            <ul className={`relative z-10 mt-8 flex flex-col gap-2.5 border-t pt-6 ${plan.featured ? "border-white/10" : "border-stone-200"}`}>
              {plan.features.map((feature) => (
                <li
                  key={feature}
                  className={`flex items-start gap-2 text-sm leading-relaxed ${plan.featured ? "text-stone-300" : "text-stone-700"}`}
                >
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${plan.featured ? "bg-stone-400" : "bg-stone-400"}`}
                    aria-hidden
                  />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </FramedSection>
  );
}
