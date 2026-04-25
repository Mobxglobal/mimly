import { PageShell } from "@/components/marketing/page-shell";
import { HeroSection } from "@/components/marketing/hero-section";
import { FooterSection } from "@/components/marketing/footer-section";
import { MARKETING_SECTION_GAP_CLASS } from "@/lib/marketing/marketing-layout";

/**
 * Homepage sections (order must be preserved for SEO and structure):
 * 1. Hero
 * 2. Footer
 */
export default function MarketingPage() {
  return (
    <PageShell className={MARKETING_SECTION_GAP_CLASS}>
      <HeroSection />
      <FooterSection className="!mt-0" />
    </PageShell>
  );
}
