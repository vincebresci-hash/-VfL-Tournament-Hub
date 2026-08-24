import type { TournamentStatus } from "@/types/tournament";

export const MEIN_TURNIERPLAN_DEFAULT_LABEL = "LIVE-SPIELPLAN";

export const LIVE_DATA_SOURCES = ["hub", "mein-turnierplan", "hybrid"] as const;

export type LiveDataSource = (typeof LIVE_DATA_SOURCES)[number];

export type MeinTurnierplanPhase = "upcoming" | "live" | "completed";

export type MeinTurnierplanFields = {
  meinTurnierplanUrl: string | null;
  meinTurnierplanEnabled: boolean;
  meinTurnierplanLabel?: string | null;
  meinTurnierplanEmbedUrl?: string | null;
  liveDataSource?: LiveDataSource | string | null;
  meinTurnierplanTournamentId?: string | null;
  meinTurnierplanMatchesWidgetUrl?: string | null;
  meinTurnierplanTableWidgetUrl?: string | null;
  publicScheduleNote?: string | null;
  publicLiveNote?: string | null;
};

export type MeinTurnierplanScheduleInput = {
  date: string;
  status: TournamentStatus;
  now?: Date;
  timeZone?: string;
};

const BLOCKED_URL_PATTERN = /^(javascript|data|vbscript|file|blob):/i;

export const MEIN_TURNIERPLAN_ALLOWED_HOSTS = new Set([
  "www.meinturnierplan.de",
  "meinturnierplan.de",
]);

const MEIN_TURNIERPLAN_ID_PATHS = new Set([
  "/showit.php",
  "/displaytable.php",
  "/displaymatches.php",
  "/json/json.php",
]);

const WIDGET_PATHS: Record<"table" | "matches", string> = {
  table: "/displaytable.php",
  matches: "/displaymatches.php",
};

export const MEIN_TURNIERPLAN_NUMERIC_ID_MAX_LENGTH = 20;

const NUMERIC_TOURNAMENT_ID_PATTERN = /^\d{1,20}$/;

export function isSafeHttpUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed || BLOCKED_URL_PATTERN.test(trimmed)) {
    return false;
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isAllowedMeinTurnierplanHost(hostname: string) {
  return MEIN_TURNIERPLAN_ALLOWED_HOSTS.has(hostname.toLowerCase());
}

export function isAllowedMeinTurnierplanUrl(value: string) {
  if (!isSafeHttpUrl(value)) {
    return false;
  }

  try {
    const url = new URL(value.trim());
    return isAllowedMeinTurnierplanHost(url.hostname);
  } catch {
    return false;
  }
}

export function validateMeinTurnierplanWidgetUrl(
  value: string,
  kind: "table" | "matches",
) {
  const trimmed = value.trim();
  if (!trimmed) {
    return { error: null as string | null, url: null as string | null };
  }

  if (!isAllowedMeinTurnierplanUrl(trimmed)) {
    return {
      error:
        "Bitte eine gültige https://www.meinturnierplan.de/… Widget-URL angeben.",
      url: null,
    };
  }

  try {
    const url = new URL(trimmed);
    if (url.pathname.toLowerCase() !== WIDGET_PATHS[kind]) {
      return {
        error:
          kind === "table"
            ? "Die Tabellen-Widget-URL muss auf displayTable.php verweisen."
            : "Die Spielplan-Widget-URL muss auf displayMatches.php verweisen.",
        url: null,
      };
    }

    if (!url.searchParams.get("id")?.trim()) {
      return {
        error: "Die Widget-URL muss einen gültigen id-Parameter enthalten.",
        url: null,
      };
    }

    return { error: null, url: trimmed };
  } catch {
    return { error: "Bitte eine gültige Widget-URL angeben.", url: null };
  }
}

export function asLiveDataSource(value: string | null | undefined): LiveDataSource {
  if (value && LIVE_DATA_SOURCES.includes(value as LiveDataSource)) {
    return value as LiveDataSource;
  }

  return "hub";
}

export function isNumericMeinTurnierplanTournamentId(value: string) {
  const trimmed = value.trim();
  return NUMERIC_TOURNAMENT_ID_PATTERN.test(trimmed);
}

export function validateMeinTurnierplanTournamentId(
  value: string,
  options?: { required?: boolean },
) {
  const trimmed = value.trim();
  if (!trimmed) {
    if (options?.required) {
      return {
        error: "Bitte die numerische MeinTurnierplan-Turnier-ID angeben.",
        value: null,
      };
    }
    return { error: null as string | null, value: null as string | null };
  }

  if (/\s/.test(value)) {
    return {
      error: "Die Turnier-ID darf keine Leerzeichen enthalten.",
      value: null,
    };
  }

  if (!NUMERIC_TOURNAMENT_ID_PATTERN.test(trimmed)) {
    return {
      error:
        "Die Turnier-ID darf nur Ziffern (0–9) enthalten und ist getrennt von öffentlichen Widget-IDs.",
      value: null,
    };
  }

  return { error: null, value: trimmed };
}

export function extractNumericMeinTurnierplanTournamentIdFromUrl(value: string) {
  if (!isSafeHttpUrl(value)) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    const pathname = url.pathname.toLowerCase();
    if (!MEIN_TURNIERPLAN_ID_PATHS.has(pathname)) {
      return null;
    }

    const id = url.searchParams.get("id") ?? "";
    if (!id || /\s/.test(id) || !NUMERIC_TOURNAMENT_ID_PATTERN.test(id)) {
      return null;
    }

    return id;
  } catch {
    return null;
  }
}

/** @deprecated Use extractNumericMeinTurnierplanTournamentIdFromUrl */
export function extractMeinTurnierplanTournamentIdFromUrl(value: string) {
  return extractNumericMeinTurnierplanTournamentIdFromUrl(value);
}

export function validateMeinTurnierplanInput(input: {
  enabled: boolean;
  url: string;
  liveDataSource?: string;
  tournamentId?: string;
  matchesWidgetUrl?: string;
  tableWidgetUrl?: string;
}) {
  const trimmedUrl = input.url.trim();
  const liveDataSource = asLiveDataSource(input.liveDataSource);

  if (trimmedUrl && !isSafeHttpUrl(trimmedUrl)) {
    return {
      error:
        "Bitte eine gültige MeinTurnierplan-URL mit http:// oder https:// angeben.",
      url: null as string | null,
      liveDataSource,
      tournamentId: null as string | null,
      matchesWidgetUrl: null as string | null,
      tableWidgetUrl: null as string | null,
    };
  }

  if (input.enabled && !trimmedUrl) {
    return {
      error:
        "Wenn MeinTurnierplan aktiv ist, ist ein gültiger MeinTurnierplan-Link erforderlich.",
      url: null,
      liveDataSource,
      tournamentId: null,
      matchesWidgetUrl: null,
      tableWidgetUrl: null,
    };
  }

  let tournamentId: string | null = null;
  const rawTournamentId = input.tournamentId?.trim() ?? "";
  if (rawTournamentId) {
    const validated = validateMeinTurnierplanTournamentId(rawTournamentId);
    if (validated.error) {
      return {
        error: validated.error,
        url: trimmedUrl || null,
        liveDataSource,
        tournamentId: null,
        matchesWidgetUrl: null,
        tableWidgetUrl: null,
      };
    }
    tournamentId = validated.value;
  }

  const matchesWidget = validateMeinTurnierplanWidgetUrl(
    input.matchesWidgetUrl ?? "",
    "matches",
  );
  if (matchesWidget.error) {
    return {
      error: matchesWidget.error,
      url: trimmedUrl || null,
      liveDataSource,
      tournamentId,
      matchesWidgetUrl: null,
      tableWidgetUrl: null,
    };
  }

  const tableWidget = validateMeinTurnierplanWidgetUrl(
    input.tableWidgetUrl ?? "",
    "table",
  );
  if (tableWidget.error) {
    return {
      error: tableWidget.error,
      url: trimmedUrl || null,
      liveDataSource,
      tournamentId,
      matchesWidgetUrl: matchesWidget.url,
      tableWidgetUrl: null,
    };
  }

  return {
    error: null as string | null,
    url: trimmedUrl ? trimmedUrl : null,
    liveDataSource,
    tournamentId,
    matchesWidgetUrl: matchesWidget.url,
    tableWidgetUrl: tableWidget.url,
  };
}

export function localDateString(date: Date, timeZone = "Europe/Berlin") {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

export function getMeinTurnierplanPhase(
  input: MeinTurnierplanScheduleInput,
): MeinTurnierplanPhase {
  if (input.status === "completed") {
    return "completed";
  }

  const today = localDateString(input.now ?? new Date(), input.timeZone);
  const tournamentDate = input.date.slice(0, 10);

  if (tournamentDate > today) {
    return "upcoming";
  }

  if (tournamentDate === today) {
    return "live";
  }

  return "completed";
}

const phaseButtonLabels: Record<MeinTurnierplanPhase, string> = {
  upcoming: "SPIELPLAN ANSEHEN",
  live: "● LIVE – SPIELPLAN & ERGEBNISSE",
  completed: "ERGEBNISSE ANSEHEN",
};

const phaseBadgeLabels: Record<MeinTurnierplanPhase, string> = {
  upcoming: "SPIELPLAN",
  live: "LIVE",
  completed: "ERGEBNISSE",
};

export function getMeinTurnierplanButtonLabel(
  input: MeinTurnierplanScheduleInput & { customLabel?: string | null },
) {
  const custom = input.customLabel?.trim();
  if (custom) {
    return custom;
  }

  return phaseButtonLabels[getMeinTurnierplanPhase(input)];
}

export function getMeinTurnierplanBadgeLabel(input: MeinTurnierplanScheduleInput) {
  return phaseBadgeLabels[getMeinTurnierplanPhase(input)];
}

export function isMeinTurnierplanPublic(
  tournament: MeinTurnierplanFields,
): tournament is MeinTurnierplanFields & { meinTurnierplanUrl: string } {
  return (
    Boolean(tournament.meinTurnierplanEnabled) &&
    isSafeHttpUrl(tournament.meinTurnierplanUrl ?? "")
  );
}

export function showsMeinTurnierplanLiveTab(tournament: MeinTurnierplanFields) {
  if (!tournament.meinTurnierplanEnabled) {
    return false;
  }

  const source = asLiveDataSource(tournament.liveDataSource ?? "hub");
  return source === "mein-turnierplan" || source === "hybrid";
}

export function usesMeinTurnierplanAsPrimaryLive(tournament: MeinTurnierplanFields) {
  return (
    Boolean(tournament.meinTurnierplanEnabled) &&
    asLiveDataSource(tournament.liveDataSource ?? "hub") === "mein-turnierplan"
  );
}

export function isHybridLiveDataSource(tournament: MeinTurnierplanFields) {
  return (
    Boolean(tournament.meinTurnierplanEnabled) &&
    asLiveDataSource(tournament.liveDataSource ?? "hub") === "hybrid"
  );
}

export function meinTurnierplanAriaLabel(
  tournamentName: string,
  buttonLabel: string,
) {
  return `${buttonLabel}: MeinTurnierplan für ${tournamentName} in neuem Tab öffnen`;
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

export function runMeinTurnierplanSelfChecks() {
  assert(!isSafeHttpUrl(""), "leere URL muss ungültig sein");
  assert(
    isSafeHttpUrl("https://meinturnierplan.de/example"),
    "https-URL muss gültig sein",
  );
  assert(
    isSafeHttpUrl("http://meinturnierplan.de/example"),
    "http-URL muss gültig sein",
  );
  assert(!isSafeHttpUrl("javascript:alert(1)"), "javascript:-URL muss blockiert sein");
  assert(!isSafeHttpUrl("data:text/html,test"), "data:-URL muss blockiert sein");
  assert(
    !isAllowedMeinTurnierplanUrl("https://evil.example/displayTable.php?id=1"),
    "fremde Domain muss blockiert sein",
  );
  assert(
    isAllowedMeinTurnierplanUrl("https://www.meinturnierplan.de/displayTable.php?id=1"),
    "MeinTurnierplan-Domain muss erlaubt sein",
  );
  assert(
    validateMeinTurnierplanWidgetUrl(
      "https://www.meinturnierplan.de/displayTable.php?id=123",
      "table",
    ).error === null,
    "gültige Tabellen-Widget-URL muss ok sein",
  );
  assert(
    validateMeinTurnierplanWidgetUrl("javascript:alert(1)", "table").error !== null,
    "javascript:-Widget-URL muss blockiert sein",
  );
  assert(
    validateMeinTurnierplanWidgetUrl(
      "https://www.meinturnierplan.de/displayMatches.php?id=123",
      "table",
    ).error !== null,
    "falscher Widget-Pfad muss blockiert sein",
  );
  assert(
    validateMeinTurnierplanWidgetUrl(
      "https://www.meinturnierplan.de/displayTable.php?id=2jrb0hvxvdabc",
      "table",
    ).error === null,
    "alphanumerische Widget-ID muss akzeptiert werden",
  );
  assert(
    validateMeinTurnierplanWidgetUrl(
      "https://www.meinturnierplan.de/displayMatches.php?id=2jrb0hvxvdabc",
      "matches",
    ).error === null,
    "alphanumerische Spielplan-Widget-ID muss akzeptiert werden",
  );
  assert(
    extractNumericMeinTurnierplanTournamentIdFromUrl(
      "https://www.meinturnierplan.de/showit.php?id=1753883027",
    ) === "1753883027",
    "numerische showit.php?id muss extrahierbar sein",
  );
  assert(
    extractNumericMeinTurnierplanTournamentIdFromUrl(
      "https://www.meinturnierplan.de/showit.php?id=2jrb0hvxvdabc",
    ) === null,
    "alphanumerische showit-ID darf nicht ins Turnier-ID-Feld übernommen werden",
  );
  assert(
    extractNumericMeinTurnierplanTournamentIdFromUrl(
      "https://www.meinturnierplan.de/t/abc",
    ) === null,
    "unbekannter Pfad darf keine ID liefern",
  );
  assert(
    !isNumericMeinTurnierplanTournamentId("2jrb0hvxvdabc"),
    "alphanumerische ID darf nicht als numerische Turnier-ID gelten",
  );
  assert(
    validateMeinTurnierplanTournamentId("1753883027").error === null,
    "numerische Turnier-ID muss gültig sein",
  );
  assert(
    validateMeinTurnierplanTournamentId("2jrb0hvxvdabc").error !== null,
    "alphanumerische Turnier-ID muss abgelehnt werden",
  );
  assert(
    validateMeinTurnierplanTournamentId("1753 883027").error !== null,
    "Turnier-ID mit Leerzeichen muss abgelehnt werden",
  );
  assert(asLiveDataSource("hybrid") === "hybrid", "hybrid muss gültig sein");
  assert(asLiveDataSource("invalid") === "hub", "ungültige Quelle fällt auf hub zurück");

  assert(
    validateMeinTurnierplanInput({
      enabled: true,
      url: "https://meinturnierplan.de/t/abc",
      liveDataSource: "hub",
    }).error === null,
    "enabled + gültige URL muss ok sein",
  );
  assert(
    validateMeinTurnierplanInput({ enabled: true, url: "" }).error !== null,
    "enabled ohne URL muss fehlschlagen",
  );
  assert(
    validateMeinTurnierplanInput({
      enabled: false,
      url: "https://meinturnierplan.de/t/abc",
    }).error === null,
    "disabled mit gültiger URL muss ok sein",
  );
  assert(
    validateMeinTurnierplanInput({
      enabled: false,
      url: "javascript:alert(1)",
    }).error !== null,
    "ungültige URL muss fehlschlagen",
  );
  assert(
    validateMeinTurnierplanInput({
      enabled: true,
      url: "https://www.meinturnierplan.de/showit.php?id=2jrb0hvxvdabc",
      liveDataSource: "hybrid",
      matchesWidgetUrl:
        "https://www.meinturnierplan.de/displayMatches.php?id=2jrb0hvxvdabc",
    }).error === null,
    "hybrid mit Widget-URL ohne numerische Turnier-ID muss speicherbar sein",
  );
  assert(
    validateMeinTurnierplanInput({
      enabled: true,
      url: "https://www.meinturnierplan.de/showit.php?id=1753883027",
      liveDataSource: "hybrid",
      tournamentId: "1753883027",
    }).error === null,
    "hybrid mit numerischer Turnier-ID muss ok sein",
  );

  assert(
    !isMeinTurnierplanPublic({
      meinTurnierplanEnabled: false,
      meinTurnierplanUrl: "https://meinturnierplan.de/t/abc",
    }),
    "disabled darf keinen öffentlichen Button erzeugen",
  );
  assert(
    !isMeinTurnierplanPublic({
      meinTurnierplanEnabled: true,
      meinTurnierplanUrl: null,
    }),
    "ohne URL darf kein Button erscheinen",
  );
  assert(
    isMeinTurnierplanPublic({
      meinTurnierplanEnabled: true,
      meinTurnierplanUrl: "https://meinturnierplan.de/t/abc",
    }),
    "enabled + gültige URL muss öffentlich sein",
  );
  assert(
    !showsMeinTurnierplanLiveTab({
      meinTurnierplanEnabled: true,
      meinTurnierplanUrl: "https://meinturnierplan.de/t/abc",
      liveDataSource: "hub",
    }),
    "hub-Modus darf keinen LIVE-Tab erzeugen",
  );
  assert(
    showsMeinTurnierplanLiveTab({
      meinTurnierplanEnabled: true,
      meinTurnierplanUrl: "https://meinturnierplan.de/t/abc",
      liveDataSource: "hybrid",
    }),
    "hybrid muss LIVE-Tab erzeugen",
  );

  const today = "2026-08-24";
  assert(
    getMeinTurnierplanPhase({
      date: "2026-08-30",
      status: "active",
      now: new Date(`${today}T10:00:00.000Z`),
    }) === "upcoming",
    "zukünftiges Datum muss upcoming sein",
  );
  assert(
    getMeinTurnierplanButtonLabel({
      date: today,
      status: "active",
      now: new Date(`${today}T10:00:00.000Z`),
    }) === "● LIVE – SPIELPLAN & ERGEBNISSE",
    "Turniertag muss LIVE-Label erhalten",
  );
  assert(
    getMeinTurnierplanButtonLabel({
      date: "2026-08-20",
      status: "completed",
      now: new Date(`${today}T10:00:00.000Z`),
    }) === "ERGEBNISSE ANSEHEN",
    "completed muss Ergebnisse-Label erhalten",
  );
  assert(
    getMeinTurnierplanBadgeLabel({
      date: "2026-08-30",
      status: "active",
      now: new Date(`${today}T10:00:00.000Z`),
    }) === "SPIELPLAN",
    "Badge vor Turnier muss SPIELPLAN sein",
  );

  return "ok";
}
