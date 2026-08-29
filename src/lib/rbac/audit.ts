import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isMissingRelationError } from "@/lib/db/errors";

export const AUDIT_ACTIONS = [
  "USER_INVITED",
  "INVITATION_RESENT",
  "INVITATION_CANCELLED",
  "USER_ACTIVATED",
  "USER_DEACTIVATED",
  "ROLE_ASSIGNED",
  "ROLE_REVOKED",
  "TEAM_ASSIGNED",
  "TEAM_REVOKED",
  "CLUB_ASSIGNED",
  "PROFILE_UPDATED",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

type AuditMetadata = Record<string, string | number | boolean | null>;

export async function writeAdminAuditLog(input: {
  actorUserId: string;
  targetUserId?: string | null;
  action: AuditAction;
  metadata?: AuditMetadata;
}) {
  const row = {
    actor_user_id: input.actorUserId,
    target_user_id: input.targetUserId ?? null,
    action: input.action,
    metadata: input.metadata ?? {},
  };

  try {
    const service = createServiceRoleClient();
    const { error } = await service.from("admin_audit_log").insert(row);
    if (!error) {
      return;
    }
  } catch {
    // Fall back to authenticated insert for environments without service role in tests.
  }

  const supabase = await createClient();
  await supabase.from("admin_audit_log").insert(row);
}

export async function listAdminAuditLogForUser(
  targetUserId: string,
  limit = 20,
): Promise<{
  entries: Array<{
    id: string;
    action: string;
    actorUserId: string | null;
    metadata: AuditMetadata;
    createdAt: string;
  }>;
  ready: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("admin_audit_log")
    .select("id, action, actor_user_id, metadata, created_at")
    .eq("target_user_id", targetUserId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { entries: [], ready: !isMissingRelationError(error) };
  }

  return {
    ready: true,
    entries: (data ?? []).map((row) => ({
      id: row.id,
      action: row.action,
      actorUserId: row.actor_user_id,
      metadata: (row.metadata ?? {}) as AuditMetadata,
      createdAt: row.created_at,
    })),
  };
}
