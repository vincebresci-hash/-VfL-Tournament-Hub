import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  deduplicateRecipientsByEmail,
  filterVisibleRecipientApplications,
  isApplicationSelectableForCommunication,
  summarizeRecipientPreview,
  type CommunicationEligibleApplication,
} from "@/lib/communications/recipient-picker";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readComposeForm() {
  return readFileSync(
    join(process.cwd(), "src/components/admin/CommunicationComposeForm.tsx"),
    "utf8",
  );
}

function readPicker() {
  return readFileSync(
    join(process.cwd(), "src/components/admin/CommunicationRecipientPicker.tsx"),
    "utf8",
  );
}

function readPreview() {
  return readFileSync(
    join(process.cwd(), "src/components/admin/CommunicationRecipientPreview.tsx"),
    "utf8",
  );
}

function readQueries() {
  return readFileSync(join(process.cwd(), "src/lib/communications/queries.ts"), "utf8");
}

function readActions() {
  return readFileSync(join(process.cwd(), "src/lib/communications/actions.ts"), "utf8");
}

function readComposePage() {
  return readFileSync(
    join(process.cwd(), "src/app/admin/kommunikation/neu/page.tsx"),
    "utf8",
  );
}

const hubApplication: CommunicationEligibleApplication = {
  id: "hub-1",
  status: "accepted",
  contactEmail: "hub@example.com",
  teamName: "Hub Team",
  clubName: "Hub Club",
  ageGroup: "U15",
  isHubTeam: true,
  paymentStatus: "paid",
  participationFee: 50,
};

const externalApplication: CommunicationEligibleApplication = {
  id: "ext-1",
  status: "accepted",
  contactEmail: "external@example.com",
  teamName: "External Team",
  clubName: "External Club",
  ageGroup: "U17",
  isHubTeam: false,
  paymentStatus: "pending",
  participationFee: 50,
};

export function runCommunicationRecipientPickerChecks() {
  const composeForm = readComposeForm();
  const picker = readPicker();
  const preview = readPreview();
  const queries = readQueries();
  const actions = readActions();
  const composePage = readComposePage();

  assert(composeForm.includes("recipientSource"), "recipient source state");
  assert(composeForm.includes("CommunicationTeamDirectoryRecipientPicker"), "directory picker");
  assert(composeForm.includes("CommunicationRecipientPreview"), "recipient preview wired");
  assert(composeForm.includes("canSend"), "send permission gate in compose form");
  assert(composeForm.includes('effectiveRecipientFilter === "custom"'), "custom selection path");
  assert(composeForm.includes("selectedApplicationIds"), "selection uses application ids");
  assert(!composeForm.includes("contactEmail as"), "email not used as primary id");

  assert(picker.includes("Alle sichtbaren auswählen"), "select all visible");
  assert(picker.includes("Auswahl aufheben"), "clear selection");
  assert(picker.includes("Hub / extern"), "hub filter");
  assert(picker.includes("Zahlungsstatus"), "payment filter");
  assert(picker.includes("selectionEnabled"), "selection toggle");

  assert(preview.includes("eindeutige E-Mail"), "unique email summary");
  assert(preview.includes("summarizeRecipientPreview"), "dedup summary");

  assert(queries.includes("age_group"), "age group loaded");
  assert(queries.includes("club_id"), "hub detection fields loaded");
  assert(queries.includes("team_id"), "hub detection fields loaded");
  assert(queries.includes("isHubTeam"), "hub flag mapped");

  assert(actions.includes("requireCommunicationsView"), "preview requires communications.view");
  assert(actions.includes("requireCommunicationsManage"), "send requires communications.send/manage");
  assert(composePage.includes("communications.send"), "page computes send permission");

  assert(
    isApplicationSelectableForCommunication(hubApplication, "general"),
    "hub team selectable",
  );
  assert(
    isApplicationSelectableForCommunication(externalApplication, "general"),
    "external team selectable",
  );
  assert(
    !isApplicationSelectableForCommunication(
      { ...externalApplication, status: "new" },
      "general",
    ),
    "new application not selectable for general",
  );
  assert(
    isApplicationSelectableForCommunication(
      { ...externalApplication, paymentStatus: "pending" },
      "payment-reminder",
    ),
    "pending payment selectable for payment reminder",
  );

  const filtered = filterVisibleRecipientApplications(
    [hubApplication, externalApplication],
    {
      status: "all",
      ageGroup: "U15",
      hub: "all",
      payment: "all",
      search: "",
    },
  );
  assert(filtered.length === 1 && filtered[0]?.id === "hub-1", "age group filter");

  const deduped = deduplicateRecipientsByEmail([
    {
      applicationId: "a-1",
      teamDirectoryEntryId: null,
      recipientEmail: "same@example.com",
      recipientTeamName: "Team A",
      recipientClubName: "Club A",
    },
    {
      applicationId: "a-2",
      teamDirectoryEntryId: null,
      recipientEmail: "same@example.com",
      recipientTeamName: "Team B",
      recipientClubName: "Club B",
    },
  ]);
  assert(deduped.length === 1, "duplicate email deduplicated");

  const summary = summarizeRecipientPreview([
    {
      applicationId: "a-1",
      teamDirectoryEntryId: null,
      recipientEmail: "same@example.com",
      recipientTeamName: "Team A",
      recipientClubName: "Club A",
    },
    {
      applicationId: "a-2",
      teamDirectoryEntryId: null,
      recipientEmail: "other@example.com",
      recipientTeamName: "Team B",
      recipientClubName: "Club B",
    },
  ]);
  assert(summary.teamCount === 2, "team count preserved");
  assert(summary.uniqueEmailCount === 2, "unique email count exact");
  assert(summary.actualRecipientCount === 2, "actual recipient count exact");

  const hiddenSelection = filterVisibleRecipientApplications(
    [hubApplication, externalApplication],
    {
      status: "all",
      ageGroup: "U15",
      hub: "all",
      payment: "all",
      search: "",
    },
  );
  assert(hiddenSelection.length === 1, "filters only affect visibility");
  assert(
    picker.includes("Filter ändern nur die Ansicht, nicht die bestehende Auswahl"),
    "selection preserved across filters",
  );

  assert(
    composeForm.includes("previewRecipients.length === 0"),
    "send blocked without recipients",
  );

  return "ok";
}
