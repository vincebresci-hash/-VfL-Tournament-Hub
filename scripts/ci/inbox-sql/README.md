# Inbox SQL integration (local disposable Supabase only)

Executable PostgreSQL/Supabase integration tests for the IONOS inbox migration.

## Safety rules

- Local `supabase start` containers only
- Never link a remote project or apply migrations to a remote database
- Never set production `DATABASE_URL` / Supabase secrets
- Never use IONOS IMAP or Resend credentials
- Does not exercise or modify the outbound Resend email system
- Historical migration SQL files are never modified

## Enum compatibility (CI-only)

Two historical migrations add enum values and use them in the same file, which
fails under Supabase CLI’s one-transaction-per-file apply (`SQLSTATE 55P04`):

- `20260820114200_application_status_emails.sql`
- `20260829160000_cancellation_requests.sql`

CI workaround (does not rewrite those files):

1. Disable `[db.migrations].enabled` in the runner’s `config.toml` copy
2. `supabase start` (Auth/Storage/Postgres only — no project migrations)
3. `apply-migrations.mjs` applies every migration in order
4. For the two fingerprint-pinned files only: commit the reviewed
   `ALTER TYPE ... ADD VALUE` statements, then apply the full original file
5. Fail closed if fingerprints or expected enum SQL drift

## Local / CI run

```bash
export INBOX_SQL_CI=1
node scripts/ci/inbox-sql/verify-enum-safe-fingerprints.mjs
node scripts/ci/inbox-sql/disable-auto-migrations.mjs
supabase start
node scripts/ci/inbox-sql/apply-migrations.mjs
node scripts/ci/inbox-sql/run.mjs
supabase stop --no-backup
```

CI entrypoint: `.github/workflows/inbox-sql-integration.yml`
