export const RBAC_PERMISSIONS = [
  "users.view",
  "users.manage",
  "roles.manage",
  "tournaments.view",
  "tournaments.manage",
  "applications.view",
  "applications.manage",
  "applications.decide",
  "payments.view",
  "payments.manage",
  "communications.view",
  "communications.send",
  "communications.manage",
  "schedule.view",
  "schedule.manage",
  "results.view",
  "results.manage",
  "news.view",
  "news.manage",
  "clubs.view",
  "clubs.manage",
  "teams.view",
  "teams.manage",
  "cancellations.view",
  "cancellations.decide",
  "cancellations.manage",
] as const;

export type Permission = (typeof RBAC_PERMISSIONS)[number];

export const RBAC_ROLE_KEYS = [
  "SUPER_ADMIN",
  "ADMIN",
  "TOURNAMENT_MANAGER",
  "APPLICATION_MANAGER",
  "FINANCE_MANAGER",
  "COMMUNICATION_MANAGER",
  "CLUB_ADMIN",
  "TEAM_MANAGER",
] as const;

export type RbacRoleKey = (typeof RBAC_ROLE_KEYS)[number];

export type RbacRole = {
  id: string;
  key: RbacRoleKey;
  name: string;
  description: string | null;
  isPlatformRole: boolean;
  isSystem: boolean;
};

export type RbacPermission = {
  id: string;
  key: Permission;
  name: string;
  description: string | null;
  category: string;
};

export type AdminUserSummary = {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  avatarUrl: string | null;
  profileRole: "club" | "admin" | "super-admin";
  clubId: string | null;
  clubName: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastSignInAt: string | null;
  accountStatus: "active" | "inactive" | "invitation_pending";
  invitationId: string | null;
  roles: Array<{
    key: RbacRoleKey;
    name: string;
    clubId: string | null;
  }>;
  teamAssignments: Array<{
    teamId: string;
    teamName: string;
    clubId: string;
    ageGroup?: string | null;
    clubName?: string | null;
  }>;
  permissions: Permission[];
};

export type UserInvitationStatus = "pending" | "accepted" | "expired" | "cancelled";

export type UserInvitationSummary = {
  id: string;
  email: string;
  status: UserInvitationStatus;
  invitedAt: string;
  expiresAt: string;
  lastSentAt: string;
  acceptedAt: string | null;
  profileId: string | null;
  metadata: Record<string, unknown>;
};

export type AdminAuditEntry = {
  id: string;
  action: string;
  actorUserId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type PermissionContext = {
  clubId?: string | null;
  teamId?: string | null;
};
