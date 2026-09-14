import type { Metadata } from "next";
import { CancellationRequestsBoard } from "@/components/admin/CancellationRequestsBoard";
import { AdminNotice, AdminPageHeader } from "@/components/admin/AdminPanel";
import { listCancellationRequests } from "@/lib/cancellations/queries";

export const metadata: Metadata = {
  title: "Absageanfragen",
};

export const dynamic = "force-dynamic";

export default async function AdminCancellationRequestsPage() {
  const { requests, ready } = await listCancellationRequests();

  return (
    <div>
      <AdminPageHeader
        title="Absagen"
        description="Absageanfragen prüfen und über die Teilnahme entscheiden."
      />
      {!ready ? (
        <AdminNotice>Absageanfragen konnten nicht geladen werden.</AdminNotice>
      ) : (
        <div className="mt-8">
          <CancellationRequestsBoard requests={requests} />
        </div>
      )}
    </div>
  );
}
