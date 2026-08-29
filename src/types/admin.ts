import type { ApplicationStatus, ManualAdminApplicationStatus } from "@/types/application";
import type { AgeGroup, LiveDataSource } from "@/types/tournament";
import type { UserRole } from "@/types/auth";

export const CLUB_RECORD_STATUSES = ["active", "inactive"] as const;

export type ClubRecordStatus = (typeof CLUB_RECORD_STATUSES)[number];

export const EMAIL_TEMPLATE_TYPES = [
  "application-received",
  "application-accepted",
  "application-under-review",
  "waiting-list",
  "application-rejected",
  "cancellation-request-received",
  "cancellation-request-submitted",
  "cancellation-confirmed",
  "cancellation-rejected",
  "follow-up",
  "general",
] as const;

export type EmailTemplateType = (typeof EMAIL_TEMPLATE_TYPES)[number];

export type AdminClubListItem = {
  id: string;
  name: string;
  city: string;
  website: string | null;
  logoUrl: string | null;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  teamCount: number;
  applicationCount: number;
  createdAt: string;
  status: ClubRecordStatus;
};

export type AdminClubMember = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  isCreator: boolean;
  createdAt: string;
};

export type AdminClubTeam = {
  id: string;
  name: string;
  ageGroup: string;
  birthYear: number | null;
  trainerName: string | null;
  applicationCount: number;
  createdAt: string;
};

export type AdminClubApplication = {
  id: string;
  teamId: string;
  teamName: string;
  tournamentId: string;
  tournamentName: string;
  tournamentSlug: string;
  status: ApplicationStatus;
  createdAt: string;
};

export type AdminClubDetail = AdminClubListItem & {
  members: AdminClubMember[];
  teams: AdminClubTeam[];
  applications: AdminClubApplication[];
  tournaments: Array<{
    id: string;
    name: string;
    slug: string;
    applicationCount: number;
  }>;
};

export type AdminTeamListItem = {
  id: string;
  name: string;
  clubId: string;
  clubName: string;
  ageGroup: AgeGroup | string;
  birthYear: number | null;
  trainerName: string | null;
  applicationCount: number;
  tournamentIds: string[];
  createdAt: string;
};

export type AdminTeamApplication = {
  id: string;
  tournamentId: string;
  tournamentName: string;
  tournamentSlug: string;
  status: ApplicationStatus;
  createdAt: string;
};

export type AdminTeamDetail = AdminTeamListItem & {
  league: string | null;
  division: string | null;
  applications: AdminTeamApplication[];
};

export type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  type: EmailTemplateType;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EmailTemplateInput = {
  name: string;
  subject: string;
  body: string;
  type: EmailTemplateType;
  active: boolean;
};

export const EMAIL_LOG_STATUSES = ["sent", "failed", "skipped"] as const;

export type EmailLogStatus = (typeof EMAIL_LOG_STATUSES)[number];

export type EmailLog = {
  id: string;
  applicationId: string | null;
  templateId: string | null;
  templateType: EmailTemplateType | null;
  toEmail: string;
  subject: string | null;
  status: EmailLogStatus;
  error: string | null;
  provider: string | null;
  createdAt: string;
};

export type AppSettings = {
  platformName: string;
  organizerName: string;
  contactEmail: string;
  contactPhone: string;
  applicationsEnabled: boolean;
  waitlistEnabled: boolean;
  applicationConfirmationEnabled: boolean;
  dashboardShowNewApplications: boolean;
  defaultApplicationStatus: ManualAdminApplicationStatus;
};

export type AdminDashboardTournament = {
  id: string;
  slug: string;
  name: string;
  ageGroup: string;
  date: string;
  status: "coming-soon" | "active" | "full" | "completed";
  maxTeams: number | null;
  confirmedTeams: number;
  availableSlots: number;
  waitlistCount: number;
  underReviewCount: number;
  applicationsCount: number;
};

export type AdminDashboardApplication = {
  id: string;
  clubName: string;
  teamName: string;
  ageGroup: string;
  selfRatedStrength: number;
  status: ApplicationStatus;
  createdAt: string;
};

export type AdminDashboardData = {
  stats: {
    newApplications: number;
    underReview: number;
    confirmedTeams: number;
    availableSlots: number;
    waitlistCount: number;
    activeTournaments: number;
    registeredClubs: number;
    registeredTeams: number;
  };
  tournaments: AdminDashboardTournament[];
  latestApplications: AdminDashboardApplication[];
  showNewApplications: boolean;
  ready: boolean;
};

export type AdminTournamentOption = {
  id: string;
  name: string;
  slug: string;
  ageGroup: string;
};

export type AdminTournamentRecord = {
  id: string;
  slug: string;
  name: string;
  ageGroup: string;
  date: string;
  location: string | null;
  status: "coming-soon" | "active" | "full" | "completed";
  maxTeams: number | null;
  description: string | null;
  imageUrl: string | null;
  startTime: string | null;
  endTime: string | null;
  address: string | null;
  shortDescription: string | null;
  birthYear: number | null;
  waitlistEnabled: boolean;
  applicationsOpen: boolean;
  applicationStart: string | null;
  applicationDeadline: string | null;
  archivedAt: string | null;
  matchDurationMinutes: number;
  breakMinutes: number;
  minimumRestMinutes: number;
  lunchBreakStart: string | null;
  lunchBreakEnd: string | null;
  playFormat: string | null;
  playingTime: string | null;
  pitchFormat: string | null;
  entryFee: string | null;
  travelInfo: string | null;
  changingRooms: string | null;
  catering: string | null;
  teamInfo: string | null;
  meinTurnierplanUrl: string | null;
  meinTurnierplanEnabled: boolean;
  meinTurnierplanLabel: string | null;
  meinTurnierplanEmbedUrl: string | null;
  liveDataSource: LiveDataSource;
  meinTurnierplanTournamentId: string | null;
  meinTurnierplanMatchesWidgetUrl: string | null;
  meinTurnierplanTableWidgetUrl: string | null;
  publicScheduleNote: string | null;
  publicLiveNote: string | null;
  meinTurnierplanLastSyncedAt?: string | null;
  meinTurnierplanSyncMeta?: Record<string, unknown> | null;
};

export type AdminTournamentInput = {
  name: string;
  slug: string;
  ageGroup: string;
  birthYear: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  address: string;
  shortDescription: string;
  description: string;
  maxTeams: string;
  status: "coming-soon" | "active" | "full" | "completed";
  applicationsOpen: boolean;
  waitlistEnabled: boolean;
  applicationStart: string;
  applicationDeadline: string;
  imageUrl: string;
  playFormat: string;
  playingTime: string;
  pitchFormat: string;
  entryFee: string;
  travelInfo: string;
  changingRooms: string;
  catering: string;
  teamInfo: string;
  meinTurnierplanEnabled: boolean;
  meinTurnierplanUrl: string;
  meinTurnierplanLabel: string;
  liveDataSource: LiveDataSource;
  meinTurnierplanTournamentId: string;
  meinTurnierplanMatchesWidgetUrl: string;
  meinTurnierplanTableWidgetUrl: string;
  publicScheduleNote: string;
  publicLiveNote: string;
};
