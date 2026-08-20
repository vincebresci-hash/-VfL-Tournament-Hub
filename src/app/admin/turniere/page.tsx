import type { Metadata } from "next";
import { TournamentsAdminBoard } from "@/components/admin/TournamentsAdminBoard";
import { listAdminTournamentRecords } from "@/lib/db/admin-queries";

export const metadata: Metadata = {
  title: "Turniere",
};

export default async function AdminTournamentsPage() {
  const tournaments = await listAdminTournamentRecords();
  return <TournamentsAdminBoard tournaments={tournaments} />;
}
