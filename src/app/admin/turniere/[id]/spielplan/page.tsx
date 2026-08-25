import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TournamentAdminChrome } from "@/components/admin/TournamentAdminChrome";
import { TournamentScheduleBoard } from "@/components/admin/TournamentScheduleBoard";
import {
  getAdminTournamentById,
  getAdminTournamentBySlug,
} from "@/lib/db/admin-queries";
import { getAdminTournamentStage } from "@/lib/db/schedule-queries";
import { getTournamentParticipants } from "@/lib/db/tournament-participants-queries";
import { stageStatusFor, teamLabelsFromParticipants } from "@/lib/schedule/admin";

type SchedulePageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

async function loadTournament(idOrSlug: string) {
  return (
    (await getAdminTournamentById(idOrSlug)) ??
    (await getAdminTournamentBySlug(idOrSlug))
  );
}

export async function generateMetadata({ params }: SchedulePageProps): Promise<Metadata> {
  const { id } = await params;
  const tournament = await loadTournament(id);
  return { title: tournament ? `Spielplan · ${tournament.name}` : "Spielplan" };
}

export default async function AdminTournamentSchedulePage({ params }: SchedulePageProps) {
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
      current="schedule"
    >
      {!stage.ready ? (
        <p className="border border-line bg-white px-5 py-4 text-[14px] text-muted">
          Die Datenbank ist noch nicht eingerichtet. Bitte die SQL-Migration im Supabase SQL
          Editor ausführen.
        </p>
      ) : (
        <TournamentScheduleBoard
          tournament={tournament}
          groups={stage.groups}
          fields={stage.fields}
          matches={stage.matches}
          memberIdsByGroupId={stage.memberIdsByGroupId}
          teamLabels={teamLabelsFromParticipants(participants)}
        />
      )}
    </TournamentAdminChrome>
  );
}
