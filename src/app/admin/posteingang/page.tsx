import type { Metadata } from "next";
import { InboxBoard } from "@/components/admin/InboxBoard";
import { AdminNotice, AdminPageHeader } from "@/components/admin/AdminPanel";
import { getAuthSession } from "@/lib/auth/session";
import { canTriggerInboxSync } from "@/lib/inbox/access";
import { getInboxSyncStateView, listInboxMessages } from "@/lib/inbox/queries";
import { loadUserAuthorization } from "@/lib/rbac/queries";
import type { InboxProcessingStatus } from "@/lib/inbox/types";

export const metadata: Metadata = { title: "Posteingang" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  q?: string;
  status?: string;
  unread?: string;
}>;

function parseStatus(value: string | undefined): InboxProcessingStatus | "all" {
  if (value === "open" || value === "in_progress" || value === "done") {
    return value;
  }
  return "all";
}

export default async function AdminInboxPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = params.q ?? "";
  const status = parseStatus(params.status);
  const unreadOnly = params.unread === "1";

  const session = await getAuthSession();
  const authorization = session ? await loadUserAuthorization(session.user.id) : null;
  const [{ messages, ready }, { state }] = await Promise.all([
    listInboxMessages({ query, status, unreadOnly }),
    getInboxSyncStateView(),
  ]);

  return (
    <div>
      <AdminPageHeader
        title="Posteingang"
        description="Lesen und lokal bearbeiten von eingehenden Turnier-E-Mails. Kein Versand und keine Änderungen auf dem IONOS-Postfach."
      />
      {!ready ? (
        <AdminNotice>
          Bitte zuerst die Posteingang-Migration im Supabase SQL Editor ausführen.
        </AdminNotice>
      ) : (
        <div className="mt-8">
          <InboxBoard
            messages={messages}
            syncState={state}
            canSync={canTriggerInboxSync(session, authorization)}
            initialQuery={query}
            initialStatus={status}
            initialUnreadOnly={unreadOnly}
          />
        </div>
      )}
    </div>
  );
}
