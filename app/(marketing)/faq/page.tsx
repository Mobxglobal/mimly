import { PageShell } from "@/components/marketing/page-shell";
import { FAQSection } from "@/components/marketing/faq-section";
import { HeroNav } from "@/components/marketing/hero-nav";
import { FooterSection } from "@/components/marketing/footer-section";

export default function FAQPage() {
  return (
    <PageShell>
      <div className="flex w-full max-w-4xl justify-center px-4 pt-1 pb-3 sm:px-6 sm:pb-4">
        <HeroNav />
      </div>
      <FAQSection />
      <FooterSection />
    </PageShell>
  );
}
