import type { Metadata } from "next";
import { ContentPage } from "@/components/layout/ContentPage";
import Link from "next/link";

export const metadata: Metadata = { title: "Datenschutz" };

export default function DatenschutzPage() {
  return (
    <ContentPage
      title="Datenschutz"
      description="Die Datenschutzerklärung für den Tournament Hub wird hier veröffentlicht, sobald der Verein den verbindlichen Text bereitstellt. Es werden keine erfundenen Rechtstexte angezeigt."
    >
      <p className="max-w-2xl text-[15px] leading-7 text-muted">
        Bewerbungsformulare verarbeiten Vereins- und Kontaktdaten zur Organisation
        der Turniere. Die genaue Rechtsgrundlage und Speicherdauer folgen in der
        offiziellen Erklärung. Kontakt:{" "}
        <Link
          href="/kontakt"
          className="font-semibold text-ink underline decoration-brand-yellow underline-offset-2 hover:text-brand-blue"
        >
          Kontaktseite
        </Link>
        .
      </p>
    </ContentPage>
  );
}
