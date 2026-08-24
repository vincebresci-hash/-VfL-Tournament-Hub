import type { Metadata } from "next";
import { ContentPage } from "@/components/layout/ContentPage";
import Link from "next/link";

export const metadata: Metadata = { title: "Impressum" };

export default function ImpressumPage() {
  return (
    <ContentPage
      title="Impressum"
      description="Die gesetzlich vorgeschriebenen Angaben des Vereins werden hier veröffentlicht, sobald sie vom Veranstalter bereitgestellt sind. Es werden keine Platzhalter-Rechtstexte angezeigt."
    >
      <p className="max-w-2xl text-[15px] leading-7 text-muted">
        Bis dahin erreichst du den Tournament Hub über die{" "}
        <Link
          href="/kontakt"
          className="font-semibold text-ink underline decoration-brand-yellow underline-offset-2 hover:text-brand-blue"
        >
          Kontaktseite
        </Link>
        . Siehe auch{" "}
        <Link
          href="/datenschutz"
          className="font-semibold text-ink underline decoration-brand-yellow underline-offset-2 hover:text-brand-blue"
        >
          Datenschutz
        </Link>{" "}
        und{" "}
        <Link
          href="/nutzungsbedingungen"
          className="font-semibold text-ink underline decoration-brand-yellow underline-offset-2 hover:text-brand-blue"
        >
          Nutzungsbedingungen
        </Link>
        .
      </p>
    </ContentPage>
  );
}
