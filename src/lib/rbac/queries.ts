import { createClient } from "@/lib/supabase/server";
import { isMissingRelationError } from "@/lib/db/errors";
import { mergePermissions } from "@/lib/rbac/permissions";
import type { AdminUserSummary, Permission, RbacPermission, RbacRole, RbacRoleKey, UserInvitationSummary } from "@/types/rbac";
import type { UserRole } from "@/types/auth";

type ProfileAuthRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  avatar_url: string | null;
  role: UserRole;
  club_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  clubs: { id: string; name: string } | { id: string; name: string }[] | null;
};

function unwrapClub<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value;
}

function toRoleKey(value: string): RbacRoleKey | null {
  const keys: RbacRoleKey[] = [
    "SUPER_ADMIN",
    "ADMIN",
    "TOURNAMENT_MANAGER",
    "APPLICATION_MANAGER",
    "FINANCE_MANAGER",
    "COMMUNICATION_MANAGER",
    "CLUB_ADMIN",
    "TEAM_MANAGER",
  ];
  return keys.includes(value as RbacRoleKey) ? (value as RbacRoleKey) : null;
}

export async function loadUserAuthorization(userId: string) {
  const supabase = await createClient();

  const empty = {
    roleKeys: [] as RbacRoleKey[],
    overrides: [] as Array<{ permission: Permission; granted: boolean }>,
    permissions: [] as Permission[],
    assignedTeamIds: [] as string[],
  };

  const { data: roleRows, error: roleError } = await supabase
    .from("rbac_user_roles")
    .select("club_id, rbac_roles(key)")
    .eq("user_id", userId);

  if (roleError) {
    if (isMissingRelationError(roleError)) {
      return empty;
    }
    return empty;
  }

  const roleKeys = (roleRows ?? [])
    .map((row) => {
      const role = row.rbac_roles as { key?: string } | null;
      return role?.key ? toRoleKey(role.key) : null;
    })
    .filter((value): value is RbacRoleKey => value !== null);

  const { data: overrideRows } = await supabase
    .from("rbac_user_permission_overrides")
    .select("granted, rbac_permissions(key)")
    .eq("user_id", userId);

  const overrides = (overrideRows ?? [])
    .map((row) => {
      const permission = (row.rbac_permissions as { key?: string } | null)?.key;
      if (!permission) {
        return null;
      }
      return {
        permission: permission as Permission,
        granted: row.granted,
      };
    })
    .filter((value): value is { permission: Permission; granted: boolean } => value !== null);

  const { data: teamRows } = await supabase
    .from("rbac_user_team_assignments")
    .select("team_id")
    .eq("user_id", userId);

  const assignedTeamIds = (teamRows ?? []).map((row) => row.team_id);
  const permissions = Array.from(mergePermissions(roleKeys, overrides));

  return {
    roleKeys,
    overrides,
    permissions,
    assignedTeamIds,
  };
}

export async function listRbacRoles(): Promise<{ roles: RbacRole[]; ready: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rbac_roles")
    .select("id, key, name, description, is_platform_role, is_system")
    .order("name", { ascending: true });

  if (error) {
    return { roles: [], ready: !isMissingRelationError(error) };
  }

  return {
    ready: true,
    roles: (data ?? []).map((row) => ({
      id: row.id,
      key: row.key as RbacRoleKey,
      name: row.name,
      description: row.description,
      isPlatformRole: row.is_platform_role,
      isSystem: row.is_system,
    })),
  };
}

export async function listRbacPermissions(): Promise<{
  permissions: RbacPermission[];
  ready: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rbac_permissions")
    .select("id, key, name, description, category")
    .order("category", { ascending: true })
    .order("key", { ascending: true });

  if (error) {
    return { permissions: [], ready: !isMissingRelationError(error) };
  }

  return {
    ready: true,
    permissions: (data ?? []).map((row) => ({
      id: row.id,
      key: row.key as Permission,
      name: row.name,
      description: row.description,
      category: row.category,
    })),
  };
}

export async function listPendingInvitations(): Promise<{
  invitations: UserInvitationSummary[];
  ready: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_invitations")
    .select("id, email, status, invited_at, expires_at, last_sent_at, accepted_at, profile_id, metadata")
    .in("status", ["pending", "expired"])
    .order("invited_at", { ascending: false });

  if (error) {
    return { invitations: [], ready: !isMissingRelationError(error) };
  }

  const now = Date.now();
  return {
    ready: true,
    invitations: (data ?? []).map((row) => {
      let status = row.status as UserInvitationSummary["status"];
      if (status === "pending" && new Date(row.expires_at).getTime() < now) {
        status = "expired";
      }
      return {
        id: row.id,
        email: row.email,
        status,
        invitedAt: row.invited_at,
        expiresAt: row.expires_at,
        lastSentAt: row.last_sent_at,
        acceptedAt: row.accepted_at,
        profileId: row.profile_id,
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
      };
    }),
  };
}

export async function listAdminClubsForSelect(): Promise<
  Array<{ id: string; name: string }>
> {
  const supabase = await createClient();
  const { data } = await supabase.from("clubs").select("id, name").order("name");
  return (data ?? []).map((row) => ({ id: row.id, name: row.name }));
}

export async function listAdminTeamsForSelect(clubId?: string | null): Promise<
  Array<{ id: string; name: string; ageGroup: string | null; clubId: string; clubName: string }>
> {
  const supabase = await createClient();
  let query = supabase
    .from("teams")
    .select("id, name, age_group, club_id, clubs(name)")
    .order("name");

  if (clubId) {
    query = query.eq("club_id", clubId);
  }

  const { data } = await query;
  return (data ?? [])
    .map((row) => {
      const club = unwrapClub(row.clubs as { name: string } | { name: string }[] | null);
      if (!row.club_id || !club?.name) {
        return null;
      }
      return {
        id: row.id,
        name: row.name,
        ageGroup: row.age_group,
        clubId: row.club_id,
        clubName: club.name,
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);
}

export async function listAdminUsers(): Promise<{ users: AdminUserSummary[]; ready: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, first_name, last_name, display_name, email, phone, job_title, avatar_url, role, club_id, is_active, created_at, updated_at, clubs:club_id(id, name)",
    )
    .order("created_at", { ascending: false });

  if (error || !data) {
    return { users: [], ready: !isMissingRelationError(error) };
  }

  const { invitations: pendingInvitations } = await listPendingInvitations();
  const pendingByProfileId = new Map(
    pendingInvitations
      .filter((inv) => inv.status === "pending" && inv.profileId)
      .map((inv) => [inv.profileId!, inv]),
  );
  const pendingByEmail = new Map(
    pendingInvitations
      .filter((inv) => inv.status === "pending")
      .map((inv) => [inv.email.toLowerCase(), inv]),
  );

  const users = await Promise.all(
    (data as ProfileAuthRow[]).map(async (profile) => {
      const authorization = await loadUserAuthorization(profile.id);
      const club = unwrapClub(profile.clubs);

      const { data: roleRows } = await supabase
        .from("rbac_user_roles")
        .select("club_id, rbac_roles(key, name)")
        .eq("user_id", profile.id);

      const { data: teamRows } = await supabase
        .from("rbac_user_team_assignments")
        .select("team_id, teams(id, name, club_id, age_group, clubs(name))")
        .eq("user_id", profile.id);

      const emailKey = (profile.email ?? "").toLowerCase();
      const pendingInvite =
        pendingByProfileId.get(profile.id) ?? pendingByEmail.get(emailKey) ?? null;

      let accountStatus: AdminUserSummary["accountStatus"] = profile.is_active
        ? "active"
        : "inactive";
      if (pendingInvite) {
        accountStatus = "invitation_pending";
      }

      return {
        id: profile.id,
        firstName: profile.first_name ?? "",
        lastName: profile.last_name ?? "",
        displayName: profile.display_name,
        email: profile.email ?? "",
        phone: profile.phone,
        jobTitle: profile.job_title,
        avatarUrl: profile.avatar_url,
        profileRole: profile.role,
        clubId: profile.club_id,
        clubName: club?.name ?? null,
        isActive: profile.is_active,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
        lastSignInAt: null,
        accountStatus,
        invitationId: pendingInvite?.id ?? null,
        roles: (roleRows ?? [])
          .map((row) => {
            const role = row.rbac_roles as { key?: string; name?: string } | null;
            const key = role?.key ? toRoleKey(role.key) : null;
            if (!key || !role?.name) {
              return null;
            }
            return {
              key,
              name: role.name,
              clubId: row.club_id,
            };
          })
          .filter((value): value is NonNullable<typeof value> => value !== null),
        teamAssignments: (teamRows ?? [])
          .map((row) => {
            const team = row.teams as {
              id?: string;
              name?: string;
              club_id?: string;
              age_group?: string | null;
              clubs?: { name: string } | { name: string }[] | null;
            } | null;
            const teamClub = team?.clubs ? unwrapClub(team.clubs) : null;
            if (!team?.id || !team.name || !team.club_id) {
              return null;
            }
            return {
              teamId: team.id,
              teamName: team.name,
              clubId: team.club_id,
              ageGroup: team.age_group ?? null,
              clubName: teamClub?.name ?? null,
            };
          })
          .filter((value): value is NonNullable<typeof value> => value !== null),
        permissions: authorization.permissions,
      } satisfies AdminUserSummary;
    }),
  );

  return { users, ready: true };
}

export async function getAdminUser(userId: string): Promise<AdminUserSummary | null> {
  const { users, ready } = await listAdminUsers();
  if (!ready) {
    return null;
  }
  return users.find((user) => user.id === userId) ?? null;
}

export async function listRolePermissionMatrix(): Promise<
  Array<{ roleKey: RbacRoleKey; roleName: string; permissions: Permission[] }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rbac_role_permissions")
    .select("rbac_roles(key, name), rbac_permissions(key)");

  if (error || !data) {
    return [];
  }

  const matrix = new Map<RbacRoleKey, { roleName: string; permissions: Set<Permission> }>();

  for (const row of data) {
    const role = row.rbac_roles as { key?: string; name?: string } | null;
    const permission = (row.rbac_permissions as { key?: string } | null)?.key;
    const roleKey = role?.key ? toRoleKey(role.key) : null;
    if (!roleKey || !role?.name || !permission) {
      continue;
    }
    const current = matrix.get(roleKey) ?? { roleName: role.name, permissions: new Set<Permission>() };
    current.permissions.add(permission as Permission);
    matrix.set(roleKey, current);
  }

  return Array.from(matrix.entries()).map(([roleKey, value]) => ({
    roleKey,
    roleName: value.roleName,
    permissions: Array.from(value.permissions).sort(),
  }));
}
