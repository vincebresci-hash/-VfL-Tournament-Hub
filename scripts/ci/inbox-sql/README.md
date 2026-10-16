# Inbox SQL integration (local disposable Supabase only)

Executable PostgreSQL/Supabase integration tests for the IONOS inbox migration.

## Safety rules

- Local `supabase start` containers only
- Never link a remote project or apply migrations to a remote database
- Never set production `DATABASE_URL` / Supabase secrets
- Never use IONOS IMAP or Resend credentials
- Does not exercise or modify the outbound Resend email system
- Historical migration SQL files are never modified

## Reply SQL suite

`run.mjs` loads `reply-tests.mjs` after the legacy inbox cases. Those tests exercise
`claim_inbox_reply_send` / finalize / reconcile with real concurrent `pg` connections
(authenticated JWT claims + `SET LOCAL ROLE`). They never call SMTP or Resend.

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

## Function return-type compatibility (CI-only)

`20260825160000_participant_logos.sql` widens
`public.tournament_public_roster(text)` from an 8-column to a 10-column
`RETURNS TABLE`. PostgreSQL rejects that via `CREATE OR REPLACE`.

CI workaround (does not rewrite that file):

1. Fingerprint-pin the historical file
2. Resolve the live function with `to_regprocedure('public.tournament_public_roster(text)')`
   (do **not** compare `pg_get_function_identity_arguments()` to bare `"text"` —
   named parameters format as `"p_slug text"`)
3. Verify the expected 8-column return shape and no blocking dependents
4. In the **same transaction**, run exactly
   `DROP FUNCTION public.tournament_public_roster(text);` (**never CASCADE**),
   then apply the full original migration file
5. After the full chain, assert the final 10-column SECURITY DEFINER function,
   `search_path=public`, EXECUTE for `anon`/`authenticated`, and the later
   `20260913200000_application_participant_logos.sql` body

Catalog lookup unit tests (mock client; no Postgres required):

```bash
node scripts/ci/inbox-sql/function-catalog-lookup.test.mjs
```

## Local / CI run

```bash
export INBOX_SQL_CI=1
node scripts/ci/inbox-sql/verify-enum-safe-fingerprints.mjs
node scripts/ci/inbox-sql/verify-function-return-compat-fingerprints.mjs
node scripts/ci/inbox-sql/function-catalog-lookup.test.mjs
node scripts/ci/inbox-sql/disable-auto-migrations.mjs
supabase start
node scripts/ci/inbox-sql/apply-migrations.mjs
node scripts/ci/inbox-sql/run.mjs
supabase stop --no-backup
```

CI entrypoint: `.github/workflows/inbox-sql-integration.yml`
