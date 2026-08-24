import type { Metadata } from "next";
import { ContentPage } from "@/components/layout/ContentPage";
import Link from "next/link";

export const metadata: Metadata = { title: "Nutzungsbedingungen" };

export default function TermsPage() {
  return (
    <ContentPage
      title="Nutzungsbedingungen"
      description="Die Nutzungsbedingungen für Vereinskonten werden hier veröffentlicht, sobald der verbindliche Text vorliegt. Es werden keine erfundenen Klauseln angezeigt."
    >
      <p className="max-w-2xl text-[15px] leading-7 text-muted">
        Bis zur Veröffentlichung gelten die Hinweise auf den jeweiligen Seiten,
        insbesondere dass eine Bewerbung keine automatische Teilnahmezusicherung
        ist. Siehe{" "}
        <Link
          href="/impressum"
          className="font-semibold text-ink underline decoration-brand-yellow underline-offset-2 hover:text-brand-blue"
        >
          Impressum
        </Link>{" "}
        und{" "}
        <Link
          href="/datenschutz"
          className="font-semibold text-ink underline decoration-brand-yellow underline-offset-2 hover:text-brand-blue"
        >
          Datenschutz
        </Link>
        .
      </p>
    </ContentPage>
  );
}
