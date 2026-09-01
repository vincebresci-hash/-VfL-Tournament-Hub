import { readFileSync } from "node:fs";
import { join } from "node:path";
import { countApplicationsByStatus } from "@/lib/tournament-capacity";
import {
  allowedRecipientFiltersForType,
  defaultRecipientFilterForType,
  isRecipientFilterAllowed,
  requiresCustomApplicationIds,
} from "@/lib/communications/recipient-filters";
import {
  buildCommunicationVariables,
  stripUnresolvedPlaceholders,
} from "@/lib/communications/variables";
import { resolveFinalizeCommunicationStatus } from "@/lib/communications/finalize-communication";
import { renderEmailTemplate } from "@/lib/email/provider";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readMigration() {
  return readFileSync(
    join(process.cwd(), "supabase/migrations/20260830120000_communication_center.sql"),
    "utf8",
  );
}

function readMail() {
  return readFileSync(
    join(process.cwd(), "src/lib/communications/communication-mail.ts"),
    "utf8",
  );
}

function readActions() {
  return readFileSync(join(process.cwd(), "src/lib/communications/actions.ts"), "utf8");
}

function readFaq() {
  return readFileSync(join(process.cwd(), "src/data/faq.tsx"), "utf8");
}

function readCancellationMigration() {
  return readFileSync(
    join(process.cwd(), "supabase/migrations/20260829160000_cancellation_requests.sql"),
    "utf8",
  );
}

function readStatusMailMigration() {
  return readFileSync(
    join(process.cwd(), "supabase/migrations/20260827200000_status_email_idempotency.sql"),
    "utf8",
  );
}

function readOccupancyMigration() {
  return readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260825140000_external_team_participation_status.sql",
    ),
    "utf8",
  );
}

export function runCommunicationChecks() {
  const migration = readMigration();
  const mail = readMail();
  const actions = readActions();
  const faq = readFaq();
  const cancellationMigration = readCancellationMigration();
  const statusMailMigration = readStatusMailMigration();
  const occupancyMigration = readOccupancyMigration();

  assert(migration.includes("tournament_communications"), "tournament_communications table");
  assert(migration.includes("communication_recipients"), "communication_recipients table");
  assert(
    migration.includes("communication_email_send_keys"),
    "communication_email_send_keys table",
  );
  assert(
    migration.includes("communication_recipient_id"),
    "email_logs.communication_recipient_id",
  );
  assert(
    !migration.includes("communication_confirmation_tokens"),
    "no confirmation tokens in C1",
  );
  assert(
    !migration.includes("CREATE TYPE public.communication"),
    "no new communication enum",
  );
  assert(
    !migration.includes("CREATE OR REPLACE FUNCTION public.validate_secure_access_token"),
    "validate_secure_access_token unchanged",
  );
  assert(!migration.includes("DROP FUNCTION"), "no DROP FUNCTION");
  assert(!migration.includes("ON CONFLICT(type)"), "no email_templates ON CONFLICT(type)");
  assert(
    migration.includes("INSERT INTO public.communication_email_send_keys"),
    "per-recipient reservation",
  );
  assert(
    migration.includes("ON CONFLICT (communication_recipient_id) DO NOTHING"),
    "atomic reservation",
  );
  assert(migration.includes("preview_communication_recipients"), "preview RPC");
  assert(migration.includes("initiate_communication_send"), "initiate RPC");
  assert(migration.includes("reserve_communication_email_send"), "reserve RPC");
  assert(migration.includes("complete_communication_recipient"), "complete RPC");
  assert(migration.includes("finalize_communication"), "finalize RPC");
  assert(
    migration.includes("payment reminder only allows payment-pending or custom filter"),
    "payment reminder filter enforcement",
  );
  assert(
    migration.includes("v_pending = 0 AND v_sending = 0"),
    "finalize incomplete recipient guard",
  );

  assert(mail.includes("getEmailProvider"), "Resend from server module");
  assert(!mail.includes("resend.com"), "no direct Resend fetch in migration");
  assert(mail.includes("reserve_communication_email_send"), "DB reservation before send");
  assert(
    mail.includes('status: "error"') || mail.includes("Versandreservierung fehlgeschlagen"),
    "reserve RPC error reported",
  );
  assert(mail.includes("evaluateCommunicationSendOutcome"), "send outcome evaluation");
  assert(
    mail.includes("list_pending_communication_recipients"),
    "pending recipients loaded via send RPC",
  );
  assert(
    !mail.includes('.from("communication_recipients")'),
    "send path does not query communication_recipients directly",
  );
  assert(mail.includes("communication_recipient_id"), "email_logs link");
  assert(!mail.includes("confirmation_url"), "no confirmation URL in C1");

  assert(actions.includes("previewCommunicationRecipientsAction"), "preview action");
  assert(actions.includes("sendCommunicationAction"), "send action");
  assert(actions.includes("requireCommunicationsManage"), "admin-only actions");

  assert(faq.includes('id: "turnierkommunikation"'), "FAQ communication entry");
  assert(
    faq.includes("Empfangsbestätigung angefordert werden"),
    "FAQ confirmation mention",
  );
  assert(
    faq.includes("dokumentiert ausschließlich den Erhalt der Information"),
    "FAQ receipt disclaimer",
  );

  // A: single recipient via custom filter support
  assert(requiresCustomApplicationIds("custom"), "custom filter exists");
  assert(defaultRecipientFilterForType("payment-reminder") === "payment-pending", "C default");

  // B: accepted filter semantics in migration
  assert(
    migration.includes("p_recipient_filter = 'accepted'"),
    "accepted filter",
  );

  // C: payment reminder pending + fee
  assert(
    migration.includes("participation_fee IS NOT NULL"),
    "payment reminder fee requirement",
  );

  // D/E: idempotency keys
  assert(migration.includes("idempotency_key"), "communication idempotency key");
  assert(
    migration.includes("tournament_communications_idempotency_key_uidx"),
    "idempotency unique index",
  );

  // G/H: custom selection server validated via RPC
  assert(migration.includes("p_application_ids"), "custom application ids");

  // I/J: waitlist and payment-reminder filter rules
  assert(isRecipientFilterAllowed({ type: "general", filter: "waitlist" }), "I waitlist general");
  assert(
    !isRecipientFilterAllowed({ type: "payment-reminder", filter: "waitlist" }),
    "J waitlist payment rejected",
  );
  assert(
    !isRecipientFilterAllowed({ type: "payment-reminder", filter: "accepted" }),
    "payment-reminder + accepted blocked",
  );
  assert(
    !isRecipientFilterAllowed({ type: "payment-reminder", filter: "payment-paid" }),
    "payment-reminder + payment-paid blocked",
  );
  assert(
    isRecipientFilterAllowed({ type: "payment-reminder", filter: "payment-pending" }),
    "payment-reminder + payment-pending allowed",
  );
  assert(
    isRecipientFilterAllowed({ type: "payment-reminder", filter: "custom" }),
    "payment-reminder + custom allowed",
  );

  // K: cancelled/rejected excluded
  assert(migration.includes("'cancelled'"), "cancelled excluded");
  assert(migration.includes("'rejected'"), "rejected excluded");

  // L/M/N/O/P/Q regression guards
  assert(!mail.includes("updateApplicationPaymentAction"), "L payment unchanged");
  assert(!mail.includes("payment_status ="), "L no payment mutation");
  assert(!occupancyMigration.includes("communication"), "M capacity unchanged");
  assert(!cancellationMigration.includes("communication_recipients"), "N cancellation untouched");
  assert(statusMailMigration.includes("status_email_send_keys"), "O status idempotency exists");
  assert(!mail.includes("mein-turnierplan-sync"), "P MTP sync untouched");
  assert(!faq.includes("news_posts"), "Q news untouched");

  const acceptedOnly = countApplicationsByStatus(["accepted", "waiting-list", "rejected"]);
  assert(acceptedOnly.confirmedTeams === 1, "capacity still accepted-only");

  const variables = buildCommunicationVariables({
    contactFirstName: "Max",
    teamName: "Team A",
    clubName: "Club",
    tournamentName: "Cup",
    tournamentSlug: "cup",
    meinTurnierplanUrl: null,
    participationFee: null,
    paymentStatus: null,
  });
  const rendered = stripUnresolvedPlaceholders(
    renderEmailTemplate("Hallo {{contact_first_name}} {{meinturnierplan_url}}", variables),
  );
  assert(rendered.includes("Max"), "variables render");
  assert(!rendered.includes("{{"), "unknown placeholders stripped");

  assert(
    allowedRecipientFiltersForType("payment-reminder").includes("payment-pending"),
    "payment reminder filters",
  );

  const allSent = resolveFinalizeCommunicationStatus(["sent", "sent"]);
  assert(allSent.status === "sent", "all sent => sent");
  assert(allSent.sentCount === 2, "sent count exact");

  const mixed = resolveFinalizeCommunicationStatus(["sent", "failed"]);
  assert(mixed.status === "partially_sent", "sent + failed => partially_sent");

  const allFailed = resolveFinalizeCommunicationStatus(["failed", "failed"]);
  assert(allFailed.status === "failed", "all failed => failed");

  const sentAndSending = resolveFinalizeCommunicationStatus(["sent", "sending"]);
  assert(sentAndSending.status === "sending", "sent + sending => sending");
  assert(sentAndSending.status !== "sent", "sent + sending must not be sent");

  const sentAndPending = resolveFinalizeCommunicationStatus(["sent", "pending"]);
  assert(sentAndPending.status === "sending", "sent + pending => sending");
  assert(sentAndPending.status !== "sent", "sent + pending must not be sent");

  assert(
    readMail().includes("Versandstatus unvollständig") ||
      readFileSync(
        join(process.cwd(), "src/components/admin/CommunicationDetailView.tsx"),
        "utf8",
      ).includes("Versandstatus unvollständig"),
    "incomplete send admin hint",
  );

  return "ok";
}
