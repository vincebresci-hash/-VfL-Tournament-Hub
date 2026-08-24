import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/layout/ContentPage";
import {
  CLUB_ADDRESS_LINES,
  CLUB_COUNTRY,
  CLUB_PHONE,
} from "@/data/club";
import { telHref } from "@/lib/contact";

export const metadata: Metadata = { title: "Datenschutz" };

export default function DatenschutzPage() {
  return (
    <ContentPage
      title="Datenschutz"
      description="Informationen zur Verarbeitung personenbezogener Daten im Tournament Hub. Rechtsgrundlagen, Speicherdauern und Auftragsverarbeitungsverträge sind rechtlich zu prüfen und hier nicht abschließend festgesetzt."
    >
      <div className="grid gap-4">
        <section className="border border-line bg-white p-6 sm:p-8">
          <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
            Verantwortliche Stelle
          </h2>
          <address className="mt-4 not-italic text-[15px] leading-7 text-ink">
            {CLUB_ADDRESS_LINES.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
            <span className="mt-1 block">{CLUB_COUNTRY}</span>
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
          <p className="mt-4 text-[15px] leading-7 text-muted">
            Diese Hinweise gelten für den Tournament Hub. Sie sind keine Kopie
            der Datenschutzerklärung der offiziellen Vereinswebsite.
          </p>
        </section>

        <section className="border border-line bg-white p-6 sm:p-8">
          <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
            Hosting über Vercel
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-muted">
            Der Tournament Hub wird über Vercel bereitgestellt. Beim Aufruf der
            Seiten können technisch erforderliche Verbindungsdaten entstehen,
            etwa IP-Adresse, Zeitpunkt und aufgerufene Adresse. Ob und in
            welchem Umfang Vercel dabei als Auftragsverarbeiter tätig wird,
            welche Serverstandorte genutzt werden und welche Rechtsgrundlage
            greift, ist rechtlich zu prüfen.
          </p>
        </section>

        <section className="border border-line bg-white p-6 sm:p-8">
          <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
            Supabase
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-muted">
            Turnier-, Bewerbungs- und Vereinsdaten werden in einer Datenbank bei
            Supabase gespeichert. Supabase stellt außerdem Authentifizierung,
            Speicherzugriffe und serverseitige Regeln bereit. Standort der
            Daten, Auftragsverarbeitung und Rechtsgrundlage sind rechtlich zu
            prüfen.
          </p>
        </section>

        <section className="border border-line bg-white p-6 sm:p-8">
          <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
            Benutzerkonten und Supabase Auth
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-muted">
            Für optionale Vereinskonten und für den Admin-Zugang nutzt der Hub
            Supabase Auth. Dabei werden Anmelde-E-Mail und Passwort (in
            gehashter Form beim Authentifizierungsdienst) sowie Profildaten wie
            Name, Vereinsname, Ort und Funktion im Verein verarbeitet.
            Rechtsgrundlage, Speicherdauer nach Kontolöschung und genaue
            Empfänger sind rechtlich zu prüfen.
          </p>
        </section>

        <section className="border border-line bg-white p-6 sm:p-8">
          <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
            Gastbewerbungen
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-muted">
            Mannschaften können sich ohne Vereinskonto bewerben. Die im Formular
            angegebenen Vereins-, Mannschafts- und Kontaktdaten werden der
            jeweiligen Turnierbewerbung zugeordnet und zur Bearbeitung
            gespeichert. Eine Bewerbung ist keine automatische Zusage.
          </p>
        </section>

        <section className="border border-line bg-white p-6 sm:p-8">
          <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
            Gespeicherte Ansprechpartnerdaten
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-muted">
            Zu einer Bewerbung gehören insbesondere Vorname, Nachname, Funktion
            im Verein, E-Mail-Adresse, Telefonnummer und optional eine
            alternative Telefonnummer. Diese Daten dienen der Rückmeldung und
            der Turnierorganisation. Sie werden nicht auf den öffentlichen
            Turnierseiten angezeigt. Speicherdauer und Rechtsgrundlage sind
            rechtlich zu prüfen.
          </p>
        </section>

        <section className="border border-line bg-white p-6 sm:p-8">
          <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
            E-Mail-Versand über Resend
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-muted">
            Sofern der E-Mail-Versand aktiviert ist, werden Nachrichten über den
            Dienst Resend verschickt. Dabei werden Empfängeradresse, Betreff und
            Inhalt der Nachricht an Resend übermittelt. Ob ein
            Auftragsverarbeitungsvertrag besteht, welche Standorte genutzt
            werden und welche Rechtsgrundlage greift, ist rechtlich zu prüfen.
          </p>
        </section>

        <section className="border border-line bg-white p-6 sm:p-8">
          <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
            MeinTurnierplan Live-Widgets
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-muted">
            Wenn für ein Turnier der MeinTurnierplan-Modus oder Hybrid-Modus
            aktiv ist, können Live-Spielplan und Tabellen über offizielle
            MeinTurnierplan-Widgets eingebunden werden. Dabei werden Inhalte
            erst nach einer Nutzerinteraktion direkt von MeinTurnierplan
            geladen. Welche Daten MeinTurnierplan dabei verarbeitet, ob dabei
            Cookies gesetzt werden und welche Rechtsgrundlage für diese
            Einbindung gilt, ist rechtlich/datenschutzrechtlich final zu prüfen.
          </p>
        </section>

        <section className="border border-line bg-white p-6 sm:p-8">
          <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
            Session- und Auth-Cookies
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-muted">
            Nach der Anmeldung setzt der Hub Cookies für die Sitzung von
            Supabase Auth. Technisch sind unter anderem Pfad „/“, SameSite
            „Lax“ und eine maximale Lebensdauer von sieben Tagen hinterlegt.
            Ohne Anmeldung ist der öffentliche Bereich des Hubs nutzbar. Ob
            neben technisch erforderlichen Cookies weitere Einwilligungen nötig
            sind, ist rechtlich zu prüfen.
          </p>
        </section>

        <section className="border border-line bg-white p-6 sm:p-8">
          <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
            Bewerbungsstatus-E-Mails
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-muted">
            Bei Statusänderungen einer Bewerbung kann eine E-Mail an die
            hinterlegte Kontaktadresse gesendet werden, zum Beispiel nach
            Eingang, Prüfung, Zusage, Warteliste oder Absage. Versand und
            Versandprotokolle dienen der Organisation. Rechtsgrundlage und
            Aufbewahrung der Protokolle sind rechtlich zu prüfen.
          </p>
        </section>

        <section className="border border-line bg-white p-6 sm:p-8">
          <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
            Admin-Verarbeitung der Bewerbungen
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-muted">
            Berechtigte Personen der Turnierorganisation sehen Bewerbungen im
            Admin-Bereich, prüfen Angaben, setzen den Status und können
            organisatorische Hinweise hinterlegen. Die Verarbeitung erfolgt zur
            Durchführung der Nachwuchsturniere. Zugriffsberechtigungen,
            Protokollierung und Löschfristen sind rechtlich zu prüfen.
          </p>
        </section>

        <section className="border border-line bg-white p-6 sm:p-8">
          <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
            Rechte betroffener Personen
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-muted">
            Nach der DSGVO können betroffene Personen unter den gesetzlichen
            Voraussetzungen Auskunft, Berichtigung, Löschung, Einschränkung der
            Verarbeitung, Datenübertragbarkeit und Widerspruch verlangen. Ob und
            wie diese Rechte im Tournament Hub organisatorisch umgesetzt werden,
            ist rechtlich zu prüfen.
          </p>
          <p className="mt-4 text-[15px] leading-7 text-muted">
            Fragen zum Datenschutz im Tournament Hub:{" "}
            <Link
              href="/kontakt"
              className="font-semibold text-ink underline decoration-brand-yellow underline-offset-2 hover:text-brand-blue"
            >
              Kontaktseite
            </Link>
            .
          </p>
        </section>
      </div>
    </ContentPage>
  );
}
