import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TournamentAdminChrome } from "@/components/admin/TournamentAdminChrome";
import { TournamentGroupsBoard } from "@/components/admin/TournamentGroupsBoard";
import {
  getAdminTournamentById,
  getAdminTournamentBySlug,
} from "@/lib/db/admin-queries";
import { getAdminTournamentStage } from "@/lib/db/schedule-queries";
import { getTournamentParticipants } from "@/lib/db/tournament-participants-queries";
import { stageStatusFor } from "@/lib/schedule/admin";

type GroupsPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

async function loadTournament(idOrSlug: string) {
  return (
    (await getAdminTournamentById(idOrSlug)) ??
    (await getAdminTournamentBySlug(idOrSlug))
  );
}

export async function generateMetadata({ params }: GroupsPageProps): Promise<Metadata> {
  const { id } = await params;
  const tournament = await loadTournament(id);
  return { title: tournament ? `Gruppen · ${tournament.name}` : "Gruppen" };
}

export default async function AdminTournamentGroupsPage({ params }: GroupsPageProps) {
  const { id } = await params;
  const tournament = await loadTournament(id);

  if (!tournament) {
    notFound();
  }

  const [stage, participants] = await Promise.all([
    getAdminTournamentStage(tournament.id),
    getTournamentParticipants(tournament.id),
  ]);

  return (
    <TournamentAdminChrome
      tournament={tournament}
      stageStatus={stageStatusFor(tournament, stage.groups.length, stage.matches)}
      current="groups"
    >
      {!stage.ready ? (
        <p className="border border-line bg-white px-5 py-4 text-[14px] text-muted">
          Die Datenbank ist noch nicht eingerichtet. Bitte die SQL-Migration im Supabase SQL
          Editor ausführen.
        </p>
      ) : (
        <TournamentGroupsBoard
          tournamentId={tournament.id}
          participants={participants}
          groups={stage.groups}
          groupIdByParticipantId={stage.groupIdByApplicationId}
          hasMatches={stage.matches.length > 0}
        />
      )}
    </TournamentAdminChrome>
  );
}
