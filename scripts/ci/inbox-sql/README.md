# Inbox SQL integration (local disposable Supabase only)

Executable PostgreSQL/Supabase integration tests for the IONOS inbox migration.

## Safety rules

- Local `supabase start` containers only
- Never link a remote project or apply migrations to a remote database
- Never set production `DATABASE_URL` / Supabase secrets
- Never use IONOS IMAP or Resend credentials
- Does not exercise or modify the outbound Resend email system

## Local run

```bash
supabase start
supabase db reset --yes
node scripts/ci/inbox-sql/run.mjs
supabase stop --no-backup
```

CI entrypoint: `.github/workflows/inbox-sql-integration.yml`
