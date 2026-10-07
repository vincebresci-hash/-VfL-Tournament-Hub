import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminTournamentDetailView } from "@/components/admin/AdminTournamentDetailView";
import {
  hasPermissionInAuthorization,
  requireAdminSession,
} from "@/lib/auth/guards";
import { canManageSystem } from "@/lib/auth/roles";
import {
  getAdminTournamentById,
  getAdminTournamentBySlug,
  listAdminClubs,
} from "@/lib/db/admin-queries";
import { listAdminApplications } from "@/lib/db/queries";
import { getAdminTournamentStage } from "@/lib/db/schedule-queries";
import { getAdminLifecyclePanelModel } from "@/lib/db/tournament-lifecycle-admin";
import { getTournamentParticipants } from "@/lib/db/tournament-participants-queries";
import { listExternalTeamsForTournamentAction } from "@/lib/db/mein-turnierplan-participants-actions";
import { teamLabelsFromParticipants } from "@/lib/schedule/admin";
import { buildTournamentMatchdayDashboardModel } from "@/lib/schedule/tournament-matchday-dashboard";
import type { Permission } from "@/types/rbac";

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

async function matchdayPermissionFlags() {
  const adminAccess = await requireAdminSession();
  if ("error" in adminAccess && adminAccess.error) {
    return {
      canScheduleManage: false,
      canResultsManage: false,
      canTournamentsManage: false,
    };
  }
  if (!adminAccess.session || !adminAccess.authorization) {
    return {
      canScheduleManage: false,
      canResultsManage: false,
      canTournamentsManage: false,
    };
  }

  const system = canManageSystem(adminAccess.session.user.role);
  const can = (permission: Permission) =>
    system ||
    hasPermissionInAuthorization(
      adminAccess.authorization,
      adminAccess.session,
      permission,
    );

  return {
    canScheduleManage: can("schedule.manage"),
    canResultsManage: can("results.manage"),
    canTournamentsManage: can("tournaments.manage"),
  };
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

  const [
    stage,
    externalTeamsResult,
    participantsResult,
    clubsResult,
    lifecycle,
    permissions,
  ] = await Promise.all([
    getAdminTournamentStage(tournament.id),
    listExternalTeamsForTournamentAction(tournament.id),
    getTournamentParticipants(tournament.id),
    listAdminClubs(),
    getAdminLifecyclePanelModel(tournament.id),
    matchdayPermissionFlags(),
  ]);

  const matchday = lifecycle.model
    ? buildTournamentMatchdayDashboardModel({
        tournamentId: tournament.id,
        effective: lifecycle.model.effective,
        groups: stage.groups,
        memberIdsByGroupId: stage.memberIdsByGroupId,
        matches: stage.matches,
        permissions,
      })
    : null;

  return (
    <AdminTournamentDetailView
      tournament={tournament}
      applications={applicationsResult.applications}
      externalTeams={externalTeamsResult.teams}
      participants={participantsResult}
      groups={stage.groups.map((group) => ({ id: group.id, name: group.name }))}
      fields={stage.fields}
      teamLabels={teamLabelsFromParticipants(participantsResult)}
      clubs={clubsResult.clubs.map((club) => ({
        id: club.id,
        name: club.name,
        logoUrl: club.logoUrl,
      }))}
      lifecycle={lifecycle.model}
      matchday={matchday}
      current={bereich === "teilnehmer" ? "participants" : "overview"}
    />
  );
}
