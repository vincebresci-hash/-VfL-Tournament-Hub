import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminNotice, AdminPageHeader } from "@/components/admin/AdminPanel";
import { InboxWorkspace } from "@/components/admin/InboxWorkspace";
import { getAuthSession } from "@/lib/auth/session";
import { canManageInbox, canReplyInbox, canTriggerInboxSync } from "@/lib/inbox/access";
import {
  getInboxMessageDetail,
  getInboxSyncStateView,
  listInboxMessages,
} from "@/lib/inbox/queries";
import { loadUserAuthorization } from "@/lib/rbac/queries";
import type { InboxProcessingStatus } from "@/lib/inbox/types";

export const metadata: Metadata = { title: "Nachricht" };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
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

export default async function AdminInboxMessagePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const query = sp.q ?? "";
  const status = parseStatus(sp.status);
  const unreadOnly = sp.unread === "1";

  const session = await getAuthSession();
  const authorization = session ? await loadUserAuthorization(session.user.id) : null;
  const [{ messages, ready: listReady }, { state }, { message, ready: detailReady }] =
    await Promise.all([
      listInboxMessages({ query, status, unreadOnly }),
      getInboxSyncStateView(),
      getInboxMessageDetail(id),
    ]);

  const ready = listReady && detailReady;

  if (!ready) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title="Nachricht" description="Posteingang" />
        <AdminNotice>
          Bitte zuerst die Posteingang-Migration im Supabase SQL Editor ausführen.
        </AdminNotice>
      </div>
    );
  }

  if (!message) {
    notFound();
  }

  return (
    <InboxWorkspace
      key={`inbox|${query}|${status}|${unreadOnly ? "1" : "0"}`}
      messages={messages}
      syncState={state}
      canSync={canTriggerInboxSync(session, authorization)}
      canManage={canManageInbox(session, authorization)}
      canReply={canReplyInbox(session, authorization)}
      initialQuery={query}
      initialStatus={status}
      initialUnreadOnly={unreadOnly}
      selectedMessage={message}
    />
  );
}
