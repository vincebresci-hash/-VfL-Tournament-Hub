import { filterAllowedHelpChatLinks } from "@/lib/help/help-chat-links";
import { matchKnowledgeEntry } from "@/lib/help/intent-matcher";
import { normalizeHelpChatText } from "@/lib/help/intent-matcher";
import {
  getTurnierhubKnowledgeEntries,
  HELP_CHAT_APPLICATION_STATUS_LINKS,
  HELP_CHAT_APPLICATION_STATUS_MESSAGE,
  HELP_CHAT_FALLBACK_LINKS,
  HELP_CHAT_FALLBACK_MESSAGE,
  HELP_CHAT_SCHEDULE_REDIRECT_LINKS,
  HELP_CHAT_SCHEDULE_REDIRECT_MESSAGE,
  HELP_CHAT_TOURNAMENT_REDIRECT_LINKS,
  HELP_CHAT_TOURNAMENT_REDIRECT_MESSAGE,
  type TurnierhubKnowledgeLink,
} from "@/lib/help/turnierhub-knowledge";

export type HelpChatResponseType =
  | "knowledge"
  | "tournament_redirect"
  | "schedule_redirect"
  | "application_status_redirect"
  | "fallback";

export type HelpChatResponse = {
  type: HelpChatResponseType;
  message: string;
  links: TurnierhubKnowledgeLink[];
  entryId?: string;
};

const SCHEDULE_LIVE_PATTERNS = [
  /\bwann\s+spielt\b/,
  /\bwann\s+ist\s+(das\s+)?(nachste\s+)?spiel\b/,
  /\bum\s+wie\s+viel\s+uhr\s+spielt\b/,
  /\bwie\s+ist\s+der\s+spielplan\b/,
  /\bspielplan\s+von\b/,
  /\bgegen\s+wen\s+spielt\b/,
  /\bgegen\s+wem\s+spielt\b/,
  /\bwo\s+spielt\b/,
  /\bwie\s+steht\s+es\b/,
  /\bwas\s+ist\s+das\s+ergebnis\b/,
  /\bgibt\s+es\s+schon\s+ergebnisse\b/,
  /\baktuelles\s+ergebnis\b/,
  /\blive\s+stand\b/,
  /\bspielbeginn\b/,
  /\banpfiff\b/,
];

const TOURNAMENT_SPECIFIC_PATTERNS = [
  /\bwann\s+ist\s+(das\s+)?turnier\b/,
  /\bturnier\s+am\b/,
  /\bnoch\s+plätze\b/,
  /\bnoch\s+frei\b/,
  /\bist\s+.+\s+noch\s+offen\b/,
  /\bist\s+.+\s+ausgebucht\b/,
  /\bwann\s+findet\s+.+\s+statt\b/,
  /\btermin\s+vom\s+turnier\b/,
  /\bverfügbarkeit\b/,
  /\bkapazität\b/,
  /\bmaximale\s+teamzahl\b/,
  /\bwie\s+viele\s+plätze\b/,
];

const APPLICATION_STATUS_PATTERNS = [
  /\bstatus\s+(meiner|unserer|der)\s+bewerbung\b/,
  /\bmeine\s+bewerbung\b/,
  /\bwurde\s+.*\s+angenommen\b/,
  /\bist\s+meine\s+mannschaft\s+drin\b/,
  /\bhaben\s+wir\s+eine\s+zusage\b/,
  /\bbewerbungsstatus\b/,
];

const PERSONAL_PAYMENT_STATUS_PATTERNS = [
  /\bhabe\s+ich\s+(schon\s+)?bezahlt\b/,
  /\bmeine\s+zahlung\b/,
  /\bzahlungsstatus\b/,
  /\bist\s+unsere\s+zahlung\b/,
  /\bhat\s+team\s+.+\s+schon\s+bezahlt\b/,
];

function matchesAnyPattern(query: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(query));
}

function scheduleRedirectResponse(): HelpChatResponse {
  return {
    type: "schedule_redirect",
    message: HELP_CHAT_SCHEDULE_REDIRECT_MESSAGE,
    links: filterAllowedHelpChatLinks(HELP_CHAT_SCHEDULE_REDIRECT_LINKS),
  };
}

function tournamentRedirectResponse(): HelpChatResponse {
  return {
    type: "tournament_redirect",
    message: HELP_CHAT_TOURNAMENT_REDIRECT_MESSAGE,
    links: filterAllowedHelpChatLinks(HELP_CHAT_TOURNAMENT_REDIRECT_LINKS),
  };
}

function detectSpecificRedirect(query: string): HelpChatResponse | null {
  if (matchesAnyPattern(query, SCHEDULE_LIVE_PATTERNS)) {
    return scheduleRedirectResponse();
  }

  if (matchesAnyPattern(query, TOURNAMENT_SPECIFIC_PATTERNS)) {
    return tournamentRedirectResponse();
  }

  if (
    matchesAnyPattern(query, APPLICATION_STATUS_PATTERNS) ||
    matchesAnyPattern(query, PERSONAL_PAYMENT_STATUS_PATTERNS)
  ) {
    return {
      type: "application_status_redirect",
      message: HELP_CHAT_APPLICATION_STATUS_MESSAGE,
      links: filterAllowedHelpChatLinks(HELP_CHAT_APPLICATION_STATUS_LINKS),
    };
  }

  return null;
}

function finalizeHelpChatResponse(response: HelpChatResponse): HelpChatResponse {
  return {
    ...response,
    links: filterAllowedHelpChatLinks(response.links),
  };
}

export function processHelpChatMessage(
  message: string,
  contactEmail?: string,
): HelpChatResponse {
  const query = normalizeHelpChatText(message);
  if (!query) {
    return finalizeHelpChatResponse({
      type: "fallback",
      message: HELP_CHAT_FALLBACK_MESSAGE,
      links: HELP_CHAT_FALLBACK_LINKS,
    });
  }

  const specificRedirect = detectSpecificRedirect(query);
  if (specificRedirect) {
    return finalizeHelpChatResponse(specificRedirect);
  }

  const entries = getTurnierhubKnowledgeEntries(contactEmail);
  const match = matchKnowledgeEntry(query, entries);

  if (!match) {
    return finalizeHelpChatResponse({
      type: "fallback",
      message: HELP_CHAT_FALLBACK_MESSAGE,
      links: HELP_CHAT_FALLBACK_LINKS,
    });
  }

  return finalizeHelpChatResponse({
    type: "knowledge",
    entryId: match.entry.id,
    message: match.entry.answer,
    links: match.entry.links ?? [],
  });
}
