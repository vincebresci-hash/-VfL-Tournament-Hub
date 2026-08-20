import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminTournamentDetailView } from "@/components/admin/AdminTournamentDetailView";
import {
  getAdminTournamentById,
  getAdminTournamentBySlug,
} from "@/lib/db/admin-queries";
import { listAdminApplications } from "@/lib/db/queries";

type TournamentDetailPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

async function loadTournament(idOrSlug: string) {
  return (
    (await getAdminTournamentById(idOrSlug)) ??
    (await getAdminTournamentBySlug(idOrSlug))
  );
}

export async function generateMetadata({
  params,
}: TournamentDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const tournament = await loadTournament(id);

  return {
    title: tournament ? tournament.name : "Turnier",
  };
}

export default async function AdminTournamentDetailPage({
  params,
}: TournamentDetailPageProps) {
  const { id } = await params;
  const [tournament, applicationsResult] = await Promise.all([
    loadTournament(id),
    listAdminApplications(),
  ]);

  if (!tournament) {
    notFound();
  }

  return (
    <AdminTournamentDetailView
      tournament={tournament}
      applications={applicationsResult.applications}
    />
  );
}
