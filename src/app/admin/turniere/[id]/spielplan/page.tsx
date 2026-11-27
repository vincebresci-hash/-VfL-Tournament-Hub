import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TournamentAdminChrome } from "@/components/admin/TournamentAdminChrome";
import { TournamentScheduleBoard } from "@/components/admin/TournamentScheduleBoard";
import {
  hasPermissionInAuthorization,
  requireAdminSession,
} from "@/lib/auth/guards";
import { canManageSystem } from "@/lib/auth/roles";
import {
  getAdminTournamentById,
  getAdminTournamentBySlug,
} from "@/lib/db/admin-queries";
import { listAssignableClubOptions } from "@/lib/db/club-assignment-actions";
import { readConfirmedParticipantIdentities } from "@/lib/db/confirmed-participant-read";
import { readStoredLeagueScheduleConfig } from "@/lib/db/league-config-read";
import { getAdminTournamentStage } from "@/lib/db/schedule-queries";
import { getAdminLifecyclePanelModel } from "@/lib/db/tournament-lifecycle-admin";
import { getTournamentParticipants } from "@/lib/db/tournament-participants-queries";
import { teamLabelsFromParticipants } from "@/lib/schedule/admin";
import type { Permission } from "@/types/rbac";

type SchedulePageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

async function canScheduleManage() {
  const adminAccess = await requireAdminSession();
  if ("error" in adminAccess && adminAccess.error) {
    return false;
  }
  if (!adminAccess.session || !adminAccess.authorization) {
    return false;
  }
  if (canManageSystem(adminAccess.session.user.role)) {
    return true;
  }
  return hasPermissionInAuthorization(
    adminAccess.authorization,
    adminAccess.session,
    "schedule.manage" satisfies Permission,
  );
}

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

  const [stage, participants, lifecycle, leagueConfig, confirmed, clubOptions] = await Promise.all([
    getAdminTournamentStage(tournament.id),
    getTournamentParticipants(tournament.id),
    getAdminLifecyclePanelModel(tournament.id),
    readStoredLeagueScheduleConfig(tournament.id),
    readConfirmedParticipantIdentities(tournament.id),
    listAssignableClubOptions(),
  ]);

  return (
    <TournamentAdminChrome
      tournament={tournament}
      lifecycle={lifecycle.model}
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
          participants={
            confirmed.ok
              ? confirmed.participants.map((participant) => ({
                  applicationId: participant.applicationId,
                  externalTeamId: participant.externalTeamId,
                }))
              : []
          }
          confirmedRosterError={confirmed.ok ? null : confirmed.message}
          canScheduleManage={await canScheduleManage()}
          storedFormat={leagueConfig.status === "ok" ? leagueConfig.competitionFormat : null}
          storedLeagueMatchesPerTeam={
            leagueConfig.status === "ok" ? leagueConfig.leagueMatchesPerTeam : null
          }
          storedKnockoutCutoff={leagueConfig.status === "ok" ? leagueConfig.knockoutCutoff : null}
          storedRestrictSameClub={
            leagueConfig.status === "ok" ? leagueConfig.restrictSameClub : false
          }
          clubByParticipantId={confirmed.ok ? confirmed.clubByParticipantId : {}}
          clubOptions={clubOptions.clubs}
          clubDirectoryError={clubOptions.error}
        />
      )}
    </TournamentAdminChrome>
  );
}
