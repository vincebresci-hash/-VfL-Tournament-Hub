import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminTournamentDetailView } from "@/components/admin/AdminTournamentDetailView";
import {
  getAdminTournamentById,
  getAdminTournamentBySlug,
} from "@/lib/db/admin-queries";
import { listAdminApplications } from "@/lib/db/queries";
import { getAdminTournamentStage } from "@/lib/db/schedule-queries";
import { listExternalTeamsForTournamentAction } from "@/lib/db/mein-turnierplan-participants-actions";
import { stageStatusFor } from "@/lib/schedule/admin";

type TournamentDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ bereich?: string | string[] }>;
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
  searchParams,
}: TournamentDetailPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const bereich = Array.isArray(query.bereich) ? query.bereich[0] : query.bereich;
  const [tournament, applicationsResult] = await Promise.all([
    loadTournament(id),
    listAdminApplications(),
  ]);

  if (!tournament) {
    notFound();
  }

  const [stage, externalTeamsResult] = await Promise.all([
    getAdminTournamentStage(tournament.id),
    listExternalTeamsForTournamentAction(tournament.id),
  ]);

  return (
    <AdminTournamentDetailView
      tournament={tournament}
      applications={applicationsResult.applications}
      externalTeams={externalTeamsResult.teams}
      stageStatus={stageStatusFor(tournament, stage.groups.length, stage.matches)}
      current={bereich === "teilnehmer" ? "participants" : "overview"}
    />
  );
}
