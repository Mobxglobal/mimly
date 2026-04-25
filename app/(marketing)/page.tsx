import { PageShell } from "@/components/marketing/page-shell";
import { HeroSection } from "@/components/marketing/hero-section";
import { OrganicStatsSection } from "@/components/marketing/organic-stats-section";
import { ShowcaseBentoSection } from "@/components/marketing/showcase-bento-section";
import { FAQSection } from "@/components/marketing/faq-section";
import { FooterSection } from "@/components/marketing/footer-section";

/**
 * Homepage sections (order must be preserved for SEO and structure):
 * 1. Hero
 * 2. Organic stats
 * 3. Showcase
 * 4. FAQ
 * 5. Footer
 */
export default function MarketingPage() {
  return (
    <PageShell>
      <HeroSection />
      <OrganicStatsSection />
      <ShowcaseBentoSection />
      <FAQSection />
      <FooterSection />
    </PageShell>
  );
}
