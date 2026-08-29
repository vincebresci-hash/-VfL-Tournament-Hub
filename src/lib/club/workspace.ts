import type { ApplicationFormValues } from "@/lib/application";
import { ensureClubForCurrentUser } from "@/lib/auth/actions";
import { getAuthSession } from "@/lib/auth/session";
import { canAccessClub } from "@/lib/auth/roles";
import { loadUserAuthorization } from "@/lib/rbac/queries";
import { listClubApplications, listClubTeams, getClubApplication, isClubDatabaseReady } from "@/lib/db/queries";
import { getFeaturedTournaments } from "@/lib/db/tournament-queries";
import type { AuthSession, ClubProfile, Team, UserProfile } from "@/types/auth";
import type { TournamentApplication } from "@/types/application";
import type { ClubApplicationView } from "@/types/club";
import type { PublicTournament } from "@/types/tournament";
import type { AgeGroup } from "@/types/tournament";
import type { RbacRoleKey } from "@/types/rbac";

export function toClubApplicationView(
  application: TournamentApplication,
  tournament: Pick<
    PublicTournament,
    "name" | "slug" | "date" | "location"
  >,
  clubId: string,
): ClubApplicationView {
  return {
    id: application.id,
    clubId,
    tournamentId: application.tournamentId,
    tournamentName: tournament.name,
    tournamentSlug: tournament.slug,
    tournamentDate: tournament.date,
    tournamentLocation: tournament.location,
    clubName: application.clubName,
    clubCity: application.clubCity,
    website: application.website,
    teamName: application.teamName,
    ageGroup: application.ageGroup,
    birthYear: application.birthYear,
    league: application.league,
    division: application.division,
    selfRatedStrength: application.selfRatedStrength,
    teamDescription: application.teamDescription,
    clubType: application.clubType,
    contactFirstName: application.contactFirstName,
    contactLastName: application.contactLastName,
    contactRole: application.contactRole,
    contactEmail: application.contactEmail,
    contactPhone: application.contactPhone,
    alternativePhone: application.alternativePhone,
    staffCount: application.staffCount,
    notes: application.notes,
    applicationStatus: application.applicationStatus,
    createdAt: application.createdAt,
    paymentStatus: application.paymentStatus ?? "pending",
    participationFee: application.participationFee ?? null,
    paidAt: application.paidAt ?? null,
    paymentNote: application.paymentNote ?? null,
  };
}

export type ClubWorkspace = {
  user: UserProfile;
  club: ClubProfile;
  teams: Team[];
  applications: ClubApplicationView[];
  databaseReady: boolean;
  roleKeys: RbacRoleKey[];
  assignedTeamIds: string[];
};

function fallbackClub(session: AuthSession): ClubProfile {
  return (
    session.club ?? {
      id: session.user.clubId ?? session.user.id,
      name: "Verein",
      city: "",
      website: null,
      logo: null,
      contactPhone: null,
      createdAt: session.user.createdAt,
    }
  );
}

export async function loadClubWorkspace(
  session: AuthSession,
): Promise<ClubWorkspace | null> {
  if (!canAccessClub(session.user.role)) {
    return null;
  }

  const ready = await isClubDatabaseReady();
  if (!ready) {
    const authorization = await loadUserAuthorization(session.user.id);
    return {
      user: session.user,
      club: fallbackClub(session),
      teams: [],
      applications: [],
      databaseReady: false,
      roleKeys: authorization.roleKeys,
      assignedTeamIds: authorization.assignedTeamIds,
    };
  }

  await ensureClubForCurrentUser();
  const freshSession = await getAuthSession();
  if (!freshSession || !canAccessClub(freshSession.user.role)) {
    return null;
  }

  const clubId = freshSession.user.clubId;
  const club = freshSession.club;

  if (!clubId || !club) {
    const authorization = await loadUserAuthorization(freshSession.user.id);
    return {
      user: freshSession.user,
      club: fallbackClub(freshSession),
      teams: [],
      applications: [],
      databaseReady: true,
      roleKeys: authorization.roleKeys,
      assignedTeamIds: authorization.assignedTeamIds,
    };
  }

  const authorization = await loadUserAuthorization(freshSession.user.id);
  const [teams, applications] = await Promise.all([
    listClubTeams(clubId),
    listClubApplications(clubId),
  ]);

  const isTeamManagerOnly =
    authorization.roleKeys.includes("TEAM_MANAGER") &&
    !authorization.roleKeys.includes("CLUB_ADMIN");

  const scopedTeams = isTeamManagerOnly
    ? teams.filter((team) => authorization.assignedTeamIds.includes(team.id))
    : teams;

  const scopedTeamNames = new Set(scopedTeams.map((team) => team.name));
  const scopedApplications = isTeamManagerOnly
    ? applications.filter((application) => scopedTeamNames.has(application.teamName))
    : applications;

  return {
    user: { ...freshSession.user, clubId },
    club,
    teams: scopedTeams,
    applications: scopedApplications,
    databaseReady: true,
    roleKeys: authorization.roleKeys,
    assignedTeamIds: authorization.assignedTeamIds,
  };
}

export async function loadClubApplicationById(applicationId: string) {
  const session = await getAuthSession();
  if (!session || !canAccessClub(session.user.role)) {
    return null;
  }

  const ready = await isClubDatabaseReady();
  if (!ready) {
    return null;
  }

  await ensureClubForCurrentUser();
  const fresh = await getAuthSession();
  const clubId = fresh?.user.clubId;
  if (!clubId) {
    return null;
  }

  return getClubApplication(clubId, applicationId);
}

export async function getClubDashboardStats(workspace: ClubWorkspace) {
  const applications = workspace.applications;
  const activeApplications = applications.filter(
    (application) => application.applicationStatus !== "rejected",
  );
  const featured = await getFeaturedTournaments();

  return {
    activeApplications: activeApplications.length,
    accepted: applications.filter(
      (application) => application.applicationStatus === "accepted",
    ).length,
    waitingList: applications.filter(
      (application) => application.applicationStatus === "waiting-list",
    ).length,
    availableTournaments: featured.length,
  };
}

export function getApplicationPrefill(
  workspace: ClubWorkspace,
  ageGroup: AgeGroup,
): Partial<ApplicationFormValues> {
  const team =
    workspace.teams.find((item) => item.ageGroup === ageGroup) ??
    workspace.teams[0];

  return {
    clubName: workspace.club.name,
    clubCity: workspace.club.city,
    website: workspace.club.website ?? "",
    teamName: team?.name ?? "",
    birthYear: team ? String(team.birthYear) : "",
    league: team?.league ?? "",
    division: team?.division ?? "",
    selfRatedStrength: team ? String(team.strength) : "",
    contactFirstName: workspace.user.firstName,
    contactLastName: workspace.user.lastName,
    contactRole: workspace.user.contactRole ?? "",
    contactEmail: workspace.user.email,
    contactPhone: workspace.club.contactPhone ?? "",
  };
}
