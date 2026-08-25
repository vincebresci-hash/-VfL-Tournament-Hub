import type {
  AdminApplication,
  ApplicationStatus,
  ClubType,
  InternalCategory,
  TeamStrength,
} from "@/types/application";
import type { AgeGroup, Tournament } from "@/types/tournament";
import type { ClubRecordStatus, EmailTemplateType } from "@/types/admin";
import type { UserRole } from "@/types/auth";
import {
  getTournamentCapacityWithExternal,
  type ExternalTeamForParticipantCount,
} from "@/lib/mein-turnierplan-participants";

export const applicationStatusLabel: Record<ApplicationStatus, string> = {
  new: "Neu",
  "under-review": "In Prüfung",
  accepted: "Angenommen",
  "waiting-list": "Warteliste",
  rejected: "Abgelehnt",
};

export const applicationStatusClassName: Record<ApplicationStatus, string> = {
  new: "bg-brand-yellow text-navy",
  "under-review": "bg-brand-blue/10 text-brand-blue",
  accepted: "bg-navy text-white/86",
  "waiting-list": "bg-[#eceef2] text-ink",
  rejected: "bg-[#e8eaee] text-muted",
};

export const applicationStatusFilters: Array<{
  id: "all" | ApplicationStatus;
  label: string;
}> = [
  { id: "all", label: "Alle" },
  { id: "new", label: "Neu" },
  { id: "under-review", label: "In Prüfung" },
  { id: "accepted", label: "Angenommen" },
  { id: "waiting-list", label: "Warteliste" },
  { id: "rejected", label: "Abgelehnt" },
];

export const applicationSortOptions = [
  { id: "newest", label: "Neueste zuerst" },
  { id: "oldest", label: "Älteste zuerst" },
  { id: "strength-desc", label: "Spielstärke hoch → niedrig" },
  { id: "strength-asc", label: "Spielstärke niedrig → hoch" },
  { id: "club-az", label: "Vereinsname A–Z" },
] as const;

export type ApplicationSort = (typeof applicationSortOptions)[number]["id"];

export type ApplicationFilters = {
  status: "all" | ApplicationStatus;
  tournamentId: "all" | string;
  ageGroup: "all" | AgeGroup;
  strength: "all" | TeamStrength;
  clubType: "all" | ClubType;
  query: string;
};

export const emptyApplicationFilters: ApplicationFilters = {
  status: "all",
  tournamentId: "all",
  ageGroup: "all",
  strength: "all",
  clubType: "all",
  query: "",
};

export const clubTypeLabel: Record<ClubType, string> = {
  amateur: "Amateurverein",
  performance: "Leistungsorientierter Verein",
  "youth-academy": "Nachwuchsleistungszentrum",
  other: "Sonstiges",
};

export const internalCategoryLabel: Record<InternalCategory, string> = {
  S: "Kategorie S",
  A: "Kategorie A",
  B: "Kategorie B",
  C: "Kategorie C",
};

export function getClubTypeLabel(value: ClubType | null) {
  if (!value) {
    return "Keine Angabe";
  }

  return clubTypeLabel[value];
}

export function countByStatus(applications: AdminApplication[]) {
  return {
    all: applications.length,
    new: applications.filter((item) => item.applicationStatus === "new").length,
    "under-review": applications.filter(
      (item) => item.applicationStatus === "under-review",
    ).length,
    accepted: applications.filter((item) => item.applicationStatus === "accepted")
      .length,
    "waiting-list": applications.filter(
      (item) => item.applicationStatus === "waiting-list",
    ).length,
    rejected: applications.filter((item) => item.applicationStatus === "rejected")
      .length,
  };
}

export function getDashboardStats(
  applications: AdminApplication[],
  tournaments: Tournament[],
) {
  const counts = countByStatus(applications);

  return {
    newApplications: counts.new,
    underReview: counts["under-review"],
    confirmedTeams: counts.accepted,
    activeTournaments: tournaments.filter((tournament) => tournament.status === "active")
      .length,
  };
}

export type CategoryComposition = Record<InternalCategory, number>;

export function getCategoryComposition(
  applications: AdminApplication[],
): CategoryComposition {
  const accepted = applications.filter(
    (item) => item.applicationStatus === "accepted",
  );

  return {
    S: accepted.filter((item) => item.internalCategory === "S").length,
    A: accepted.filter((item) => item.internalCategory === "A").length,
    B: accepted.filter((item) => item.internalCategory === "B").length,
    C: accepted.filter((item) => item.internalCategory === "C").length,
  };
}

export function getApplicationsForTournament(
  applications: AdminApplication[],
  tournamentId: string,
) {
  return applications.filter((item) => item.tournamentId === tournamentId);
}

export function getTournamentAdminSummary(
  tournament: Tournament,
  applications: AdminApplication[],
  externalTeams: ExternalTeamForParticipantCount[] = [],
) {
  const related = getApplicationsForTournament(applications, tournament.id);
  const relatedBySlug =
    tournament.slug && tournament.slug !== tournament.id
      ? getApplicationsForTournament(applications, tournament.slug)
      : [];
  const allRelated = [...related];
  for (const item of relatedBySlug) {
    if (!allRelated.some((existing) => existing.id === item.id)) {
      allRelated.push(item);
    }
  }

  const capacity = getTournamentCapacityWithExternal({
    maxTeams: tournament.maxTeams,
    applicationStatuses: allRelated.map((item) => item.applicationStatus),
    acceptedApplicationIds: allRelated
      .filter((item) => item.applicationStatus === "accepted")
      .map((item) => item.id),
    externalTeams,
  });

  return {
    tournament,
    applicationsCount: allRelated.length,
    confirmedTeams: capacity.confirmedTeams,
    waitlistCount: capacity.waitingListCount,
    underReviewCount: capacity.underReviewCount,
    newCount: capacity.newCount,
    availableSlots: capacity.availableSlots,
    isFull: capacity.isFull,
    openApplications: capacity.newCount + capacity.underReviewCount,
    composition: getCategoryComposition(allRelated),
  };
}

export function filterApplications(
  applications: AdminApplication[],
  filters: ApplicationFilters,
) {
  const query = filters.query.trim().toLowerCase();

  return applications.filter((item) => {
    const statusMatch =
      filters.status === "all" || item.applicationStatus === filters.status;
    const tournamentMatch =
      filters.tournamentId === "all" || item.tournamentId === filters.tournamentId;
    const ageMatch =
      filters.ageGroup === "all" || item.ageGroup === filters.ageGroup;
    const strengthMatch =
      filters.strength === "all" || item.selfRatedStrength === filters.strength;
    const clubTypeMatch =
      filters.clubType === "all" || item.clubType === filters.clubType;
    const queryMatch =
      query.length === 0 ||
      item.clubName.toLowerCase().includes(query) ||
      item.teamName.toLowerCase().includes(query);

    return (
      statusMatch &&
      tournamentMatch &&
      ageMatch &&
      strengthMatch &&
      clubTypeMatch &&
      queryMatch
    );
  });
}

export function sortApplications(
  applications: AdminApplication[],
  sort: ApplicationSort,
) {
  const list = [...applications];

  switch (sort) {
    case "oldest":
      return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case "strength-desc":
      return list.sort((a, b) => b.selfRatedStrength - a.selfRatedStrength);
    case "strength-asc":
      return list.sort((a, b) => a.selfRatedStrength - b.selfRatedStrength);
    case "club-az":
      return list.sort((a, b) => a.clubName.localeCompare(b.clubName, "de"));
    case "newest":
    default:
      return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export function getStatusDecisionCopy(status: ApplicationStatus) {
  switch (status) {
    case "accepted":
      return "Bewerbung wirklich annehmen?";
    case "waiting-list":
      return "Bewerbung wirklich auf die Warteliste setzen?";
    case "rejected":
      return "Bewerbung wirklich absagen?";
    case "under-review":
      return "Bewerbung wirklich in Prüfung nehmen?";
    default:
      return "Status wirklich ändern?";
  }
}

export const clubRecordStatusLabel: Record<ClubRecordStatus, string> = {
  active: "Aktiv",
  inactive: "Inaktiv",
};

export const clubRecordStatusClassName: Record<ClubRecordStatus, string> = {
  active: "bg-navy text-white/86",
  inactive: "bg-[#e8eaee] text-muted",
};

export const emailTemplateTypeLabel: Record<EmailTemplateType, string> = {
  "application-received": "Bewerbung eingegangen",
  "application-accepted": "Bewerbung angenommen",
  "application-under-review": "In Prüfung",
  "waiting-list": "Warteliste",
  "application-rejected": "Bewerbung abgelehnt",
  "follow-up": "Rückfrage",
  general: "Allgemeine Nachricht",
};

export const userRoleLabel: Record<UserRole, string> = {
  club: "Verein",
  admin: "Admin",
  "super-admin": "Super-Admin",
};
