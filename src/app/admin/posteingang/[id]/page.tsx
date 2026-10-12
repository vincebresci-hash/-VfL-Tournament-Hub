import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InboxMessageDetailView } from "@/components/admin/InboxMessageDetail";
import { AdminNotice, AdminPageHeader } from "@/components/admin/AdminPanel";
import { getAuthSession } from "@/lib/auth/session";
import { canManageInbox } from "@/lib/inbox/access";
import { getInboxMessageDetail } from "@/lib/inbox/queries";
import { loadUserAuthorization } from "@/lib/rbac/queries";

export const metadata: Metadata = { title: "Nachricht" };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function AdminInboxMessagePage({ params }: { params: Params }) {
  const { id } = await params;
  const session = await getAuthSession();
  const authorization = session ? await loadUserAuthorization(session.user.id) : null;
  const { message, ready } = await getInboxMessageDetail(id);

  if (!ready) {
    return (
      <div className="space-y-5">
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
    <div className="space-y-4">
      <AdminPageHeader
        title="Nachricht"
        description="Lokaler Status — ohne Änderungen am IONOS-Postfach."
      />
      <InboxMessageDetailView
        message={message}
        canManage={canManageInbox(session, authorization)}
      />
    </div>
  );
}
