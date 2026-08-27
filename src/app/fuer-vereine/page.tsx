import type { Metadata } from "next";
import { withCanonical } from "@/lib/site";
import Link from "next/link";
import { ContentPage } from "@/components/layout/ContentPage";
import { IconCheck } from "@/components/ui/icons";
import { CLUB_NAME } from "@/data/club";

export const metadata: Metadata = withCanonical("/fuer-vereine", {
  title: "Für Vereine"
});

const steps = [
  {
    title: "Turnier auswählen",
    text: "Unter Turniere findet ihr offene, kommende und abgeschlossene Nachwuchsturniere mit Altersklasse, Datum und Ort.",
  },
  {
    title: "Mannschaft bewerben",
    text: "Über die Turnierseite sendet ihr eine Bewerbung – als Gast oder mit Vereinskonto. Eine Bewerbung ist noch keine automatische Zusage.",
  },
  {
    title: "Teilnehmerfeld wird zusammengestellt",
    text: "Neue Bewerbungen gehen zuerst ein und können den Status „In Prüfung“ erhalten. Die Turnierorganisation sichtet die Angaben und stellt das Teilnehmerfeld zusammen.",
  },
  {
    title: "Rückmeldung zum Status",
    text: "Anschließend erhaltet ihr eine Rückmeldung. Eine Zusage bestätigt die Teilnahme. Warteliste ist eine Vormerkung, keine Zusage.",
  },
  {
    title: "Nach Zusage Turnierinformationen",
    text: "Organisatorische Hinweise erscheinen auf der Turnierseite und im Vereinskonto, sobald sie hinterlegt sind.",
  },
  {
    title: "Gruppen, Spielplan und Ergebnisse",
    text: "Sobald der Spielbetrieb veröffentlicht ist, verfolgt ihr Gruppen, Spielplan, Tabelle und KO-Runde im Tournament Hub.",
  },
];

const criteria = [
  {
    title: "Altersklasse",
    text: "Die Bewerbung gilt für die Altersklasse des gewählten Turniers, zum Beispiel U10.",
  },
  {
    title: "Jahrgang",
    text: "Der Jahrgang hilft, Mannschaften sportlich passend einzuordnen.",
  },
  {
    title: "Liga",
    text: "Die aktuelle Spielklasse ist ein Hinweis auf das Leistungsniveau, keine automatische Einstufung.",
  },
  {
    title: "Selbsteinschätzung / Spielstärke",
    text: "Die Skala von 1 bis 5 dient der Zusammenstellung. Sie begründet für sich genommen keine Zusage.",
  },
];

export default function FuerVereinePage() {
  return (
    <ContentPage
      title="Für Vereine"
      description={`${CLUB_NAME} möchte attraktive Nachwuchsturniere mit einem vielfältigen Teilnehmerfeld veranstalten. Mannschaften können sich über den Tournament Hub bewerben.`}
    >
      <p className="max-w-3xl text-[15px] leading-7 text-muted">
        Eine Bewerbung ist noch keine automatische Zusage. Die
        Turnierorganisation stellt das Teilnehmerfeld zusammen. Vereine erhalten
        anschließend eine Rückmeldung.
      </p>

      <div className="mt-8 border border-navy bg-navy p-6 text-white sm:p-8">
        <p className="font-display text-xl font-bold tracking-wide uppercase">
          Bewerbung ist keine automatische Zusage
        </p>
        <p className="mt-3 max-w-2xl text-[15px] leading-7 text-white/75">
          Erst wenn der Status auf „Angenommen“ steht, ist eure Mannschaft für
          das Turnier gesetzt. Bis dahin prüft der Veranstalter die Angaben.
        </p>
      </div>

      <ol className="mt-8 grid gap-4">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="grid gap-3 border border-line bg-white p-5 sm:grid-cols-[3.5rem_minmax(0,1fr)] sm:items-start sm:p-6"
          >
            <span className="font-display text-3xl font-bold text-brand-yellow">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
                {step.title}
              </h2>
              <p className="mt-2 text-[15px] leading-7 text-muted">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="mt-12 grid gap-6 lg:grid-cols-2">
        <div className="border border-line bg-white p-6 sm:p-7">
          <h2 className="font-display text-xl font-bold tracking-wide text-ink uppercase">
            Gastbewerbung
          </h2>
          <p className="mt-3 text-[15px] leading-7 text-muted">
            Ein Vereinskonto ist nicht nötig. Ihr könnt das Formular auf der
            Turnierseite direkt absenden. Die Kontaktperson erhält die
            Rückmeldung über die angegebene E-Mail, sofern Nachrichten aktiv
            sind.
          </p>
        </div>
        <div className="border border-line bg-white p-6 sm:p-7">
          <h2 className="font-display text-xl font-bold tracking-wide text-ink uppercase">
            Vereinskonto
          </h2>
          <p className="mt-3 text-[15px] leading-7 text-muted">
            Optional und kostenfrei im Hub: Übersicht über Bewerbungen, Teams und
            Status. Beim nächsten Turnier können Vereins- und Teamdaten
            vorausgefüllt werden.
          </p>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-bold tracking-wide text-ink uppercase">
          Sportliche Angaben
        </h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-7 text-muted">
          Die folgenden Felder stehen im Bewerbungsformular. Keines dieser
          Felder garantiert eine Auswahl.
        </p>
        <ul className="mt-6 grid gap-4 md:grid-cols-2">
          {criteria.map((item) => (
            <li key={item.title} className="border border-line bg-white p-5">
              <p className="flex items-center gap-2 font-display text-[15px] font-bold tracking-wide text-ink uppercase">
                <IconCheck className="h-4 w-4 text-brand-yellow" />
                {item.title}
              </p>
              <p className="mt-2 text-[14px] leading-6 text-muted">{item.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <Link
        href="/turniere"
        className="mt-12 inline-flex h-12 items-center bg-brand-yellow px-5 text-[13px] font-semibold tracking-[0.1em] text-navy uppercase hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
      >
        Turniere entdecken
      </Link>
    </ContentPage>
  );
}
