import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/layout/ContentPage";

export const metadata: Metadata = { title: "Seite nicht gefunden" };

export default function NotFound() {
  return (
    <ContentPage
      title="Seite nicht gefunden"
      description="Diese Adresse gibt es im Tournament Hub nicht."
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066]"
        >
          Zur Startseite
        </Link>
        <Link
          href="/turniere"
          className="inline-flex h-11 items-center justify-center border border-line px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/20"
        >
          Turniere ansehen
        </Link>
      </div>
    </ContentPage>
  );
}
