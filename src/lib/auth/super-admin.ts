/**
 * Super-admin capabilities are prepared here for a later UI.
 * No screens in this step. Accounts will be created exclusively
 * by a super-admin once Supabase Auth is connected.
 */
export const SUPER_ADMIN_CAPABILITIES = [
  "create-admins",
  "deactivate-admins",
  "assign-roles",
  "manage-system-settings",
] as const;

export type SuperAdminCapability = (typeof SUPER_ADMIN_CAPABILITIES)[number];
