import type { Metadata } from "next";
import { Suspense } from "react";
import { ApplicationsBoard } from "@/components/admin/ApplicationsBoard";
import { listAdminTournamentRecords } from "@/lib/db/admin-queries";

export const metadata: Metadata = {
  title: "Bewerbungen",
};

export default async function AdminApplicationsPage() {
  const tournaments = await listAdminTournamentRecords();

  return (
    <Suspense fallback={<p className="text-[15px] text-muted">Bewerbungen werden geladen.</p>}>
      <ApplicationsBoard tournaments={tournaments} />
    </Suspense>
  );
}
