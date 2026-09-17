import type { Metadata } from "next";
import { withCanonical } from "@/lib/site";
import Link from "next/link";
import { ContentPage } from "@/components/layout/ContentPage";
import { IconMail, IconPhone, IconPin } from "@/components/ui/icons";
import {
  CLUB_ADDRESS_LINES,
  CLUB_DEPARTMENT,
  OFFICIAL_CLUB_WEBSITE,
} from "@/data/club";
import {
  organizerDisplayName,
  publicContactEmail,
  publicContactPhone,
  telHref,
} from "@/lib/contact";
import { HUB_NAME } from "@/lib/constants";
import { getAppSettings } from "@/lib/settings";

export const metadata: Metadata = withCanonical("/kontakt", {
  title: "Kontakt"
});

export default async function KontaktPage() {
  const settings = await getAppSettings();
  const organizer = organizerDisplayName(settings);
  const email = publicContactEmail(settings);
  const phone = publicContactPhone(settings);

  return (
    <ContentPage
      title="Kontakt"
      description="Fragen zu Nachwuchsturnieren und Bewerbungen im Tournament Hub."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="border border-line bg-white p-6 sm:p-8">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
            Veranstalter
          </p>
          <h2 className="mt-3 font-display text-2xl font-bold tracking-wide text-ink uppercase">
            {organizer}
          </h2>
          <p className="mt-2 text-[15px] text-muted">{CLUB_DEPARTMENT}</p>
          <p className="mt-1 text-[15px] text-muted">
            Bereich Jugendturniere / {HUB_NAME}
          </p>

          <div className="mt-8 grid gap-4">
            <div className="flex items-start gap-3 text-[15px] leading-7 text-ink">
              <IconPin className="mt-0.5 h-5 w-5 shrink-0 text-brand-yellow" />
              <address className="not-italic">
                {CLUB_ADDRESS_LINES.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </address>
            </div>
            <p className="flex items-start gap-3 text-[15px] text-ink">
              <IconMail className="mt-0.5 h-5 w-5 shrink-0 text-brand-yellow" />
              <span>
                <span className="block text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
                  Turnierfragen
                </span>
                <a
                  href={`mailto:${email}`}
                  className="underline decoration-brand-yellow underline-offset-2 hover:text-brand-blue"
                >
                  {email}
                </a>
              </span>
            </p>
            <p className="flex items-start gap-3 text-[15px] text-ink">
              <IconPhone className="mt-0.5 h-5 w-5 shrink-0 text-brand-yellow" />
              <a
                href={telHref(phone)}
                className="underline decoration-brand-yellow underline-offset-2 hover:text-brand-blue"
              >
                {phone}
              </a>
            </p>
          </div>

          <p className="mt-8 max-w-xl text-[15px] leading-7 text-muted">
            Für Turnier- und Bewerbungsfragen schreibt uns bitte an die oben
            genannte Adresse. Allgemeine Vereinsthemen außerhalb des Tournament
            Hub klärt ihr über die{" "}
            <a
              href={OFFICIAL_CLUB_WEBSITE}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-ink underline decoration-brand-yellow underline-offset-2 hover:text-brand-blue"
            >
              offizielle Vereinswebsite
            </a>
            .
          </p>
        </section>

        <aside className="grid gap-4 self-start">
          <div className="border border-navy bg-navy p-6 text-white">
            <p className="font-display text-lg font-bold tracking-wide uppercase">
              Nachricht senden
            </p>
            <p className="mt-3 text-[14px] leading-6 text-white/70">
              Schreibt uns zu freien Plätzen, zur Warteliste oder zum Status
              eurer Bewerbung.
            </p>
            <a
              href={`mailto:${email}?subject=${encodeURIComponent("Frage zum Tournament Hub")}`}
              className="mt-6 inline-flex h-11 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066]"
            >
              E-Mail schreiben
            </a>
          </div>

          <div className="border border-line bg-white p-6">
            <p className="font-display text-lg font-bold tracking-wide text-ink uppercase">
              Schnelle Hilfe
            </p>
            <p className="mt-3 text-[14px] leading-6 text-muted">
              Viele Antworten zu Zusage, Warteliste und Vereinskonto stehen in
              den FAQ.
            </p>
            <div className="mt-5 flex flex-col gap-3">
              <Link
                href="/faq"
                className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue"
              >
                FAQ ansehen →
              </Link>
              <Link
                href="/turniere"
                className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue"
              >
                Turniere entdecken →
              </Link>
            </div>
          </div>
        </aside>
      </div>

      <section className="mt-8 border border-line bg-white p-6 sm:p-8">
        <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
          Absage
        </p>
        <h2 className="mt-3 font-display text-2xl font-bold tracking-wide text-ink uppercase">
          Teilnahme absagen
        </h2>
        <p className="mt-3 max-w-3xl text-[15px] leading-7 text-muted">
          Du möchtest eure Teilnahme an einem Turnier absagen? Aus
          Sicherheitsgründen erfolgt eine Absage nicht über eine öffentliche
          Mannschaftssuche.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="border border-line p-5 sm:p-6">
            <h3 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
              Über die Zusage-E-Mail
            </h3>
            <p className="mt-3 text-[15px] leading-7 text-muted">
              Nach der Annahme eurer Bewerbung habt ihr von uns eine
              Zusage-E-Mail erhalten. Öffnet dort den Link „Teilnahme
              verwalten“. Über diesen persönlichen und sicheren Link könnt
              ihr eine Absageanfrage für die betreffende Mannschaft stellen.
            </p>
          </div>

          <div className="border border-line p-5 sm:p-6">
            <h3 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
              Über euer Vereinskonto
            </h3>
            <p className="mt-3 text-[15px] leading-7 text-muted">
              Wenn ihr ein Vereinskonto im Tournament Hub nutzt, könnt ihr die
              betreffende Bewerbung in eurem Vereinsbereich öffnen und dort
              eine Absageanfrage stellen.
            </p>
            <Link
              href="/verein/bewerbungen"
              className="mt-5 inline-flex h-11 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066]"
            >
              Zu meinen Bewerbungen
            </Link>
          </div>
        </div>

        <div className="mt-8 border border-line bg-background p-5 sm:p-6">
          <p className="text-[15px] leading-7 text-ink">
            Eine Absageanfrage storniert die Teilnahme nicht automatisch. Die
            Anfrage wird zunächst von uns geprüft.
          </p>
          <p className="mt-3 text-[15px] leading-7 text-muted">
            Bei einer Absage weniger als 14 Tage vor dem Turnier ist die Angabe
            eines Grundes erforderlich.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-[14px] leading-6 text-muted">
            Zusage-E-Mail oder persönlichen Link nicht mehr zur Hand? Dann
            kontaktiert uns bitte direkt. Wir helfen euch bei der Zuordnung
            eurer Teilnahme.
          </p>
          <a
            href={`mailto:${email}?subject=${encodeURIComponent("Absage / Teilnahme zuordnen")}`}
            className="inline-flex h-11 shrink-0 items-center border border-navy px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-navy hover:text-white"
          >
            Kontakt aufnehmen
          </a>
        </div>
      </section>
    </ContentPage>
  );
}
