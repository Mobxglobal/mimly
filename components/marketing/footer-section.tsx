import Link from "next/link";
import Image from "next/image";
import { FramedSection } from "./framed-section";
import { cn } from "@/lib/utils";

const FOOTER_LINKS = {
  company: [
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
    { label: "Privacy Policy", href: "/privacy-policy" },
    { label: "Terms of Service", href: "/terms-of-service" },
  ],
  account: [
    { label: "Log in", href: "/login" },
    { label: "Sign up", href: "/signup" },
  ],
};

interface FooterSectionProps {
  className?: string;
}

export function FooterSection({ className }: FooterSectionProps) {
  return (
    <FramedSection
      variant="footer"
      id="footer"
      aria-label="Site footer"
      className={cn("w-full mt-10 sm:mt-12 md:mt-14", className)}
    >
      <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between md:gap-10">
        <div>
          <Link href="/" className="inline-flex items-center">
            <Image
              src="/Mimly_footer.png"
              alt="Mimly"
              width={112}
              height={112}
              className="h-5 w-auto"
            />
          </Link>
          <p className="marketing-copy mt-1.5 max-w-xs text-xs text-stone-400">
            AI-generated memes for brands that move at internet speed.
          </p>
        </div>
        <div className="flex flex-wrap gap-8 sm:gap-10">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-200">
              Company
            </h3>
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {FOOTER_LINKS.company.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-xs text-stone-300 hover:text-white transition-colors"
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
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {FOOTER_LINKS.account.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-xs text-stone-300 hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-9 flex min-w-0 flex-row flex-nowrap items-center justify-between gap-2 overflow-x-auto border-t border-stone-700/60 pt-5 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-3 [&::-webkit-scrollbar]:hidden">
        <p className="shrink-0 whitespace-nowrap text-left text-xs text-stone-500">
          © {new Date().getFullYear()} Mimly. All rights reserved.
        </p>
        <div className="flex shrink-0 flex-nowrap items-center gap-2">
          <p className="whitespace-nowrap text-left text-xs text-stone-400">
            Built by{" "}
            <a
              href="https://alexattinger.dev/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-stone-200 underline-offset-2 transition-colors hover:text-white hover:underline"
            >
              Alex
            </a>
          </p>
        </div>
      </div>
    </FramedSection>
  );
}
