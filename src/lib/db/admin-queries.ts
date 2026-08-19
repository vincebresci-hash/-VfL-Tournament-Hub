import { createClient } from "@/lib/supabase/server";
import { isMissingRelationError } from "@/lib/db/errors";
import { getAppSettings } from "@/lib/settings";
import { AGE_GROUPS } from "@/types/tournament";
import { APPLICATION_STATUSES } from "@/types/application";
import { USER_ROLES, type UserRole } from "@/types/auth";
import type { ApplicationStatus } from "@/types/application";
import type { AgeGroup } from "@/types/tournament";
import type {
  AdminClubApplication,
  AdminClubDetail,
  AdminClubListItem,
  AdminClubMember,
  AdminClubTeam,
  AdminDashboardApplication,
  AdminDashboardData,
  AdminDashboardTournament,
  AdminTeamDetail,
  AdminTeamListItem,
  AdminTournamentOption,
  ClubRecordStatus,
  EmailTemplate,
  EmailTemplateType,
} from "@/types/admin";
import { CLUB_RECORD_STATUSES, EMAIL_TEMPLATE_TYPES } from "@/types/admin";
import type {
  ApplicationRow,
  ClubRow,
  EmailTemplateRow,
  ProfileRow,
  TeamRow,
  TournamentRow,
} from "@/lib/supabase/database";

function displayName(firstName: string | null, lastName: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function asClubStatus(value: string | null | undefined): ClubRecordStatus {
  if (value && CLUB_RECORD_STATUSES.includes(value as ClubRecordStatus)) {
    return value as ClubRecordStatus;
  }

  return "active";
}

function asRole(value: string | null | undefined): UserRole {
  if (value && USER_ROLES.includes(value as UserRole)) {
    return value as UserRole;
  }

  return "club";
}

function asStatus(value: string | null | undefined): ApplicationStatus {
  if (value && APPLICATION_STATUSES.includes(value as ApplicationStatus)) {
    return value as ApplicationStatus;
  }

  return "new";
}

function asAgeGroup(value: string | null | undefined): AgeGroup | string {
  if (value && AGE_GROUPS.includes(value as AgeGroup)) {
    return value as AgeGroup;
  }

  return value || "—";
}

function asEmailType(value: string | null | undefined): EmailTemplateType {
  if (value && EMAIL_TEMPLATE_TYPES.includes(value as EmailTemplateType)) {
    return value as EmailTemplateType;
  }

  return "general";
}

function primaryContact(
  club: ClubRow,
  profiles: ProfileRow[],
): { name: string; email: string | null } {
  const members = profiles.filter(
    (profile) => profile.club_id === club.id || profile.id === club.created_by,
  );
  const creator = members.find((profile) => profile.id === club.created_by);
  const firstMember = members.find((profile) => profile.role === "club") ?? members[0];
  const chosen = creator ?? firstMember;

  if (!chosen) {
    return { name: "—", email: null };
  }

  return {
    name: displayName(chosen.first_name, chosen.last_name) || chosen.email || "—",
    email: chosen.email,
  };
}

function countBy<T>(items: T[], key: (item: T) => string | null | undefined) {
  const map = new Map<string, number>();

  for (const item of items) {
    const id = key(item);
    if (!id) {
      continue;
    }

    map.set(id, (map.get(id) ?? 0) + 1);
  }

  return map;
}

function toEmailTemplate(row: EmailTemplateRow): EmailTemplate {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    body: row.body,
    type: asEmailType(row.type),
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAdminClubs(): Promise<{
  clubs: AdminClubListItem[];
  ready: boolean;
}> {
  const supabase = await createClient();
  const { data: clubs, error } = await supabase
    .from("clubs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !clubs) {
    return { clubs: [], ready: !isMissingRelationError(error) };
  }

  const clubRows = clubs as ClubRow[];
  const clubIds = clubRows.map((club) => club.id);
  const creatorIds = clubRows
    .map((club) => club.created_by)
    .filter((id): id is string => Boolean(id));

  const [profilesByClub, profilesByCreator, teamsResult, applicationsResult] =
    await Promise.all([
      clubIds.length
        ? supabase
            .from("profiles")
            .select("id, first_name, last_name, email, role, club_id, created_at")
            .in("club_id", clubIds)
        : Promise.resolve({ data: [] as ProfileRow[] }),
      creatorIds.length
        ? supabase
            .from("profiles")
            .select("id, first_name, last_name, email, role, club_id, created_at")
            .in("id", creatorIds)
        : Promise.resolve({ data: [] as ProfileRow[] }),
      clubIds.length
        ? supabase.from("teams").select("id, club_id").in("club_id", clubIds)
        : Promise.resolve({ data: [] }),
      clubIds.length
        ? supabase.from("applications").select("id, club_id").in("club_id", clubIds)
        : Promise.resolve({ data: [] }),
    ]);

  const profileRows = [
    ...((profilesByClub.data ?? []) as ProfileRow[]),
    ...((profilesByCreator.data ?? []) as ProfileRow[]),
  ];
  const teamCounts = countBy(
    (teamsResult.data ?? []) as Array<Pick<TeamRow, "id" | "club_id">>,
    (row) => row.club_id,
  );
  const applicationCounts = countBy(
    (applicationsResult.data ?? []) as Array<Pick<ApplicationRow, "id" | "club_id">>,
    (row) => row.club_id,
  );

  return {
    ready: true,
    clubs: clubRows.map((club) => {
      const contact = primaryContact(club, profileRows);

      return {
        id: club.id,
        name: club.name,
        city: club.city ?? "",
        website: club.website,
        contactName: contact.name,
        contactEmail: contact.email,
        contactPhone: club.contact_phone,
        teamCount: teamCounts.get(club.id) ?? 0,
        applicationCount: applicationCounts.get(club.id) ?? 0,
        createdAt: club.created_at,
        status: asClubStatus(club.status),
      };
    }),
  };
}

export async function getAdminClub(clubId: string): Promise<AdminClubDetail | null> {
  const supabase = await createClient();
  const { data: club, error } = await supabase
    .from("clubs")
    .select("*")
    .eq("id", clubId)
    .maybeSingle();

  if (error || !club) {
    return null;
  }

  const clubRow = club as ClubRow;

  const [{ data: profiles }, { data: teams }, { data: applications }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, first_name, last_name, email, role, club_id, created_at")
        .or(
          clubRow.created_by
            ? `club_id.eq.${clubId},id.eq.${clubRow.created_by}`
            : `club_id.eq.${clubId}`,
        ),
      supabase.from("teams").select("*").eq("club_id", clubId).order("name"),
      supabase
        .from("applications")
        .select(
          "id, team_id, tournament_id, status, created_at, teams (id, name), tournaments (id, name, slug)",
        )
        .eq("club_id", clubId)
        .order("created_at", { ascending: false }),
    ]);

  const profileRows = (profiles ?? []) as ProfileRow[];
  const teamRows = (teams ?? []) as TeamRow[];
  const applicationRows = (applications ?? []) as Array<
    Pick<ApplicationRow, "id" | "team_id" | "tournament_id" | "status" | "created_at"> & {
      teams?: Pick<TeamRow, "id" | "name"> | Pick<TeamRow, "id" | "name">[] | null;
      tournaments?:
        | Pick<TournamentRow, "id" | "name" | "slug">
        | Pick<TournamentRow, "id" | "name" | "slug">[]
        | null;
    }
  >;

  const teamApplicationCounts = countBy(applicationRows, (row) => row.team_id);
  const contact = primaryContact(clubRow, profileRows);

  const members: AdminClubMember[] = profileRows
    .filter(
      (profile, index, list) => list.findIndex((item) => item.id === profile.id) === index,
    )
    .map((profile) => ({
      id: profile.id,
      firstName: profile.first_name ?? "",
      lastName: profile.last_name ?? "",
      email: profile.email ?? "",
      role: asRole(profile.role),
      isCreator: profile.id === clubRow.created_by,
      createdAt: profile.created_at,
    }));

  const mappedTeams: AdminClubTeam[] = teamRows.map((team) => ({
    id: team.id,
    name: team.name,
    ageGroup: team.age_group ?? "—",
    birthYear: team.birth_year,
    trainerName: team.trainer_name,
    applicationCount: teamApplicationCounts.get(team.id) ?? 0,
    createdAt: team.created_at,
  }));

  const mappedApplications: AdminClubApplication[] = applicationRows.map((row) => {
    const team = Array.isArray(row.teams) ? row.teams[0] : row.teams;
    const tournament = Array.isArray(row.tournaments)
      ? row.tournaments[0]
      : row.tournaments;

    return {
      id: row.id,
      teamId: row.team_id,
      teamName: team?.name ?? "Mannschaft",
      tournamentId: tournament?.id ?? row.tournament_id,
      tournamentName: tournament?.name ?? "Turnier",
      tournamentSlug: tournament?.slug ?? "",
      status: asStatus(row.status),
      createdAt: row.created_at,
    };
  });

  const tournamentMap = new Map<
    string,
    { id: string; name: string; slug: string; applicationCount: number }
  >();

  for (const application of mappedApplications) {
    const existing = tournamentMap.get(application.tournamentId);
    if (existing) {
      existing.applicationCount += 1;
    } else {
      tournamentMap.set(application.tournamentId, {
        id: application.tournamentId,
        name: application.tournamentName,
        slug: application.tournamentSlug,
        applicationCount: 1,
      });
    }
  }

  return {
    id: clubRow.id,
    name: clubRow.name,
    city: clubRow.city ?? "",
    website: clubRow.website,
    logoUrl: clubRow.logo_url,
    contactName: contact.name,
    contactEmail: contact.email,
    contactPhone: clubRow.contact_phone,
    teamCount: mappedTeams.length,
    applicationCount: mappedApplications.length,
    createdAt: clubRow.created_at,
    status: asClubStatus(clubRow.status),
    members,
    teams: mappedTeams,
    applications: mappedApplications,
    tournaments: [...tournamentMap.values()],
  };
}

export async function listAdminTeams(): Promise<{
  teams: AdminTeamListItem[];
  ready: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .select("*, clubs (id, name), applications (id, tournament_id)")
    .order("created_at", { ascending: false });

  if (error || !data) {
    return { teams: [], ready: !isMissingRelationError(error) };
  }

  const rows = data as unknown as Array<
    TeamRow & {
      clubs?: Pick<ClubRow, "id" | "name"> | Pick<ClubRow, "id" | "name">[] | null;
      applications?: Array<Pick<ApplicationRow, "id" | "tournament_id">> | null;
    }
  >;

  return {
    ready: true,
    teams: rows.map((row) => {
      const club = Array.isArray(row.clubs) ? row.clubs[0] : row.clubs;
      const applications = row.applications ?? [];

      return {
        id: row.id,
        name: row.name,
        clubId: row.club_id,
        clubName: club?.name ?? "Verein",
        ageGroup: asAgeGroup(row.age_group),
        birthYear: row.birth_year,
        trainerName: row.trainer_name,
        applicationCount: applications.length,
        tournamentIds: applications
          .map((application) => application.tournament_id)
          .filter(Boolean),
        createdAt: row.created_at,
      };
    }),
  };
}

export async function getAdminTeam(teamId: string): Promise<AdminTeamDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .select(
      "*, clubs (id, name), applications (id, tournament_id, status, created_at, tournaments (id, name, slug))",
    )
    .eq("id", teamId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as unknown as TeamRow & {
    clubs?: Pick<ClubRow, "id" | "name"> | Pick<ClubRow, "id" | "name">[] | null;
    applications?: Array<
      Pick<ApplicationRow, "id" | "tournament_id" | "status" | "created_at"> & {
        tournaments?:
          | Pick<TournamentRow, "id" | "name" | "slug">
          | Pick<TournamentRow, "id" | "name" | "slug">[]
          | null;
      }
    > | null;
  };

  const club = Array.isArray(row.clubs) ? row.clubs[0] : row.clubs;
  const applications = row.applications ?? [];

  return {
    id: row.id,
    name: row.name,
    clubId: row.club_id,
    clubName: club?.name ?? "Verein",
    ageGroup: asAgeGroup(row.age_group),
    birthYear: row.birth_year,
    trainerName: row.trainer_name,
    league: row.league,
    division: row.division,
    applicationCount: applications.length,
    tournamentIds: applications.map((application) => application.tournament_id),
    createdAt: row.created_at,
    applications: applications.map((application) => {
      const tournament = Array.isArray(application.tournaments)
        ? application.tournaments[0]
        : application.tournaments;

      return {
        id: application.id,
        tournamentId: tournament?.id ?? application.tournament_id,
        tournamentName: tournament?.name ?? "Turnier",
        tournamentSlug: tournament?.slug ?? "",
        status: asStatus(application.status),
        createdAt: application.created_at,
      };
    }),
  };
}

export async function listAdminTournaments(): Promise<AdminTournamentOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, name, slug, age_group")
    .order("date", { ascending: true });

  if (error || !data) {
    return [];
  }

  return (data as Array<Pick<TournamentRow, "id" | "name" | "slug" | "age_group">>).map(
    (row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      ageGroup: row.age_group,
    }),
  );
}

export async function listEmailTemplates(): Promise<{
  templates: EmailTemplate[];
  ready: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_templates")
    .select("*")
    .order("name", { ascending: true });

  if (error || !data) {
    return { templates: [], ready: !isMissingRelationError(error) };
  }

  return {
    ready: true,
    templates: (data as EmailTemplateRow[]).map(toEmailTemplate),
  };
}

export async function getEmailTemplate(id: string): Promise<EmailTemplate | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return toEmailTemplate(data as EmailTemplateRow);
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const supabase = await createClient();
  const empty: AdminDashboardData = {
    stats: {
      newApplications: 0,
      underReview: 0,
      confirmedTeams: 0,
      activeTournaments: 0,
      registeredClubs: 0,
      registeredTeams: 0,
    },
    tournaments: [],
    latestApplications: [],
    showNewApplications: true,
    ready: true,
  };

  const [
    applicationsResult,
    tournamentsResult,
    clubsCountResult,
    teamsCountResult,
    settings,
  ] = await Promise.all([
    supabase
      .from("applications")
      .select(
        "id, status, created_at, self_rated_strength, tournament_id, clubs (name), teams (name, age_group), tournaments (id, name)",
      )
      .order("created_at", { ascending: false }),
    supabase.from("tournaments").select("*").order("date", { ascending: true }),
    supabase.from("clubs").select("id", { count: "exact", head: true }),
    supabase.from("teams").select("id", { count: "exact", head: true }),
    getAppSettings(),
  ]);

  if (applicationsResult.error && isMissingRelationError(applicationsResult.error)) {
    return { ...empty, ready: false };
  }

  const applications = (applicationsResult.data ?? []) as Array<{
    id: string;
    status: string;
    created_at: string;
    self_rated_strength: number | null;
    tournament_id: string;
    clubs?: { name: string } | { name: string }[] | null;
    teams?: { name: string; age_group: string | null } | { name: string; age_group: string | null }[] | null;
    tournaments?: { id: string; name: string } | { id: string; name: string }[] | null;
  }>;

  const tournamentRows = (tournamentsResult.data ?? []) as TournamentRow[];
  const applicationCounts = countBy(applications, (row) => row.tournament_id);
  const acceptedCounts = countBy(
    applications.filter((row) => row.status === "accepted"),
    (row) => row.tournament_id,
  );

  const tournaments: AdminDashboardTournament[] = tournamentRows
    .filter((row) => row.status !== "completed")
    .map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      ageGroup: row.age_group,
      date: row.date,
      status: row.status,
      maxTeams: row.max_teams,
      confirmedTeams: acceptedCounts.get(row.id) ?? 0,
      applicationsCount: applicationCounts.get(row.id) ?? 0,
    }));

  const latestApplications: AdminDashboardApplication[] = applications.slice(0, 6).map((row) => {
    const club = Array.isArray(row.clubs) ? row.clubs[0] : row.clubs;
    const team = Array.isArray(row.teams) ? row.teams[0] : row.teams;

    return {
      id: row.id,
      clubName: club?.name ?? "Verein",
      teamName: team?.name ?? "Mannschaft",
      ageGroup: team?.age_group ?? "—",
      selfRatedStrength: row.self_rated_strength ?? 0,
      status: asStatus(row.status),
      createdAt: row.created_at,
    };
  });

  return {
    ready: true,
    showNewApplications: settings.dashboardShowNewApplications,
    stats: {
      newApplications: applications.filter((row) => row.status === "new").length,
      underReview: applications.filter((row) => row.status === "under-review").length,
      confirmedTeams: applications.filter((row) => row.status === "accepted").length,
      activeTournaments: tournamentRows.filter((row) => row.status === "active").length,
      registeredClubs: clubsCountResult.count ?? 0,
      registeredTeams: teamsCountResult.count ?? 0,
    },
    tournaments,
    latestApplications,
  };
}
