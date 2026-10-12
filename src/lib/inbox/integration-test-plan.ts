/**
 * Local PostgreSQL integration test plan for inbox SQL concurrency.
 *
 * This environment has no local Postgres. These cases MUST be run before
 * production migration against a disposable local/staging database — never
 * production Supabase / IONOS.
 *
 * Reproduce:
 * 1. Start local Postgres 15+ with Supabase-like roles (anon, authenticated, service_role).
 * 2. Apply prior migrations through baseline, then 20261009150000_ionos_inbox_readonly.sql.
 * 3. Seed SUPER_ADMIN / ADMIN / COMMUNICATION_MANAGER users with rbac_* tables.
 * 4. Execute cases below via psql or a vitest/pg harness.
 */

export const INBOX_SQL_INTEGRATION_CASES = [
  {
    id: "lock-acquire-exclusive",
    description: "Two concurrent acquire_inbox_sync_lock calls — only one wins.",
  },
  {
    id: "stale-upsert-rejected",
    description:
      "Worker A loses lock (TTL expiry + B acquire); A's upsert_inbox_message_from_sync raises Sync lock lost.",
  },
  {
    id: "stale-attachment-upsert-rejected",
    description: "Same as above for upsert_inbox_attachment_from_sync.",
  },
  {
    id: "stale-cursor-rejected",
    description: "advance_inbox_sync_cursor returns false for expired/wrong token.",
  },
  {
    id: "local-status-preserved",
    description:
      "After set_inbox_message_local_state(unread=false, status=done), sync upsert does not overwrite those columns.",
  },
  {
    id: "attachment-never-downgrade",
    description:
      "Stored attachment remains stored when a failed retry upserts stored=false for the same part_index.",
  },
  {
    id: "sync-status-hides-lock",
    description:
      "authenticated + inbox.view can EXECUTE get_inbox_sync_status but SELECT on inbox_sync_state is denied; result has no lock_token.",
  },
  {
    id: "cm-denied",
    description: "COMMUNICATION_MANAGER cannot SELECT inbox_messages or EXECUTE set_inbox_message_local_state.",
  },
  {
    id: "orphan-lease-gc",
    description:
      "Uncommitted lease older than max age, not referenced by stored attachment, and lock not held by lease token — list_expired returns it; delete_inbox_storage_lease succeeds; referenced stored path refuses delete.",
  },
  {
    id: "repair-bookkeeping",
    description:
      "mark_inbox_attachment_repair_attempt increments retry_count and stores short error code only.",
  },
] as const;

export function describeInboxSqlIntegrationPlan(): string {
  return INBOX_SQL_INTEGRATION_CASES.map(
    (entry, index) => `${index + 1}. [${entry.id}] ${entry.description}`,
  ).join("\n");
}
