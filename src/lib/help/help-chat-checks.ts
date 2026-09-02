import { readFileSync } from "node:fs";
import { join } from "node:path";
import { processHelpChatMessage } from "@/lib/help/help-chat";
import {
  HELP_CHAT_MAX_INPUT_LENGTH,
  sanitizeHelpChatInput,
} from "@/lib/help/help-chat-input";
import { isHelpWidgetPathAllowed } from "@/lib/help/help-chat-paths";
import { matchKnowledgeEntry } from "@/lib/help/intent-matcher";
import {
  getTurnierhubKnowledgeEntries,
  HELP_CHAT_FALLBACK_MESSAGE,
} from "@/lib/help/turnierhub-knowledge";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readFaq() {
  return readFileSync(join(process.cwd(), "src/data/faq.tsx"), "utf8");
}

function readLayout() {
  return readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
}

function readWidgetGate() {
  return readFileSync(
    join(process.cwd(), "src/components/help/TurnierhubHelpWidgetGate.tsx"),
    "utf8",
  );
}

function readApiRoute() {
  return readFileSync(
    join(process.cwd(), "src/app/api/help/chat/route.ts"),
    "utf8",
  );
}

export function runHelpChatChecks() {
  const faq = readFaq();
  const layout = readLayout();
  const widgetGate = readWidgetGate();
  const apiRoute = readApiRoute();
  const entries = getTurnierhubKnowledgeEntries("test@example.com");

  assert(
    faq.includes("getTurnierhubKnowledgeEntries"),
    "faq uses shared knowledge source",
  );

  assert(
    layout.includes("TurnierhubHelpWidgetGate"),
    "root layout mounts help widget gate",
  );

  const bewerben = processHelpChatMessage("Wie kann ich mein Team bewerben?");
  assert(bewerben.type === "knowledge", "bewerben maps to knowledge");
  assert(bewerben.entryId === "bewerben", "bewerben knowledge entry");

  const account = processHelpChatMessage("Brauche ich einen Account?");
  assert(account.type === "knowledge", "account question maps to knowledge");
  assert(account.entryId === "vereinskonto", "guest/account knowledge entry");

  const waitlist = processHelpChatMessage("Wie funktioniert die Warteliste?");
  assert(waitlist.type === "knowledge", "waitlist maps to knowledge");
  assert(waitlist.entryId === "warteliste", "waitlist knowledge entry");

  const lateCancel = processHelpChatMessage("Kann ich 5 Tage vorher absagen?");
  assert(
    lateCancel.type === "knowledge" &&
      (lateCancel.entryId === "absage-kurzfristig" || lateCancel.entryId === "absage"),
    "late cancellation knowledge",
  );
  assert(
    lateCancel.message.toLowerCase().includes("triftig"),
    "late cancellation mentions triftiger Grund",
  );

  const payment = processHelpChatMessage("Wann muss ich bezahlen?");
  assert(payment.type === "knowledge", "payment maps to knowledge");
  assert(payment.entryId === "zahlung", "payment knowledge entry");

  const schedule = processHelpChatMessage("Wo ist der Spielplan?");
  assert(schedule.type === "knowledge", "schedule maps to knowledge");
  assert(schedule.entryId === "spielplan", "schedule knowledge entry");

  const tournamentSpecific = processHelpChatMessage(
    "Ist das VfL Cup 2026 noch offen und wann ist das Turnier?",
  );
  assert(
    tournamentSpecific.type === "tournament_redirect",
    "tournament-specific question redirects safely",
  );
  assert(
    tournamentSpecific.links.some((link) => link.href === "/turniere"),
    "tournament redirect links to /turniere",
  );
  assert(
    !tournamentSpecific.message.toLowerCase().includes("2026"),
    "tournament redirect does not invent dates",
  );

  const applicationStatus = processHelpChatMessage(
    "Wie ist der Status meiner Bewerbung?",
  );
  assert(
    applicationStatus.type === "application_status_redirect",
    "application status redirects safely",
  );
  assert(
    !applicationStatus.message.toLowerCase().includes("angenommen"),
    "application status does not invent status",
  );

  const unsupported = processHelpChatMessage(
    "Wie hoch ist die Erdanziehung auf dem Turnierplatz?",
  );
  assert(unsupported.type === "fallback", "unsupported question falls back");
  assert(unsupported.message === HELP_CHAT_FALLBACK_MESSAGE, "fallback message");

  const sanitized = sanitizeHelpChatInput('<script>alert("x")</script>Wie bewerben?');
  assert(
    sanitized === 'alert("x") Wie bewerben?' || sanitized === "alert x Wie bewerben?",
    "html/script input sanitized",
  );
  assert(!sanitized?.includes("<script"), "script tags removed");

  const tooLong = sanitizeHelpChatInput("a".repeat(HELP_CHAT_MAX_INPUT_LENGTH + 1));
  assert(tooLong === null, "over 500 characters rejected");

  assert(isHelpWidgetPathAllowed("/"), "widget allowed on homepage");
  assert(isHelpWidgetPathAllowed("/faq"), "widget allowed on faq");
  assert(isHelpWidgetPathAllowed("/turniere/vfl-cup"), "widget allowed on tournament page");
  assert(!isHelpWidgetPathAllowed("/admin"), "widget excluded on admin");
  assert(!isHelpWidgetPathAllowed("/admin/kommunikation"), "widget excluded on admin subpath");
  assert(!isHelpWidgetPathAllowed("/verein/dashboard"), "widget excluded on club dashboard");
  assert(!isHelpWidgetPathAllowed("/teilnahme/token"), "widget excluded on participation token");
  assert(!isHelpWidgetPathAllowed("/mitteilung/token"), "widget excluded on receipt token");
  assert(!isHelpWidgetPathAllowed("/turniere/vfl-cup/bewerben"), "widget excluded on apply form");
  assert(!isHelpWidgetPathAllowed("/login"), "widget excluded on login");
  assert(!isHelpWidgetPathAllowed("/registrieren"), "widget excluded on register");
  assert(!isHelpWidgetPathAllowed("/passwort-vergessen"), "widget excluded on password reset");

  assert(
    widgetGate.includes("isHelpWidgetPathAllowed"),
    "widget gate uses pathname allowlist helper",
  );

  assert(
    !apiRoute.includes("service-role") &&
      !apiRoute.includes("SERVICE_ROLE") &&
      !apiRoute.includes("createServiceRole"),
    "help chat api does not use service role",
  );

  assert(
    !apiRoute.includes("communication") && !apiRoute.includes("resend"),
    "help chat api isolated from communication/resend",
  );

  const fristEntry = entries.find((entry) => entry.id === "frist");
  assert(
    Boolean(fristEntry?.answer.includes("Bewerbung offen")),
    "knowledge uses Bewerbung offen terminology",
  );
  assert(
    !fristEntry?.answer.includes("Anmeldung offen"),
    "knowledge avoids outdated Anmeldung offen wording",
  );

  const match = matchKnowledgeEntry("warteliste erklärung", entries);
  assert(match?.entry.id === "warteliste", "intent matcher finds waitlist entry");

  return "ok";
}
