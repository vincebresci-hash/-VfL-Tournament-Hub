import type { TournamentStatus } from "@/types/tournament";

export const MEIN_TURNIERPLAN_DEFAULT_LABEL = "LIVE-SPIELPLAN";

export type MeinTurnierplanPhase = "upcoming" | "live" | "completed";

export type MeinTurnierplanFields = {
  meinTurnierplanUrl: string | null;
  meinTurnierplanEnabled: boolean;
  meinTurnierplanLabel?: string | null;
  meinTurnierplanEmbedUrl?: string | null;
};

export type MeinTurnierplanScheduleInput = {
  date: string;
  status: TournamentStatus;
  now?: Date;
  timeZone?: string;
};

const BLOCKED_URL_PATTERN = /^(javascript|data|vbscript|file|blob):/i;

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

export function validateMeinTurnierplanInput(input: {
  enabled: boolean;
  url: string;
}) {
  const trimmedUrl = input.url.trim();

  if (trimmedUrl && !isSafeHttpUrl(trimmedUrl)) {
    return {
      error:
        "Bitte eine gültige MeinTurnierplan-URL mit http:// oder https:// angeben.",
      url: null as string | null,
    };
  }

  if (input.enabled && !trimmedUrl) {
    return {
      error:
        "Wenn MeinTurnierplan aktiv ist, ist ein gültiger MeinTurnierplan-Link erforderlich.",
      url: null as string | null,
    };
  }

  if (input.enabled && trimmedUrl && !isSafeHttpUrl(trimmedUrl)) {
    return {
      error:
        "Bitte eine gültige MeinTurnierplan-URL mit http:// oder https:// angeben.",
      url: null as string | null,
    };
  }

  return {
    error: null as string | null,
    url: trimmedUrl ? trimmedUrl : null,
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
    validateMeinTurnierplanInput({
      enabled: true,
      url: "https://meinturnierplan.de/t/abc",
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
