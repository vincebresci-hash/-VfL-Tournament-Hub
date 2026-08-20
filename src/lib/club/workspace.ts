import {
  DEMO_CLUB_ID,
  demoClubApplications,
  demoClubProfile,
  demoClubTeams,
  demoClubUser,
} from "@/data/club-workspace";
import type { ApplicationFormValues } from "@/lib/application";
import { ensureClubForCurrentUser } from "@/lib/auth/actions";
import { getAuthSession } from "@/lib/auth/session";
import { canAccessClub } from "@/lib/auth/roles";
import { listClubApplications, listClubTeams, getClubApplication, isClubDatabaseReady } from "@/lib/db/queries";
import { getFeaturedTournaments } from "@/lib/db/tournament-queries";
import type { AuthSession, ClubProfile, Team, UserProfile } from "@/types/auth";
import type { TournamentApplication } from "@/types/application";
import type { ClubApplicationView } from "@/types/club";
import type { PublicTournament } from "@/types/tournament";
import type { AgeGroup } from "@/types/tournament";

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
  };
}

export type ClubWorkspace = {
  user: UserProfile;
  club: ClubProfile;
  teams: Team[];
  applications: ClubApplicationView[];
  usingDemoData: boolean;
};

function applicationsForClub(clubId: string) {
  return demoClubApplications.filter((application) => application.clubId === clubId);
}

function teamsForClub(clubId: string) {
  return demoClubTeams.filter((team) => team.clubId === clubId);
}

export function getClubWorkspace(session: AuthSession): ClubWorkspace | null {
  if (session.user.role !== "club") {
    return null;
  }

  const clubId = session.user.clubId ?? session.club?.id ?? DEMO_CLUB_ID;
  const seedClub = demoClubProfile;
  const seedUser = demoClubUser;

  const club: ClubProfile = {
    ...seedClub,
    id: clubId,
    name: session.club?.name || seedClub.name,
    city: session.club?.city || seedClub.city,
    website: session.club?.website ?? seedClub.website,
    logo: session.club?.logo ?? seedClub.logo,
    contactPhone: session.club?.contactPhone ?? seedClub.contactPhone,
  };

  const user: UserProfile = {
    ...seedUser,
    ...session.user,
    clubId,
  };

  return {
    user,
    club,
    teams: teamsForClub(DEMO_CLUB_ID),
    applications: applicationsForClub(DEMO_CLUB_ID),
    usingDemoData: true,
  };
}

export async function loadClubWorkspace(
  session: AuthSession,
): Promise<ClubWorkspace | null> {
  if (!canAccessClub(session.user.role)) {
    return null;
  }

  const ready = await isClubDatabaseReady();
  if (!ready) {
    return getClubWorkspace(session);
  }

  await ensureClubForCurrentUser();
  const freshSession = await getAuthSession();
  if (!freshSession || !canAccessClub(freshSession.user.role)) {
    return null;
  }

  const clubId = freshSession.user.clubId;
  const club = freshSession.club;

  if (!clubId || !club) {
    return {
      user: freshSession.user,
      club: club ?? {
        id: freshSession.user.id,
        name: "Verein",
        city: "",
        website: null,
        logo: null,
        contactPhone: null,
        createdAt: freshSession.user.createdAt,
      },
      teams: [],
      applications: [],
      usingDemoData: false,
    };
  }

  const [teams, applications] = await Promise.all([
    listClubTeams(clubId),
    listClubApplications(clubId),
  ]);

  return {
    user: { ...freshSession.user, clubId },
    club,
    teams,
    applications,
    usingDemoData: false,
  };
}

export function getClubApplicationById(
  session: AuthSession,
  id: string,
): ClubApplicationView | undefined {
  const workspace = getClubWorkspace(session);
  return workspace?.applications.find((application) => application.id === id);
}

export async function loadClubApplicationById(applicationId: string) {
  const session = await getAuthSession();
  if (!session || !canAccessClub(session.user.role)) {
    return null;
  }

  const ready = await isClubDatabaseReady();
  if (!ready) {
    return getClubApplicationById(session, applicationId) ?? null;
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
