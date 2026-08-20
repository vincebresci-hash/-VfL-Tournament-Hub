import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TournamentAdminChrome } from "@/components/admin/TournamentAdminChrome";
import { TournamentResultsBoard } from "@/components/admin/TournamentResultsBoard";
import {
  getAdminTournamentById,
  getAdminTournamentBySlug,
} from "@/lib/db/admin-queries";
import { listAdminApplications } from "@/lib/db/queries";
import { getAdminTournamentStage } from "@/lib/db/schedule-queries";
import { acceptedParticipants, stageStatusFor, teamLabelsFromApplications } from "@/lib/schedule/admin";

type ResultsPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

async function loadTournament(idOrSlug: string) {
  return (
    (await getAdminTournamentById(idOrSlug)) ??
    (await getAdminTournamentBySlug(idOrSlug))
  );
}

export async function generateMetadata({ params }: ResultsPageProps): Promise<Metadata> {
  const { id } = await params;
  const tournament = await loadTournament(id);
  return { title: tournament ? `Ergebnisse · ${tournament.name}` : "Ergebnisse" };
}

export default async function AdminTournamentResultsPage({ params }: ResultsPageProps) {
  const { id } = await params;
  const [tournament, applicationsResult] = await Promise.all([
    loadTournament(id),
    listAdminApplications(),
  ]);

  if (!tournament) {
    notFound();
  }

  const stage = await getAdminTournamentStage(tournament.id);
  const participants = acceptedParticipants(applicationsResult.applications, tournament);

  return (
    <TournamentAdminChrome
      tournament={tournament}
      stageStatus={stageStatusFor(tournament, stage.groups.length, stage.matches)}
      current="results"
    >
      {!stage.ready ? (
        <p className="border border-line bg-white px-5 py-4 text-[14px] text-muted">
          Die Datenbank ist noch nicht eingerichtet. Bitte die SQL-Migration im Supabase SQL
          Editor ausführen.
        </p>
      ) : (
        <TournamentResultsBoard
          tournamentId={tournament.id}
          groups={stage.groups}
          fields={stage.fields}
          matches={stage.matches}
          memberIdsByGroupId={stage.memberIdsByGroupId}
          teamLabels={teamLabelsFromApplications(participants)}
        />
      )}
    </TournamentAdminChrome>
  );
}
