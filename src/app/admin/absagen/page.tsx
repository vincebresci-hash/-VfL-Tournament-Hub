import type { Metadata } from "next";
import { CancellationRequestsBoard } from "@/components/admin/CancellationRequestsBoard";
import { AdminNavSeenMarker } from "@/components/admin/AdminNavSeenMarker";
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
        description="Offene Absageanfragen prüfen und abgeschlossene Anfragen im Archiv einsehen."
      />
      {!ready ? (
        <AdminNotice>Absageanfragen konnten nicht geladen werden.</AdminNotice>
      ) : (
        <div className="mt-8">
          <AdminNavSeenMarker
            navKey="cancellations"
            ready={ready}
            items={requests.map((request) => ({
              id: request.id,
              timestamp: request.requestedAt,
            }))}
          />
          <CancellationRequestsBoard requests={requests} />
        </div>
      )}
    </div>
  );
}
