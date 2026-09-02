export type TurnierhubKnowledgeCategory =
  | "bewerbung"
  | "teilnahme"
  | "zahlung"
  | "spielbetrieb"
  | "kommunikation"
  | "kontakt";

export type TurnierhubKnowledgeLink = {
  label: string;
  href: string;
};

export type TurnierhubKnowledgeEntry = {
  id: string;
  title: string;
  answer: string;
  keywords: string[];
  category: TurnierhubKnowledgeCategory;
  links?: TurnierhubKnowledgeLink[];
};

export const HELP_CHAT_STARTER_QUESTION_IDS = [
  "bewerben",
  "vereinskonto",
  "warteliste",
  "teilnahme-bestaetigt",
  "absage",
  "zahlung",
  "spielplan",
] as const;

export const HELP_CHAT_GREETING =
  "Hallo! 👋\nWie kann ich dir beim VfL Tournament Hub helfen?";

export const HELP_CHAT_FALLBACK_MESSAGE =
  "Dazu habe ich keine sichere Antwort im Tournament Hub. Bitte schaut in die FAQ oder kontaktiert uns.";

export const HELP_CHAT_FALLBACK_LINKS: TurnierhubKnowledgeLink[] = [
  { label: "FAQ ansehen", href: "/faq" },
  { label: "Kontakt", href: "/kontakt" },
  { label: "Turniere", href: "/turniere" },
];

export const HELP_CHAT_TOURNAMENT_REDIRECT_MESSAGE =
  "Termine, freie Plätze und die aktuelle Bewerbungssituation sind turnierabhängig. Bitte schaut auf der jeweiligen Turnierseite nach dem aktuellen Stand.";

export const HELP_CHAT_TOURNAMENT_REDIRECT_LINKS: TurnierhubKnowledgeLink[] = [
  { label: "Turniere ansehen", href: "/turniere" },
  { label: "FAQ", href: "/faq" },
];

export const HELP_CHAT_APPLICATION_STATUS_MESSAGE =
  "Den Status einer konkreten Bewerbung kann ich hier nicht einsehen. Mit Vereinskonto findet ihr eure Bewerbungen unter „Bewerbungen“. Sonst hilft der Veranstalter weiter.";

export const HELP_CHAT_APPLICATION_STATUS_LINKS: TurnierhubKnowledgeLink[] = [
  { label: "Zum Vereinskonto", href: "/verein/bewerbungen" },
  { label: "Kontakt", href: "/kontakt" },
  { label: "FAQ", href: "/faq" },
];

function withContactEmail(answer: string, contactEmail: string) {
  return answer.replaceAll("{{contact_email}}", contactEmail);
}

export function getTurnierhubKnowledgeEntries(
  contactEmail = "turnier@vfl-kirchheim.de",
): TurnierhubKnowledgeEntry[] {
  const email = contactEmail.trim() || "turnier@vfl-kirchheim.de";

  return (
    [
    {
      id: "zusage",
      title: "Ist eine Bewerbung automatisch eine Zusage?",
      answer:
        "Nein. Eine Bewerbung ist eine Anfrage zur Teilnahme und noch keine Bestätigung. Nach dem Absenden prüfen wir die Angaben. Erst bei Status „Angenommen“ ist eure Mannschaft für das Turnier gesetzt.",
      keywords: [
        "zusage",
        "automatisch",
        "bestätigung",
        "angenommen",
        "bewerbung zusage",
        "teilnahmebestätigung",
      ],
      category: "bewerbung",
      links: [{ label: "Turniere", href: "/turniere" }],
    },
    {
      id: "bewerben",
      title: "Wie kann ich mein Team bewerben?",
      answer:
        "Wählt auf der Turnierseite das gewünschte Turnier und nutzt „Jetzt bewerben“ bzw. „Für Warteliste bewerben“, solange die Bewerbung offen ist. Ihr könnt euch als Gast bewerben oder – optional – mit Vereinskonto vorausgefüllte Daten nutzen. Nach dem Absenden erhaltet ihr eine Bestätigungsseite; das ist noch keine Teilnahmezusage.",
      keywords: [
        "bewerben",
        "team bewerben",
        "mannschaft bewerben",
        "anmelden",
        "bewerbung",
        "wie bewerbe",
        "teilnehmen",
      ],
      category: "bewerbung",
      links: [
        { label: "Turniere", href: "/turniere" },
        { label: "FAQ", href: "/faq" },
      ],
    },
    {
      id: "rueckmeldung",
      title: "Wie erfahre ich, ob meine Mannschaft angenommen wurde?",
      answer:
        "Der aktuelle Stand steht im Vereinskonto unter Bewerbungen, sobald ihr angemeldet seid. Zusätzlich können Status-E-Mails an die hinterlegte Kontaktadresse gehen, wenn der jeweilige Status gesetzt wird. Nach dem Absenden erscheint außerdem eine Bestätigungsseite im Tournament Hub.",
      keywords: [
        "angenommen",
        "rückmeldung",
        "status",
        "zusage erhalten",
        "bestätigung erhalten",
      ],
      category: "bewerbung",
      links: [
        { label: "Vereinskonto", href: "/verein/bewerbungen" },
        { label: "Kontakt", href: "/kontakt" },
      ],
    },
    {
      id: "teilnahme-bestaetigt",
      title: "Wann ist meine Teilnahme bestätigt?",
      answer:
        "Eine Bewerbung ist zunächst nur eingegangen. Teilnahme ist gesetzt, wenn der Status „Angenommen“ ist. Die verbindliche Teilnahme gilt nach Annahme und vollständigem Eingang der Startgebühr, sofern eine Startgebühr vorgesehen ist.",
      keywords: [
        "teilnahme bestätigt",
        "bestätigt",
        "wann bestätigt",
        "zusage",
        "angenommen",
        "verbindlich",
      ],
      category: "teilnahme",
      links: [
        { label: "FAQ", href: "/faq" },
        { label: "Vereinskonto", href: "/verein/bewerbungen" },
      ],
    },
    {
      id: "in-pruefung",
      title: "Was bedeutet „In Prüfung“?",
      answer:
        "„In Prüfung“ heißt: Die Bewerbung ist eingegangen und wird vom VfL Kirchheim/Teck gesichtet. Es liegt noch keine Zusage, Wartelistenplatzierung oder Absage vor.",
      keywords: ["in prüfung", "prüfung", "gesichtet", "eingegangen"],
      category: "bewerbung",
    },
    {
      id: "warteliste",
      title: "Wie funktioniert die Warteliste?",
      answer:
        "Warteliste bedeutet, dass eure Mannschaft vorgemerkt ist, das Teilnehmerfeld aber derzeit voll ist oder die Bewerbung dort eingeordnet wurde. Das ist keine Zusage und keine endgültige Absage. Wenn Plätze frei werden, prüft der Veranstalter die Warteliste.",
      keywords: [
        "warteliste",
        "warten",
        "wartelistenplatz",
        "nachrücken",
        "vorgemerkt",
      ],
      category: "bewerbung",
      links: [{ label: "Turniere", href: "/turniere" }],
    },
    {
      id: "mehrere-mannschaften",
      title: "Können mehrere Mannschaften eines Vereins teilnehmen?",
      answer:
        "Ja. Jede Mannschaft bewirbt sich einzeln. Im Vereinskonto könnt ihr mehrere Teams anlegen und für passende Altersklassen bewerben. Eine Bewerbung gilt immer nur für das gewählte Turnier und die gewählte Mannschaft.",
      keywords: ["mehrere mannschaften", "mehrere teams", "zweite mannschaft"],
      category: "bewerbung",
    },
    {
      id: "voll",
      title: "Was passiert, wenn ein Turnier voll ist?",
      answer:
        "Ist die maximale Teamzahl erreicht, sind neue Bewerbungen nur noch möglich, wenn für dieses Turnier eine Warteliste aktiv ist. Sonst ist die Bewerbung geschlossen. Ob eine Warteliste angeboten wird, steht auf der jeweiligen Turnierseite.",
      keywords: ["voll", "ausgebucht", "keine plätze", "teilnehmerfeld voll"],
      category: "bewerbung",
      links: [{ label: "Turniere", href: "/turniere" }],
    },
    {
      id: "frist",
      title: "Bis wann kann man sich bewerben?",
      answer:
        "Das hängt vom Turnier ab. Manche Turniere haben einen Bewerbungsstart und eine Bewerbungsfrist; beides steht auf der Turnierseite. Zusätzlich kann der Veranstalter Bewerbungen für ein einzelnes Turnier oder global schließen. Ohne veröffentlichte Frist gilt: bewerben, solange die Turnierseite „Bewerbung offen“ oder „Warteliste“ anzeigt.",
      keywords: ["frist", "deadline", "bis wann", "bewerbungsfrist", "noch offen"],
      category: "bewerbung",
      links: [{ label: "Turniere", href: "/turniere" }],
    },
    {
      id: "vereinskonto",
      title: "Brauche ich einen Account?",
      answer:
        "Nein. Ihr könnt euch auch ohne Konto als Gast bewerben. Ein Vereinskonto ist optional und gibt euch eine Übersicht über eure Bewerbungen, Teams und den aktuellen Status. Beim Bewerben mit Konto können vorhandene Vereins- und Teamdaten vorausgefüllt werden.",
      keywords: [
        "account",
        "konto",
        "vereinskonto",
        "gast",
        "ohne anmeldung",
        "registrieren",
        "login",
      ],
      category: "bewerbung",
      links: [
        { label: "Registrieren", href: "/registrieren" },
        { label: "FAQ", href: "/faq" },
      ],
    },
    {
      id: "spielplan",
      title: "Wo finde ich Spielplan und Ergebnisse?",
      answer:
        "Spielplan, Gruppen, Tabellen und die KO-Runde stehen auf der öffentlichen Turnierseite, sobald der Veranstalter sie veröffentlicht hat. Ergebnisse erscheinen dort während und nach dem Turnier. Zusätzlich gibt es auf manchen Turnieren einen Live-Bereich oder einen MeinTurnierplan-Link.",
      keywords: [
        "spielplan",
        "ergebnisse",
        "tabelle",
        "gruppen",
        "ko-runde",
        "live",
        "ergebnis",
        "tabellen",
      ],
      category: "spielbetrieb",
      links: [
        { label: "Turniere", href: "/turniere" },
        { label: "Live", href: "/live" },
      ],
    },
    {
      id: "aendern",
      title: "Kann eine Bewerbung nachträglich geändert oder abgesagt werden?",
      answer:
        "Im Tournament Hub könnt ihr eine abgeschickte Bewerbung nicht selbst bearbeiten. Für Angabenänderungen wendet euch bitte über die Kontaktseite an uns. Eine Turnierteilnahme könnt ihr nach Zusage als Absageanfrage stellen – im Vereinskonto oder über den sicheren Link aus der Zusage-E-Mail. Die Absage ist erst nach Bestätigung durch den VfL Kirchheim wirksam.",
      keywords: ["ändern", "bearbeiten", "korrigieren", "daten ändern"],
      category: "teilnahme",
      links: [{ label: "Kontakt", href: "/kontakt" }],
    },
    {
      id: "absage",
      title: "Wie funktioniert eine Absage?",
      answer:
        "Eine Absage muss spätestens 14 Tage vor Turnierbeginn über den Tournament Hub bzw. das vorgesehene Absageformular eingereicht werden. Kurzfristigere Absagen sind nur aus einem triftigen Grund möglich. Eine Absage wird zunächst als Anfrage übermittelt und ist erst nach Bestätigung durch den VfL Kirchheim wirksam.",
      keywords: [
        "absage",
        "absagen",
        "stornieren",
        "teilnahme absagen",
        "zurückziehen",
      ],
      category: "teilnahme",
      links: [
        { label: "FAQ", href: "/faq" },
        { label: "Kontakt", href: "/kontakt" },
      ],
    },
    {
      id: "absage-kurzfristig",
      title: "Was passiert bei einer Absage weniger als 14 Tage vor dem Turnier?",
      answer:
        "Weniger als 14 Tage vor Turnierbeginn gilt die Absage als kurzfristig. Dann ist ein triftiger Grund erforderlich. Die Anfrage wird vom VfL geprüft und ist erst nach Bestätigung wirksam.",
      keywords: [
        "14 tage",
        "kurzfristig",
        "triftiger grund",
        "5 tage",
        "weniger als 14",
        "kurzfristige absage",
        "tage vorher",
      ],
      category: "teilnahme",
      links: [
        { label: "FAQ", href: "/faq" },
        { label: "Kontakt", href: "/kontakt" },
      ],
    },
    {
      id: "verbindliche-teilnahme",
      title: "Wann ist die Teilnahme verbindlich?",
      answer:
        "Die Teilnahme wird nach Annahme der Bewerbung und vollständigem Eingang der Startgebühr verbindlich. Die Zahlungsinformationen werden mit der Zusage bzw. über den Tournament Hub mitgeteilt.",
      keywords: ["verbindlich", "verbindliche teilnahme", "bindend"],
      category: "teilnahme",
    },
    {
      id: "zahlung",
      title: "Wie funktioniert die Zahlung?",
      answer:
        "Zahlungsinformationen erhaltet ihr mit der Zusage bzw. über den Tournament Hub, sofern eine Startgebühr vorgesehen ist. Die Teilnahme wird nach Annahme und vollständigem Eingang der Startgebühr verbindlich. Den konkreten Zahlungsstatus einer Bewerbung seht ihr im Vereinskonto oder auf Anfrage beim Veranstalter – nicht in diesem Hilfe-Chat.",
      keywords: [
        "zahlung",
        "bezahlen",
        "startgebühr",
        "gebühr",
        "wann bezahlen",
        "wann muss ich bezahlen",
        "überweisen",
      ],
      category: "zahlung",
      links: [
        { label: "FAQ", href: "/faq" },
        { label: "Kontakt", href: "/kontakt" },
      ],
    },
    {
      id: "turnierkommunikation",
      title: "Wie funktioniert die Empfangsbestätigung einer Mitteilung?",
      answer:
        "Turnierinformationen können per E-Mail übermittelt werden. Bei wichtigen Informationen kann eine Empfangsbestätigung angefordert werden. Dafür erhaltet ihr einen persönlichen Link. Die Bestätigung dokumentiert ausschließlich den Erhalt der Information und stellt keine Vertrags-, Teilnahme- oder Zahlungsbestätigung dar.",
      keywords: [
        "empfangsbestätigung",
        "mitteilung",
        "bestätigung erhalten",
        "email bestätigen",
        "turnierinformation",
        "kommunikation",
      ],
      category: "kommunikation",
      links: [{ label: "FAQ", href: "/faq" }],
    },
    {
      id: "kontakt",
      title: "Wie kann ich den Veranstalter kontaktieren?",
      answer: `Für Fragen zu Turnieren und Bewerbungen ist der Bereich Jugendturniere / Tournament Hub des VfL Kirchheim/Teck zuständig. Nutzt die Kontaktseite oder schreibt an ${email}.`,
      keywords: [
        "kontakt",
        "veranstalter",
        "email",
        "erreichen",
        "fragen",
        "hilfe",
        "anrufen",
      ],
      category: "kontakt",
      links: [
        { label: "Kontakt", href: "/kontakt" },
        { label: "FAQ", href: "/faq" },
      ],
    },
  ] as TurnierhubKnowledgeEntry[]).map((entry) => ({
    ...entry,
    answer: withContactEmail(entry.answer, email),
  }));
}

export function getStarterQuestions(contactEmail?: string) {
  const entries = getTurnierhubKnowledgeEntries(contactEmail);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));

  return HELP_CHAT_STARTER_QUESTION_IDS.map((id) => byId.get(id)).filter(
    (entry): entry is TurnierhubKnowledgeEntry => entry != null,
  );
}
