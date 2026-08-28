import type { ReactNode } from "react";
import Link from "next/link";
import type { AppSettings } from "@/types/admin";
import { publicContactEmail } from "@/lib/contact";

export type FaqItem = {
  id: string;
  question: string;
  answer: ReactNode;
};

export function getFaqItems(settings?: AppSettings): FaqItem[] {
  const email = publicContactEmail(settings);

  return [
    {
      id: "zusage",
      question: "Ist eine Bewerbung automatisch eine Zusage?",
      answer: (
        <>
          Nein. Eine Bewerbung ist eine Anfrage zur Teilnahme und noch keine
          Bestätigung. Nach dem Absenden prüfen wir die Angaben. Erst bei Status{" "}
          <strong>Angenommen</strong> ist eure Mannschaft für das Turnier gesetzt.
        </>
      ),
    },
    {
      id: "rueckmeldung",
      question: "Wie erfahre ich, ob meine Mannschaft angenommen wurde?",
      answer: (
        <>
          Der aktuelle Stand steht im Vereinskonto unter Bewerbungen, sobald ihr
          angemeldet seid. Zusätzlich können Status-E-Mails an die hinterlegte
          Kontaktadresse gehen, wenn der jeweilige Status gesetzt wird. Nach dem
          Absenden erscheint außerdem eine Bestätigungsseite im Tournament Hub.
        </>
      ),
    },
    {
      id: "in-pruefung",
      question: "Was bedeutet „In Prüfung“?",
      answer: (
        <>
          „In Prüfung“ heißt: Die Bewerbung ist eingegangen und wird vom VfL
          Kirchheim/Teck gesichtet. Es liegt noch keine Zusage,
          Wartelistenplatzierung oder Absage vor.
        </>
      ),
    },
    {
      id: "warteliste",
      question: "Was bedeutet Warteliste?",
      answer: (
        <>
          Warteliste bedeutet, dass eure Mannschaft vorgemerkt ist, das
          Teilnehmerfeld aber derzeit voll ist oder die Bewerbung dort eingeordnet
          wurde. Das ist keine Zusage und keine endgültige Absage. Wenn Plätze
          frei werden, prüft der Veranstalter die Warteliste.
        </>
      ),
    },
    {
      id: "mehrere-mannschaften",
      question: "Können mehrere Mannschaften eines Vereins teilnehmen?",
      answer: (
        <>
          Ja. Jede Mannschaft bewirbt sich einzeln. Im Vereinskonto könnt ihr
          mehrere Teams anlegen und für passende Altersklassen bewerben. Eine
          Bewerbung gilt immer nur für das gewählte Turnier und die gewählte
          Mannschaft.
        </>
      ),
    },
    {
      id: "voll",
      question: "Was passiert, wenn ein Turnier voll ist?",
      answer: (
        <>
          Ist die maximale Teamzahl erreicht, sind neue Bewerbungen nur noch
          möglich, wenn für dieses Turnier eine Warteliste aktiv ist. Sonst ist
          die Bewerbung geschlossen. Ob eine Warteliste angeboten wird, steht auf
          der jeweiligen Turnierseite.
        </>
      ),
    },
    {
      id: "frist",
      question: "Bis wann kann man sich bewerben?",
      answer: (
        <>
          Das hängt vom Turnier ab. Manche Turniere haben einen Bewerbungsstart
          und eine Bewerbungsfrist, beides steht auf der Turnierseite. Zusätzlich
          kann der Veranstalter Bewerbungen für ein einzelnes Turnier oder global
          schließen. Ohne veröffentlichte Frist gilt: bewerben, solange die
          Turnierseite „Anmeldung offen“ oder „Warteliste“ anzeigt.
        </>
      ),
    },
    {
      id: "vereinskonto",
      question: "Brauche ich ein Vereinskonto?",
      answer: (
        <>
          Nein. Ihr könnt euch auch ohne Konto als Gast bewerben. Ein Vereinskonto
          ist optional und gibt euch eine Übersicht über eure Bewerbungen, Teams
          und den aktuellen Status. Beim Bewerben mit Konto können vorhandene
          Vereins- und Teamdaten vorausgefüllt werden.
        </>
      ),
    },
    {
      id: "spielplan",
      question: "Wo finde ich später Spielplan und Gruppen?",
      answer: (
        <>
          Auf der öffentlichen Turnierseite, sobald der Veranstalter Gruppen und
          Spielplan veröffentlicht hat. Dort gibt es die Bereiche Gruppen und
          Spielplan. Nach einer Zusage erscheinen organisatorische Hinweise
          zusätzlich im Vereinskonto, sobald sie hinterlegt sind.
        </>
      ),
    },
    {
      id: "ergebnisse",
      question: "Wo finde ich Ergebnisse und Tabellen?",
      answer: (
        <>
          Ergebnisse, Tabellen und die KO-Runde stehen auf derselben öffentlichen
          Turnierseite, sobald Spiele angelegt und Ergebnisse eingetragen sind.
          Abgeschlossene Turniere bleiben dort mit Platzierungen sichtbar.
        </>
      ),
    },
    {
      id: "aendern",
      question: "Kann eine Bewerbung nachträglich geändert oder abgesagt werden?",
      answer: (
        <>
          Im Tournament Hub könnt ihr eine abgeschickte Bewerbung nicht selbst
          bearbeiten. Für Angabenänderungen wendet euch bitte über die Kontaktseite
          an uns. Eine Turnierteilnahme könnt ihr nach Zusage als Absageanfrage
          stellen – im Vereinskonto oder über den sicheren Link aus der
          Zusage-E-Mail. Die Absage ist erst nach Bestätigung durch den VfL
          Kirchheim wirksam.
        </>
      ),
    },
    {
      id: "absage",
      question: "Wie kann ich eine Turnierteilnahme absagen?",
      answer: (
        <>
          Eine Absage muss spätestens 14 Tage vor Turnierbeginn über den Tournament
          Hub bzw. das vorgesehene Absageformular eingereicht werden. Kurzfristigere
          Absagen sind nur aus einem triftigen Grund möglich. Eine Absage wird
          zunächst als Anfrage übermittelt und ist erst nach Bestätigung durch den
          VfL Kirchheim wirksam. Dadurch können frei werdende Startplätze rechtzeitig
          an Ersatzmannschaften vergeben werden.
        </>
      ),
    },
    {
      id: "verbindliche-teilnahme",
      question: "Wann ist die Teilnahme verbindlich?",
      answer: (
        <>
          Die Teilnahme wird nach Annahme der Bewerbung und vollständigem Eingang
          der Startgebühr verbindlich. Die Zahlungsinformationen werden mit der
          Zusage bzw. über den Tournament Hub mitgeteilt.
        </>
      ),
    },
    {
      id: "kontakt",
      question: "An wen wende ich mich bei Fragen?",
      answer: (
        <>
          Für Fragen zu Turnieren und Bewerbungen ist der Bereich Jugendturniere /
          Tournament Hub des VfL Kirchheim/Teck zuständig. Nutzt die{" "}
          <Link
            href="/kontakt"
            className="font-semibold text-ink underline decoration-brand-yellow underline-offset-2 hover:text-brand-blue"
          >
            Kontaktseite
          </Link>
          {" "}
          oder schreibt an{" "}
          <a
            href={`mailto:${email}`}
            className="font-semibold text-ink underline decoration-brand-yellow underline-offset-2 hover:text-brand-blue"
          >
            {email}
          </a>
          .
        </>
      ),
    },
  ];
}
