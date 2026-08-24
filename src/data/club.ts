/**
 * Statische Vereinsstammdaten für den Tournament Hub.
 *
 * Quelle (Stand der Übernahme: August 2026):
 * https://vfl-kirchheim-fussball.de/
 * insbesondere
 * - https://vfl-kirchheim-fussball.de/turniere/
 * - https://vfl-kirchheim-fussball.de/impressum/
 *
 * Zusätzliche öffentliche Referenz (ohne Vorrang):
 * https://vfl-kirchheim.vercel.app/
 *
 * Nur Angaben übernehmen, die auf der offiziellen Website nachweisbar sind.
 * Keine historischen Turnierstatistiken, Gästevereine oder leeren
 * Register-/USt-Felder hier hardcoden.
 *
 * Konfigurierbare Tournament-Hub-Kontaktdaten (E-Mail, Telefon, Organisator)
 * kommen bevorzugt aus `app_settings` und überschreiben diese Fallbacks nicht
 * in der Datenbank — sie werden nur zur Anzeige herangezogen, wenn Settings leer sind.
 */

export const OFFICIAL_CLUB_WEBSITE = "https://vfl-kirchheim-fussball.de/";

/** Kurzname inkl. Ortszusatz, wie auf der offiziellen Website. */
export const CLUB_NAME = "VfL Kirchheim/Teck";

export const CLUB_SLOGAN = "Fußball aus Leidenschaft";

export const CLUB_DEPARTMENT = "Abt. Fußball";

export const CLUB_LEGAL_NAME = "VfL Kirchheim/Teck e.V.";

export const CLUB_STREET = "Jesinger Str. 105";
export const CLUB_POSTAL_CODE = "73230";
export const CLUB_CITY = "Kirchheim/Teck";
export const CLUB_CITY_LONG = "Kirchheim unter Teck";
export const CLUB_COUNTRY = "Deutschland";

/** Offizielle Vereins-Telefonnummer laut Impressum der Fußball-Website. */
export const CLUB_PHONE = "+49 7021 59946";

/**
 * Offizielle Kontaktadresse für Turnierfragen laut
 * https://vfl-kirchheim-fussball.de/turniere/
 */
export const OFFICIAL_TOURNAMENT_EMAIL =
  "turnierkoordination@vfl-kirchheim-fussball.de";

/** Standortbezeichnung der Nachwuchsturniere laut offizieller Turnierseite. */
export const TOURNAMENT_VENUE_OUTDOOR = "Jesinger Allee";

/**
 * Alternative Spielorte laut offizieller Turnierseite, ohne Hallennamen.
 * Die Website spricht von Turnieren „in den Kirchheimer Sporthallen“.
 */
export const TOURNAMENT_VENUE_INDOOR_GENERIC = "Kirchheimer Sporthallen";

export const CLUB_ADDRESS_LINES = [
  CLUB_LEGAL_NAME,
  CLUB_DEPARTMENT,
  CLUB_STREET,
  `${CLUB_POSTAL_CODE} ${CLUB_CITY}`,
] as const;

/** Gemeinschaftlich vertretungsberechtigt laut offiziellem Impressum. */
export const CLUB_REPRESENTATIVE_TITLE = "Abteilungsleiter";
export const CLUB_REPRESENTATIVE_NAME = "Marc Butenuth";

/** V.i.S.d.P. § 55 Abs. 2 RStV laut offiziellem Impressum. */
export const CLUB_RESPONSIBLE_FOR_CONTENT_NAME = "Luca Traub";

/**
 * Nur das Registergericht ist auf der offiziellen Seite genannt.
 * Registernummer und USt-IdNr. sind dort leer — nicht erfinden.
 */
export const CLUB_REGISTER_COURT = "Amtsgericht Kirchheim";
