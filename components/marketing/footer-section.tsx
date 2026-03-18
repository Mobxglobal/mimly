import Link from "next/link";
import Image from "next/image";
import { FramedSection } from "./framed-section";

const FOOTER_LINKS = {
  product: [
    { label: "Product", href: "/#features-heading" },
    { label: "Pricing", href: "/#pricing-heading" },
    { label: "FAQ", href: "/#faq-heading" },
  ],
  company: [
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
  ],
  account: [
    { label: "Log in", href: "/login" },
    { label: "Sign up", href: "/signup" },
  ],
};

export function FooterSection() {
  return (
    <FramedSection
      variant="footer"
      id="footer"
      aria-label="Site footer"
      className="w-full mt-10 sm:mt-12 md:mt-14"
    >
      <div className="flex flex-col gap-12 md:flex-row md:items-start md:justify-between md:gap-16">
        <div>
          <Link href="/" className="inline-flex items-center">
            <Image
              src="/Mimly_footer.png"
              alt="Mimly"
              width={112}
              height={112}
              className="h-8 w-auto"
            />
          </Link>
          <p className="marketing-copy mt-2 max-w-xs text-sm text-stone-400">
            AI-generated memes for brands that move at internet speed.
          </p>
        </div>
        <div className="flex flex-wrap gap-12 sm:gap-16">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-200">
              Product
            </h3>
            <ul className="mt-3 flex flex-col gap-2">
              {FOOTER_LINKS.product.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-stone-300 hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-200">
              Company
            </h3>
            <ul className="mt-3 flex flex-col gap-2">
              {FOOTER_LINKS.company.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-stone-300 hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-200">
              Account
            </h3>
            <ul className="mt-3 flex flex-col gap-2">
              {FOOTER_LINKS.account.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-stone-300 hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="mt-16 flex flex-col gap-3 border-t border-stone-700/60 pt-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-left text-xs text-stone-500">
          © {new Date().getFullYear()} Mimly. All rights reserved.
        </p>
        <p className="text-left text-xs text-stone-500 sm:text-right">
          Built with ☕️ by{" "}
          <a
            href="https://x.com/alexattinger"
            target="_blank"
            rel="noreferrer"
            className="text-stone-300 transition-colors hover:text-white"
          >
            Alex
          </a>
        </p>
      </div>
    </FramedSection>
  );
}
