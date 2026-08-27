import type { Metadata } from "next";
import { withCanonical } from "@/lib/site";
import Link from "next/link";
import { ContentPage } from "@/components/layout/ContentPage";
import {
  CLUB_ADDRESS_LINES,
  CLUB_COUNTRY,
  CLUB_PHONE,
  CLUB_REGISTER_COURT,
  CLUB_REPRESENTATIVE_NAME,
  CLUB_REPRESENTATIVE_TITLE,
  CLUB_RESPONSIBLE_FOR_CONTENT_NAME,
} from "@/data/club";
import { telHref } from "@/lib/contact";

export const metadata: Metadata = withCanonical("/impressum", {
  title: "Impressum"
});

export default function ImpressumPage() {
  return (
    <ContentPage
      title="Impressum"
      description="Angaben zur verantwortlichen Stelle der Fußballabteilung, soweit sie auf der offiziellen Vereinswebsite veröffentlicht sind."
    >
      <div className="grid gap-4">
        <section className="border border-line bg-white p-6 sm:p-8">
          <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
            Anbieter
          </h2>
          <address className="mt-4 not-italic text-[15px] leading-7 text-ink">
            {CLUB_ADDRESS_LINES.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
            <span className="mt-1 block text-muted">{CLUB_COUNTRY}</span>
          </address>
          <p className="mt-4 text-[15px] leading-7 text-ink">
            Telefon:{" "}
            <a
              href={telHref(CLUB_PHONE)}
              className="underline decoration-brand-yellow underline-offset-2 hover:text-brand-blue"
            >
              {CLUB_PHONE}
            </a>
          </p>
        </section>

        <section className="border border-line bg-white p-6 sm:p-8">
          <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
            Vertretung
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-muted">
            Gemeinschaftlich vertretungsberechtigt: {CLUB_REPRESENTATIVE_TITLE}{" "}
            {CLUB_REPRESENTATIVE_NAME}.
          </p>
          <p className="mt-3 text-[15px] leading-7 text-muted">
            Verantwortlich im Sinne des § 55 Abs. 2 RStV:{" "}
            {CLUB_RESPONSIBLE_FOR_CONTENT_NAME}.
          </p>
        </section>

        <section className="border border-line bg-white p-6 sm:p-8">
          <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
            Register
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-muted">
            Registergericht: {CLUB_REGISTER_COURT}.
          </p>
          <p className="mt-3 text-[15px] leading-7 text-muted">
            Eine Registernummer und eine Umsatzsteuer-ID sind auf der
            offiziellen Fußball-Website derzeit nicht veröffentlicht. Diese
            Angaben werden hier deshalb nicht ergänzt.
          </p>
        </section>

        <section className="border border-line bg-white p-6 sm:p-8">
          <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
            Hinweis zu diesem Tournament Hub
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-muted">
            Dieser Tournament Hub ist ein digitaler Dienst zur Organisation der
            Nachwuchsturniere. Ob für dieses separat gehostete Angebot dieselben
            Impressumsangaben unverändert ausreichen oder ergänzt werden müssen,
            ist rechtlich zu prüfen. Es werden hier keine zusätzlichen
            Rechtstexte ergänzt.
          </p>
          <p className="mt-4 text-[15px] leading-7 text-muted">
            Kontakt zum Tournament Hub:{" "}
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
        </section>
      </div>
    </ContentPage>
  );
}
