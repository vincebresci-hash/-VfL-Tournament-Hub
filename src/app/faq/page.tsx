import type { Metadata } from "next";
import { withCanonical } from "@/lib/site";
import { Accordion } from "@/components/ui/Accordion";
import { ContentPage } from "@/components/layout/ContentPage";
import { getFaqItems } from "@/data/faq";
import { getAppSettings } from "@/lib/settings";
import Link from "next/link";

export const metadata: Metadata = withCanonical("/faq", {
  title: "FAQ"
});

export default async function FaqPage() {
  const settings = await getAppSettings();
  const items = getFaqItems(settings);

  return (
    <ContentPage
      title="FAQ"
      description="Antworten rund um Bewerbung, Warteliste, Vereinskonto und den Spielbetrieb im Tournament Hub."
    >
      <Accordion items={items} />
      <p className="mt-8 text-[15px] leading-7 text-muted">
        Weitere Fragen?{" "}
        <Link
          href="/kontakt"
          className="font-semibold text-ink underline decoration-brand-yellow underline-offset-2 hover:text-brand-blue"
        >
          Zur Kontaktseite
        </Link>
        .
      </p>
    </ContentPage>
  );
}
