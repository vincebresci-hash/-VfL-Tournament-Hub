import type { Metadata } from "next";
import { CancellationRequestsBoard } from "@/components/admin/CancellationRequestsBoard";
import { AdminPageHeader } from "@/components/admin/AdminPanel";
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
        title="Absageanfragen"
        description="Offene und bearbeitete Absageanfragen für angenommene Turnierteilnahmen."
      />
      {!ready ? (
        <p className="mt-6 border border-line bg-white px-5 py-8 text-[15px] text-muted">
          Absageanfragen konnten nicht geladen werden.
        </p>
      ) : (
        <div className="mt-8">
          <CancellationRequestsBoard requests={requests} />
        </div>
      )}
    </div>
  );
}
