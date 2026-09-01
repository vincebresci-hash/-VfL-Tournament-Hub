import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  aggregateConfirmedCounts,
  buildCommunicationListItems,
  COMMUNICATION_LIST_USER_ERROR,
  type CommunicationListRow,
} from "@/lib/communications/list-communications";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readQueries() {
  return readFileSync(join(process.cwd(), "src/lib/communications/queries.ts"), "utf8");
}

function readListPage() {
  return readFileSync(
    join(process.cwd(), "src/app/admin/kommunikation/page.tsx"),
    "utf8",
  );
}

function readListBoard() {
  return readFileSync(
    join(process.cwd(), "src/components/admin/CommunicationListBoard.tsx"),
    "utf8",
  );
}

const sampleRow = (overrides: Partial<CommunicationListRow> = {}): CommunicationListRow => ({
  id: "08102560-4fb8-4982-a4fa-c89f4c9acd6d",
  tournament_id: "tournament-1",
  recipient_source: "tournament-applications",
  type: "general",
  subject: "Test",
  important: false,
  require_confirmation: true,
  recipient_filter: "accepted",
  status: "sent",
  recipient_count: 1,
  sent_count: 1,
  failed_count: 0,
  created_at: "2026-09-01T10:00:00.000Z",
  sent_at: "2026-09-01T10:01:00.000Z",
  ...overrides,
});

export function runCommunicationListChecks() {
  const queries = readQueries();
  const listPage = readListPage();
  const listBoard = readListBoard();

  // Parent query no longer embeds tournaments
  const listStart = queries.indexOf("export async function listCommunications");
  const listEnd = queries.indexOf("export async function getCommunicationDetail");
  const listCommunicationsBlock =
    listStart >= 0 && listEnd > listStart
      ? queries.slice(listStart, listEnd)
      : "";
  assert(
    listCommunicationsBlock.includes('.from("tournament_communications")') &&
      listCommunicationsBlock.includes("sent_count, failed_count, created_at, sent_at") &&
      !listCommunicationsBlock.includes("tournaments (id, name, slug)"),
    "list query loads parent rows without embedded tournaments relation",
  );
  assert(
    queries.includes('.from("tournaments")') &&
      queries.includes('.from("communication_recipients")'),
    "tournament names and confirmations resolved separately",
  );
  assert(
    queries.includes("logCommunicationListQueryError") &&
      queries.includes("COMMUNICATION_LIST_USER_ERROR"),
    "list query logs safe errors and returns user-facing failure",
  );
  assert(
    !queries.match(/if \(error \|\| !data\) \{\s*return \{ communications: \[\], ready:/),
    "list query no longer swallows all errors as empty list",
  );

  // Sent communication appears in list
  const sentItems = buildCommunicationListItems({
    rows: [sampleRow()],
    tournamentsById: new Map([
      ["tournament-1", { id: "tournament-1", name: "E1-Sommercup 2026", slug: "e1-sommercup-2026" }],
    ]),
    confirmedCountsByCommunicationId: new Map(),
  });
  assert(sentItems.length === 1, "sent communication appears in list");
  assert(sentItems[0]?.subject === "Test", "subject preserved");
  assert(sentItems[0]?.tournamentName === "E1-Sommercup 2026", "tournament name resolved");
  assert(sentItems[0]?.sentCount === 1, "sent count preserved");
  assert(sentItems[0]?.failedCount === 0, "failed count preserved");
  assert(sentItems[0]?.status === "sent", "status preserved");

  // Tournament lookup failure does not hide parent communication
  const withoutTournament = buildCommunicationListItems({
    rows: [sampleRow()],
    tournamentsById: new Map(),
    confirmedCountsByCommunicationId: new Map(),
  });
  assert(withoutTournament.length === 1, "communication remains when tournament lookup fails");
  assert(withoutTournament[0]?.tournamentName === "Turnier", "fallback tournament label");

  // Confirmed counts
  const confirmedCounts = aggregateConfirmedCounts([
    {
      communication_id: "comm-1",
      confirmed_at: null,
    },
    {
      communication_id: "comm-1",
      confirmed_at: "2026-09-01T11:00:00.000Z",
    },
  ]);
  assert(confirmedCounts.get("comm-1") === 1, "confirmed count 1/1 aggregate");

  const noneConfirmed = buildCommunicationListItems({
    rows: [sampleRow({ id: "comm-1", recipient_count: 1, require_confirmation: true })],
    tournamentsById: new Map(),
    confirmedCountsByCommunicationId: new Map(),
  });
  assert(noneConfirmed[0]?.confirmedCount === 0, "confirmed count 0/1");

  const oneConfirmed = buildCommunicationListItems({
    rows: [sampleRow({ id: "comm-1", recipient_count: 1, require_confirmation: true })],
    tournamentsById: new Map(),
    confirmedCountsByCommunicationId: new Map([["comm-1", 1]]),
  });
  assert(oneConfirmed[0]?.confirmedCount === 1, "confirmed count 1/1");

  // UI: query error vs empty state
  assert(
    listPage.includes("error ?") &&
      listPage.includes('role="alert"') &&
      listPage.includes("border-red-200"),
    "list page shows admin error state on query failure",
  );
  assert(
    listPage.includes("<CommunicationListBoard communications={communications} />") &&
      listPage.indexOf("error ?") <
        listPage.indexOf("<CommunicationListBoard communications={communications} />"),
    "empty board is not rendered when list query failed",
  );
  assert(
    listBoard.includes("Noch keine Kommunikationen versendet."),
    "true empty database still renders empty-state copy",
  );
  assert(
    listBoard.includes("Empfang bestätigt") &&
      listBoard.includes("item.requireConfirmation") &&
      listBoard.includes("${item.confirmedCount} / ${item.recipientCount}"),
    "list board shows confirmation count when required",
  );
  assert(
    listBoard.includes("Gesendet") && listBoard.includes("Fehlgeschlagen"),
    "list board shows sent and failed counts",
  );
  assert(
    COMMUNICATION_LIST_USER_ERROR.includes("nicht geladen"),
    "user-facing list error is generic",
  );

  return "ok";
}
