import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildTournamentHubEmail,
  buildTournamentHubEmailFromTemplate,
  escapeHtml,
  isValidHttpsUrl,
  resolveEmailCta,
  resolveEmailLogoUrl,
} from "@/lib/email/tournament-hub-email";
import { DEFAULT_PRODUCTION_SITE_URL } from "@/lib/site";
import { buildCommunicationReceiptEmailAppendix } from "@/lib/communications/communication-receipt-token";
import { renderEmailTemplate } from "@/lib/email/provider";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readRepoFile(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function sampleVariables(overrides: Record<string, string> = {}) {
  return {
    contact_first_name: "Max",
    contact_last_name: "Mustermann",
    club_name: "SV Beispielstadt",
    team_name: "U13",
    tournament_name: "VfL Kirchheim Cup",
    age_group: "U13",
    tournament_date: "12.09.2026",
    location: "Sportpark Kirchheim",
    application_status: "Angenommen",
    participation_url: "https://vf-l-tournament-hub.vercel.app/teilnahme/sample-token",
    participation_fee_line: "Startgebühr: 50,00 €",
    payment_binding_notice: "Die Teilnahme wird nach vollständigem Eingang der Startgebühr verbindlich.",
    payment_status_label: "Zahlung offen",
    tournament_url: "https://vf-l-tournament-hub.vercel.app/turniere/vfl-cup",
    schedule_url:
      "https://vf-l-tournament-hub.vercel.app/turniere/vfl-cup?tab=spielplan",
    live_url: "https://vf-l-tournament-hub.vercel.app/live",
    meinturnierplan_url: "https://www.meinturnierplan.de/example",
    confirmation_url: "https://vf-l-tournament-hub.vercel.app/mitteilung/sample-token",
    cancellation_reason: "Verletzung",
    cancellation_on_time_label: "Fristgerecht",
    cancellation_admin_note: "Keine zusätzliche Begründung.",
    ...overrides,
  };
}

function renderAcceptedEmail() {
  const variables = sampleVariables({
    confirmation_url: "",
    tournament_url: "",
    schedule_url: "",
    live_url: "",
    meinturnierplan_url: "",
  });
  const body = renderEmailTemplate(
    "Hallo {{contact_first_name}},\n\nIhre Bewerbung für {{team_name}} wurde angenommen.\n\n{{participation_url}}\n\nSportliche Grüße",
    variables,
  );

  return buildTournamentHubEmailFromTemplate({
    subject: "Bewerbung angenommen",
    bodyText: body,
    variables,
  });
}

function renderRejectedEmail() {
  const variables = sampleVariables({
    application_status: "Abgelehnt",
    participation_url: "",
    confirmation_url: "",
    tournament_url: "",
    schedule_url: "",
    live_url: "",
    meinturnierplan_url: "",
  });
  const body = renderEmailTemplate(
    "Hallo {{contact_first_name}},\n\nleider können wir {{team_name}} nicht berücksichtigen.",
    variables,
  );

  return buildTournamentHubEmailFromTemplate({
    subject: "Bewerbung abgelehnt",
    bodyText: body,
    variables,
  });
}

function renderWaitingListEmail() {
  const variables = sampleVariables({
    application_status: "Warteliste",
    participation_url: "",
    confirmation_url: "",
    tournament_url: "",
    schedule_url: "",
    live_url: "",
    meinturnierplan_url: "",
  });
  const body = renderEmailTemplate(
    "Hallo {{contact_first_name}},\n\n{{team_name}} steht auf der Warteliste.",
    variables,
  );

  return buildTournamentHubEmailFromTemplate({
    subject: "Warteliste",
    bodyText: body,
    variables,
  });
}

function renderUnderReviewEmail() {
  const variables = sampleVariables({
    application_status: "In Prüfung",
    participation_url: "",
    confirmation_url: "",
    tournament_url: "",
    schedule_url: "",
    live_url: "",
    meinturnierplan_url: "",
  });
  const body = renderEmailTemplate(
    "Hallo {{contact_first_name}},\n\nwir prüfen Ihre Bewerbung für {{team_name}}.",
    variables,
  );

  return buildTournamentHubEmailFromTemplate({
    subject: "Bewerbung in Prüfung",
    bodyText: body,
    variables,
  });
}

function renderCancellationRequestEmail() {
  const body = renderEmailTemplate(
    "Neue Absageanfrage für {{team_name}}.\nGrund: {{cancellation_reason}}",
    sampleVariables(),
  );

  return buildTournamentHubEmailFromTemplate({
    subject: "Absageanfrage eingegangen",
    bodyText: body,
    variables: sampleVariables({
      participation_url: "",
      confirmation_url: "",
      tournament_url: "",
      schedule_url: "",
      live_url: "",
      meinturnierplan_url: "",
    }),
    cta: null,
  });
}

function renderCancellationDecisionEmail() {
  const body = renderEmailTemplate(
    "Hallo {{contact_first_name}},\n\nIhre Absage wurde bestätigt.\n{{cancellation_admin_note}}",
    sampleVariables(),
  );

  return buildTournamentHubEmailFromTemplate({
    subject: "Absage bestätigt",
    bodyText: body,
    variables: sampleVariables({
      participation_url: "",
      confirmation_url: "",
      tournament_url: "",
      schedule_url: "",
      live_url: "",
      meinturnierplan_url: "",
    }),
    cta: null,
  });
}

function renderPaymentReminderEmail() {
  const body = renderEmailTemplate(
    "Hallo {{contact_first_name}},\n\nZahlungserinnerung für {{team_name}}.\nBetrag: {{participation_fee}}\nStatus: {{payment_status_label}}",
    sampleVariables({ participation_fee: "50,00 €" }),
  );

  return buildTournamentHubEmailFromTemplate({
    subject: "Zahlungserinnerung",
    bodyText: body,
    variables: sampleVariables({
      participation_url: "",
      confirmation_url: "",
      schedule_url: "",
      live_url: "",
      meinturnierplan_url: "",
    }),
  });
}

function renderCommunicationEmail(requireConfirmation: boolean) {
  const variables = sampleVariables({
    participation_url: "",
    schedule_url: "",
    live_url: "",
    meinturnierplan_url: "",
    confirmation_url: requireConfirmation
      ? "https://vf-l-tournament-hub.vercel.app/mitteilung/sample-token"
      : "",
  });
  let body = renderEmailTemplate(
    "Hallo {{contact_first_name}},\n\nInformation zum Turnier {{tournament_name}}.\n{{tournament_url}}",
    variables,
  );

  if (requireConfirmation) {
    body += buildCommunicationReceiptEmailAppendix(variables.confirmation_url);
  }

  return buildTournamentHubEmailFromTemplate({
    subject: "Turnierinformation",
    bodyText: body,
    variables,
  });
}

export function runTournamentHubEmailDesignChecks() {
  assert(escapeHtml(`ä ö ü ß <script>"'&`) === "ä ö ü ß &lt;script&gt;&quot;&#39;&amp;", "escapeHtml");

  const accepted = renderAcceptedEmail();
  assert(accepted.html.includes("Bewerbung angenommen"), "accepted title");
  assert(accepted.html.includes("Hallo Max,"), "accepted greeting");
  assert(accepted.html.includes("Teilnahme verwalten"), "accepted CTA label");
  assert(accepted.html.includes("https://vf-l-tournament-hub.vercel.app/teilnahme/sample-token"), "accepted CTA url");
  assert(accepted.text.includes("Bewerbung angenommen") || accepted.text.includes("angenommen"), "accepted text");

  const rejected = renderRejectedEmail();
  assert(rejected.html.includes("Bewerbung abgelehnt"), "rejected title");
  assert(!rejected.html.includes("Teilnahme verwalten"), "rejected no CTA");

  const waitingList = renderWaitingListEmail();
  assert(waitingList.html.includes("Warteliste"), "waiting list title");

  const underReview = renderUnderReviewEmail();
  assert(underReview.html.includes("Bewerbung in Prüfung"), "under review title");

  const cancellationRequest = renderCancellationRequestEmail();
  assert(cancellationRequest.html.includes("Absageanfrage eingegangen"), "cancellation request title");
  assert(!cancellationRequest.html.includes('href="https://'), "cancellation request no CTA");

  const cancellationDecision = renderCancellationDecisionEmail();
  assert(cancellationDecision.html.includes("Absage bestätigt"), "cancellation decision title");

  const paymentReminder = renderPaymentReminderEmail();
  assert(paymentReminder.html.includes("Zahlungserinnerung"), "payment reminder title");
  assert(paymentReminder.html.includes("Turnier ansehen"), "payment reminder CTA");

  const communication = renderCommunicationEmail(false);
  assert(communication.html.includes("Turnierinformation"), "communication title");
  assert(communication.html.includes("Turnier ansehen"), "communication tournament CTA");
  assert(!communication.html.includes("Erhalt bestätigen"), "communication without confirmation CTA");

  const communicationReceipt = renderCommunicationEmail(true);
  assert(communicationReceipt.html.includes("Erhalt bestätigen"), "communication confirmation CTA");
  assert(communicationReceipt.text.includes("Bitte bestätige den Erhalt"), "communication receipt appendix text");

  const noCta = buildTournamentHubEmailFromTemplate({
    subject: "Ohne CTA",
    bodyText: "Nur Text",
    variables: sampleVariables({
      participation_url: "",
      confirmation_url: "",
      tournament_url: "",
      schedule_url: "",
      live_url: "",
      meinturnierplan_url: "",
    }),
    cta: null,
  });
  assert(!noCta.html.includes('bgcolor="#0f4c2a"'), "no CTA button when disabled");

  const longNames = buildTournamentHubEmailFromTemplate({
    subject: "Langer Name",
    bodyText: "Nachricht",
    variables: sampleVariables({
      team_name: "Sehr langer Mannschaftsname mit Sonderzeichen äöüß <>&\"'",
      club_name: "Sehr langer Vereinsname mit Sonderzeichen äöüß <>&\"'",
      tournament_name: "Sehr langes Turnier mit Sonderzeichen äöüß <>&\"'",
    }),
    cta: null,
  });
  assert(longNames.html.includes("äöüß"), "umlauts preserved");
  assert(!longNames.html.includes("<script>"), "html injection escaped in tournament info");
  assert(longNames.html.includes("&lt;"), "angle brackets escaped");

  const multiline = buildTournamentHubEmail({
    title: "Mehrzeilig",
    bodyText: "Zeile 1\nZeile 2\n\nAbsatz 2",
  });
  assert(multiline.html.includes("Zeile 1<br />Zeile 2"), "line breaks rendered");
  assert(multiline.html.includes("Absatz 2"), "paragraph rendering");

  const mobile = buildTournamentHubEmail({
    title: "Mobile",
    bodyText: "Inhalt",
  });
  assert(mobile.html.includes('width="100%"'), "responsive table width");
  assert(mobile.html.includes("max-width:600px"), "mobile max width");
  assert(mobile.html.includes("<!DOCTYPE html>"), "full html document");
  assert(!mobile.html.includes("<script"), "no javascript");
  assert(!mobile.html.includes("tailwind"), "no tailwind dependency");
  assert(mobile.html.includes("https://"), "absolute https logo url");

  assert(isValidHttpsUrl("https://example.com"), "valid https url");
  assert(!isValidHttpsUrl("http://example.com"), "reject http url");
  assert(!isValidHttpsUrl("javascript:alert(1)"), "reject javascript url");

  const cta = resolveEmailCta({
    confirmation_url: "https://vf-l-tournament-hub.vercel.app/mitteilung/token",
    participation_url: "https://vf-l-tournament-hub.vercel.app/teilnahme/token",
  });
  assert(cta?.label === "Erhalt bestätigen", "confirmation CTA priority");

  const receivedMail = readRepoFile("src/lib/email/received-mail.ts");
  const statusMail = readRepoFile("src/lib/email/status-mail.ts");
  const cancellationMail = readRepoFile("src/lib/cancellations/cancellation-mail.ts");
  const communicationMail = readRepoFile("src/lib/communications/communication-mail.ts");
  const dedupMigration = readRepoFile(
    "supabase/migrations/20260831230000_communication_recipient_email_dedup.sql",
  );

  assert(receivedMail.includes("buildTournamentHubEmailFromTemplate"), "received mail uses layout");
  assert(statusMail.includes("buildTournamentHubEmailFromTemplate"), "status mail uses layout");
  assert(cancellationMail.includes("buildTournamentHubEmailFromTemplate"), "cancellation mail uses layout");
  assert(communicationMail.includes("buildTournamentHubEmailFromTemplate"), "communication mail uses layout");
  assert(!communicationMail.includes("resolve_communication_recipients"), "recipient resolver untouched");
  assert(dedupMigration.includes("DISTINCT ON (lower(btrim(a.contact_email)))"), "PR34 dedup unchanged");

  const provider = readRepoFile("src/lib/email/provider.ts");
  assert(provider.includes('from "@/lib/email/tournament-hub-email"'), "provider re-exports layout");

  const rbacMigration = readRepoFile(
    "supabase/migrations/20260831210000_rbac_domain_rls_enforcement.sql",
  );
  assert(rbacMigration.includes("communications.view"), "rbac view unchanged");
  assert(rbacMigration.includes("communications.send"), "rbac send unchanged");

  const logoUrl = resolveEmailLogoUrl();
  assert(logoUrl === `${DEFAULT_PRODUCTION_SITE_URL}/vfl-logo-transparent.png`, "canonical logo url");
  assert(logoUrl.startsWith("https://"), "logo url is https");
  assert(!logoUrl.includes("localhost"), "logo url no localhost");
  assert(!logoUrl.includes("blim"), "logo url no blim domain");
  assert(!logoUrl.includes("vf-l-tournament-hub-blim"), "logo url no preview domain");

  const logoHtml = buildTournamentHubEmail({ title: "Logo", bodyText: "Test" }).html;
  assert(!logoHtml.includes('src="/'), "final html has no relative image src");
  assert(!logoHtml.includes("data:image"), "no base64 logo");
  assert(logoHtml.includes(`src="${logoUrl}"`), "logo src is absolute https url");
  assert(logoHtml.includes("VfL Kirchheim"), "text branding present without image");

  assert(!isValidHttpsUrl("/teilnahme/token"), "reject relative url");
  assert(!isValidHttpsUrl("//vf-l-tournament-hub.vercel.app/live"), "reject protocol-relative url");
  assert(!isValidHttpsUrl("data:text/html,test"), "reject data url");
  assert(!isValidHttpsUrl("http://vf-l-tournament-hub.vercel.app/live"), "reject http url");
  assert(!isValidHttpsUrl("https://localhost/teilnahme/token"), "reject localhost https");
  assert(
    !isValidHttpsUrl("https://vf-l-tournament-hub-blim.vercel.app/live"),
    "reject ephemeral vercel host",
  );
  assert(!isValidHttpsUrl("not-a-url"), "reject malformed url");
  assert(
    isValidHttpsUrl("https://vf-l-tournament-hub.vercel.app/teilnahme/a?b=1&c=2"),
    "accept canonical https url with query",
  );

  const ctaWithQuery = buildTournamentHubEmailFromTemplate({
    subject: "CTA Query",
    bodyText: "Text",
    variables: {
      confirmation_url: "https://vf-l-tournament-hub.vercel.app/mitteilung/a?b=1&c=2",
    },
  });
  assert(
    ctaWithQuery.html.includes(
      'href="https://vf-l-tournament-hub.vercel.app/mitteilung/a?b=1&amp;c=2"',
    ),
    "ampersand escaped safely in cta href",
  );

  const injectionBody = `<script>alert(1)</script>
<img src=x onerror=alert(1)>
<a href="javascript:alert(1)">Test</a>
Tom & Jerry
"VfL" <Team>`;
  const injectionEmail = buildTournamentHubEmailFromTemplate({
    subject: injectionBody,
    bodyText: injectionBody,
    variables: {
      team_name: injectionBody,
      club_name: injectionBody,
      tournament_name: injectionBody,
      contact_first_name: "Tom",
    },
    cta: {
      label: `Tom & Jerry "CTA"`,
      url: "https://vf-l-tournament-hub.vercel.app/turniere/test",
    },
  });
  assert(!injectionEmail.html.includes("<script>"), "subject/body script escaped");
  assert(!injectionEmail.html.includes("<img src=x"), "img injection escaped");
  assert(!injectionEmail.html.includes('href="javascript:'), "javascript href escaped in body");
  assert(injectionEmail.html.includes("Tom &amp; Jerry"), "ampersand escaped in body");
  assert(injectionEmail.html.includes("&quot;VfL&quot;"), "quotes escaped in body");
  assert(injectionEmail.html.includes("Tom &amp; Jerry &quot;CTA&quot;"), "cta label escaped");
  assert(injectionEmail.html.includes("<title>&lt;script&gt;"), "subject escaped in title tag");

  const cancellationVariables = {
    contact_first_name: "Max",
    contact_last_name: "Mustermann",
    club_name: "SV Beispiel",
    team_name: "U13",
    tournament_name: "Cup",
    tournament_date: "12.09.2026",
    location: "Kirchheim",
    contact_email: "team@example.com",
    cancellation_reason: "Verletzung",
    cancellation_on_time_label: "Fristgerecht",
    cancellation_admin_note: "Keine Begründung",
  };
  assert(resolveEmailCta(cancellationVariables) === null, "cancellation variables have no cta");
  assert(cancellationMail.includes("cta: null"), "cancellation mails explicitly disable cta");

  assert(receivedMail.includes("text: emailContent.text"), "received mail sends text");
  assert(receivedMail.includes("html: emailContent.html"), "received mail sends html");
  assert(statusMail.includes("text: emailContent.text"), "status mail sends text");
  assert(statusMail.includes("html: emailContent.html"), "status mail sends html");
  assert(cancellationMail.includes("text: emailContent.text"), "cancellation mail sends text");
  assert(cancellationMail.includes("html: emailContent.html"), "cancellation mail sends html");
  assert(communicationMail.includes("text: emailContent.text"), "communication mail sends text");
  assert(communicationMail.includes("html: emailContent.html"), "communication mail sends html");

  return "ok";
}
