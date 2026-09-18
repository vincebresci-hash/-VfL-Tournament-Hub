import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GUEST_CANCELLATION_RECOVERY_PUBLIC_MESSAGE } from "@/lib/cancellations/recovery-constants";
import { isTournamentWithinGuestRecoveryWindow } from "@/lib/cancellations/recovery-tournament-window";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(pathFromRoot: string) {
  return readFileSync(join(process.cwd(), pathFromRoot), "utf8");
}

export function runGuestCancellationRecoveryUiChecks() {
  const kontakt = read("src/app/kontakt/page.tsx");
  const absage = read("src/app/kontakt/absage/page.tsx");
  const form = read(
    "src/components/cancellation/GuestCancellationRecoveryForm.tsx",
  );
  const recoveryActions = read("src/lib/cancellations/recovery-actions.ts");
  const recoveryOptions = read(
    "src/lib/cancellations/recovery-tournament-options.ts",
  );
  const recoveryWindow = read(
    "src/lib/cancellations/recovery-tournament-window.ts",
  );
  const publicTournamentQueries = read("src/lib/db/tournament-queries.ts");
  const guidanceChecks = read(
    "src/lib/cancellations/public-cancellation-guidance-checks.ts",
  );

  // 1–2 CTA on /kontakt
  assert(kontakt.includes("Absage anfragen"), "/kontakt contains Absage anfragen");
  assert(
    kontakt.includes('href="/kontakt/absage"'),
    "CTA points to /kontakt/absage",
  );

  // 3 form-free /kontakt
  assert(!kontakt.includes("<form"), "/kontakt has no recovery form");
  assert(
    !kontakt.includes("requestGuestCancellationRecoveryAction"),
    "/kontakt does not invoke recovery action",
  );

  // 4 public route page exists
  assert(
    absage.includes("GuestCancellationRecoveryForm"),
    "/kontakt/absage renders recovery form",
  );
  assert(
    absage.includes('withCanonical("/kontakt/absage"'),
    "/kontakt/absage is public canonical route",
  );
  assert(!absage.includes("requireAuth"), "/kontakt/absage has no auth gate");
  assert(!absage.includes("redirect("), "/kontakt/absage has no login redirect");

  // 5–8 form fields
  assert(form.includes('name="tournamentId"'), "form has tournamentId");
  assert(form.includes('name="clubName"'), "form has clubName");
  assert(form.includes('name="teamName"'), "form has teamName");
  assert(form.includes('name="contactEmail"'), "form has contactEmail");

  // 9 honeypot
  assert(
    form.includes("honeypot") && form.includes("companyWebsite"),
    "honeypot exists",
  );
  assert(
    form.includes("-left-[10000px]") || form.includes("aria-hidden"),
    "honeypot visually hidden",
  );

  // 10 no application_id
  assert(
    !form.includes("application_id") &&
      !form.includes("applicationId") &&
      !absage.includes("application_id") &&
      !absage.includes("applicationId"),
    "no application_id field",
  );

  // 11–12 no participant/application search/autocomplete
  assert(
    !form.includes("autocomplete from") &&
      !form.includes("listPublicApplications") &&
      !absage.includes("applications") &&
      !recoveryOptions.includes('.from("applications")') &&
      !recoveryOptions.includes("from('applications')"),
    "no applications query used for selector",
  );
  assert(
    !form.includes("datalist") && !form.includes("suggest"),
    "no team autocomplete from applications",
  );

  // 13–14 reuse C2A action, no duplicate matching
  assert(
    form.includes("requestGuestCancellationRecoveryAction"),
    "existing C2A server action reused",
  );
  assert(
    !form.includes("issue_guest_cancellation_recovery_token") &&
      !form.includes("createServiceRoleClient") &&
      !form.includes("secure_access_tokens"),
    "no duplicate matching/token logic in UI",
  );
  assert(
    recoveryActions.includes("requestGuestCancellationRecoveryAction"),
    "C2A recovery action still present",
  );

  // 15–16 neutral result
  assert(
    form.includes("GUEST_CANCELLATION_RECOVERY_PUBLIC_MESSAGE") ||
      form.includes(GUEST_CANCELLATION_RECOVERY_PUBLIC_MESSAGE),
    "canonical neutral result used",
  );
  assert(
    !form.includes("Teilnahme gefunden") &&
      !form.includes("E-Mail stimmt nicht") &&
      !form.includes("Mannschaft nicht gefunden") &&
      !form.includes("Keine Bewerbung gefunden"),
    "no success/failure enumeration messages",
  );

  // 17–19 preserved paths
  assert(
    kontakt.includes('href="/verein/bewerbungen"') &&
      absage.includes('href="/verein/bewerbungen"'),
    "registered club path /verein/bewerbungen remains",
  );
  assert(
    kontakt.includes("Über die Zusage-E-Mail") &&
      kontakt.includes("Teilnahme") &&
      kontakt.includes("verwalten"),
    "acceptance-email guidance remains",
  );
  assert(
    kontakt.includes("mailto:${email}") || kontakt.includes("mailto:${email}?"),
    "contact/mail fallback remains",
  );

  // 20–21 informational copy on absage page
  assert(
    absage.includes("weniger als 14 Tage vor dem Turnier"),
    "<14-day information shown",
  );
  assert(
    absage.includes("erst gültig, nachdem sie vom VfL Kirchheim") &&
      absage.includes("bestätigt"),
    "explicit VfL confirmation required copy",
  );
  assert(
    absage.includes("storniert eure Teilnahme noch") &&
      absage.includes("nicht"),
    "form does not cancel participation immediately",
  );

  // 22 no direct cancellation
  assert(
    !form.includes("submitExternalCancellationRequest") &&
      !form.includes("cancellation_requests") &&
      !absage.includes("submitExternalCancellationRequest"),
    "no cancellation request created directly",
  );

  // 23–24 no migration / grants / RLS in this PR (source invariant)
  assert(
    !absage.includes("supabase/migrations") &&
      !form.includes("CREATE POLICY") &&
      !form.includes("GRANT "),
    "no DB migration/RLS/grant wiring in UI",
  );

  // 25 multi-team wording
  assert(
    form.includes("Team I oder Team II getrennt") ||
      form.includes("denselben Namen wie in der Bewerbung"),
    "multi-team wording does not imply group cancellation",
  );

  // C1 checks still require form-free kontakt
  assert(
    guidanceChecks.includes("no public cancellation form on /kontakt") ||
      guidanceChecks.includes("no public cancellation form"),
    "C1 guidance checks still enforce form-free /kontakt",
  );

  // Recovery tournament selector (archived-window fix)
  assert(
    absage.includes("listGuestCancellationRecoveryTournamentOptions"),
    "absage uses recovery tournament options helper",
  );
  assert(
    !absage.includes("listPublicTournaments"),
    "absage does not use listPublicTournaments",
  );
  assert(
    recoveryOptions.includes('import "server-only"') ||
      recoveryOptions.includes("import 'server-only'"),
    "recovery tournament helper is server-only",
  );
  assert(
    recoveryOptions.includes("createServiceRoleClient"),
    "recovery tournament helper uses trusted server client",
  );
  assert(
    recoveryOptions.includes("service_role_unavailable") &&
      recoveryOptions.includes("query_error") &&
      recoveryOptions.includes("empty_data_without_error") &&
      recoveryOptions.includes("query_success") &&
      recoveryOptions.includes("fetched_count=") &&
      recoveryOptions.includes("eligible_count="),
    "recovery tournament helper logs diagnostic branch events server-side",
  );
  assert(
    recoveryOptions.includes("[guest-cancellation-recovery-tournaments]") &&
      !absage.includes("[guest-cancellation-recovery-tournaments]") &&
      !form.includes("[guest-cancellation-recovery-tournaments]"),
    "diagnostic logs stay server-only (not in public UI sources)",
  );
  assert(
    recoveryOptions.includes('select("id, name, date")') ||
      recoveryOptions.includes("select('id, name, date')"),
    "recovery selector returns only safe tournament metadata",
  );
  assert(
    !recoveryOptions.includes("contact_email") &&
      !recoveryOptions.includes("club_name") &&
      !recoveryOptions.includes("team_name") &&
      !recoveryOptions.includes("application_id") &&
      !recoveryOptions.includes("confirmedTeams") &&
      !recoveryOptions.includes("waitlist"),
    "no participant/team/contact data returned",
  );
  assert(
    !recoveryOptions.includes("applications_open") &&
      !recoveryOptions.includes("applicationsOpen") &&
      !recoveryOptions.includes('.eq("applications_open"'),
    "applications_open=false does not exclude recovery tournament",
  );
  assert(
    !recoveryOptions.includes("archived_at") &&
      !recoveryOptions.includes("archivedAt") &&
      !recoveryOptions.includes("includeArchived") &&
      !recoveryOptions.includes('.is("archived_at"'),
    "archived tournament within C2A recovery window CAN be selected",
  );
  assert(
    recoveryOptions.includes("isTournamentWithinGuestRecoveryWindow") &&
      recoveryWindow.includes("secureAccessTokenExpiresAt"),
    "selector uses C2A recovery expiry window",
  );
  assert(
    !recoveryOptions.includes("clubName") &&
      !recoveryOptions.includes("teamName") &&
      !recoveryOptions.includes("contactEmail") &&
      !recoveryOptions.includes("honeypot") &&
      !recoveryOptions.includes("tournamentId"),
    "selector result is independent of supplied identity",
  );

  // Pure window semantics aligned with C2A (date UTC + 30 days > now)
  const now = new Date(Date.UTC(2026, 8, 18)); // 2026-09-18
  assert(
    isTournamentWithinGuestRecoveryWindow("2026-09-01", now),
    "within-window tournament date remains selectable",
  );
  assert(
    !isTournamentWithinGuestRecoveryWindow("2026-08-01", now),
    "tournament outside C2A expiry window is not offered",
  );
  assert(
    !isTournamentWithinGuestRecoveryWindow(null, now),
    "missing tournament date is not offered",
  );

  // Global public helper unchanged for archived exclusion
  assert(
    publicTournamentQueries.includes(
      "export async function listPublicTournaments",
    ),
    "listPublicTournaments still exists",
  );
  assert(
    publicTournamentQueries.includes("fetchTournamentRows({ includeArchived: false })"),
    "no global listPublicTournaments behavior changed",
  );

  // C2A action still owns matching/RPC; selector is metadata-only
  assert(
    recoveryActions.includes("issue_guest_cancellation_recovery_token"),
    "C2A action unchanged (RPC still present)",
  );
  assert(
    recoveryActions.includes("GUEST_CANCELLATION_RECOVERY_PUBLIC_MESSAGE"),
    "neutral response unchanged in C2A action",
  );

  return "ok";
}
