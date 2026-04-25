import { PageShell } from "@/components/marketing/page-shell";
import { HeroNav } from "@/components/marketing/hero-nav";
import { PricingSection } from "@/components/marketing/pricing-section";
import { FooterSection } from "@/components/marketing/footer-section";

export default function PricingPage() {
  return (
    <PageShell>
      <div className="flex w-full max-w-4xl justify-center px-4 pt-1 pb-3 sm:px-6 sm:pb-4">
        <HeroNav />
      </div>
      <PricingSection />
      <FooterSection />
    </PageShell>
  );
}
