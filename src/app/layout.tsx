import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Barlow_Condensed, Geist } from "next/font/google";
import { TurnierhubHelpWidgetGate } from "@/components/help/TurnierhubHelpWidgetGate";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/constants";
import { getSiteUrl } from "@/lib/site";
import "./globals.css";

export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
});

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  icons: {
    icon: [{ url: "/icon.png" }],
    apple: [{ url: "/apple-icon.png" }],
  },
  openGraph: {
    title: APP_NAME,
    description: APP_DESCRIPTION,
    url: siteUrl,
    siteName: APP_NAME,
    locale: "de_DE",
    type: "website",
    images: [{ url: "/hero-vfl.jpg" }],
  },
  twitter: {
    card: "summary_large_image",
    title: APP_NAME,
    description: APP_DESCRIPTION,
    images: ["/hero-vfl.jpg"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${barlowCondensed.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background font-sans text-ink">
        <a
          href="#inhalt"
          className="absolute left-4 top-4 z-[100] -translate-y-[180%] bg-brand-yellow px-4 py-2 text-sm font-semibold text-navy transition-transform focus:translate-y-0"
        >
          Zum Inhalt springen
        </a>
        {children}
        <TurnierhubHelpWidgetGate />
      </body>
    </html>
  );
}
