import "./globals.css";
import type { Metadata } from "next";
import { Courier_Prime, Instrument_Serif, Inter } from "next/font/google";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  weight: "400",
});

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const courierPrime = Courier_Prime({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-courier-prime",
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "AI Meme Generator for Brands",
  description:
    "Create memes that feel native to the internet. Mimly turns your brand context into content people want to share.",
  icons: {
    icon: "/fav-rounded.png",
    shortcut: "/fav-rounded.png",
    apple: "/fav-rounded.png",
  },
  openGraph: {
    title: "AI Meme Generator for Brands",
    description:
      "Create memes that feel native to the internet. Mimly turns your brand context into content people want to share.",
    images: [
      {
        url: "/og-default.jpg",
        width: 1200,
        height: 630,
        alt: "Meme Builder",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Meme Generator for Brands",
    description:
      "Create memes that feel native to the internet. Mimly turns your brand context into content people want to share.",
    images: ["/og-default.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${inter.variable} ${courierPrime.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
