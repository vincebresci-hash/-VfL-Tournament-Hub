# CL Release 5 — Admin schedule E2E (local, isolated)

Real-browser end-to-end checks for the Champions League admin schedule
management. **Everything here runs against a throwaway LOCAL Supabase stack.**
It never touches the hosted project `ogopebvpojuvheimzged` and needs no remote
secrets.

> Execution status in the delivering session: **not run.** Docker Desktop's
> Linux engine would not start non-interactively in the delivery environment
> (WSL2 present, `com.docker.backend` never came up), and no local PostgreSQL 17
> was available, so `supabase start` could not provision the stack. The logic is
> covered by the Node suites (`npm run test:cl-*`) and the PostgreSQL 17 contract
> job in CI. Run the steps below on a machine with Docker to complete the
> real-browser acceptance.

## 1. Bring up the local stack

```bash
# From the repo root. Requires Docker Desktop running.
npx supabase start                 # prints the local API URL + anon/service keys
npx supabase db reset              # applies ALL migrations to the LOCAL db only
```

Create `.env.local` from the `supabase start` output:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase start>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase start>
```

Seed the synthetic scenarios. The `tournaments` row is created through the
normal admin flow (so every required column is filled correctly), then the
confirmed participants and fields are added with a service-role helper:

```bash
# 1. Create one tournament per scenario at /admin/turniere/neu and note its slug.
# 2. Fill accepted synthetic participants + fields for a scenario:
node e2e/seed/participants.mjs <slug> --teams 10 --fields 3
# Scenario B (the 20-of-20 case): also pre-create ONE resultless group via the
# Gruppen page so the legacy mode-switch path is exercised.
```

Then run the app and the browser tests:

```bash
npm run dev            # http://localhost:3000
npx playwright install chromium
npx playwright test --config e2e/playwright.config.ts
```

## 2. Synthetic scenarios (seed)

The seed creates isolated synthetic tournaments — no real club or team data:

| Key | Teams | Games/team | League games | Cutoff | Notes |
|-----|-------|------------|--------------|--------|-------|
| A   | 10    | 3          | 15           | Top 8  | odd games/team |
| B   | 10    | 4          | 20           | Top 8  | the reported 20/20 case, pre-seeded with ONE resultless group |
| C   | 18    | 8          | 72           | Top 16 | 3 fields, 9+1 min |
| D   | 10    | round-robin| 45           | —      | Jeder gegen jeden |
| E   | classic groups + KO (regression) | | | | must stay unchanged |

## 3. Acceptance checklist (the decisive criterion)

Automated unit/contract tests are **not** sufficient on their own. Verify in the
browser, desktop and mobile widths:

1. Select each competition mode; all Spielparameter (Spielzeit, Wechselzeit,
   Mindestruhezeit, Mittagspause, Spielfelder) are editable and save.
2. Changing a parameter and re-running the preview reflects the change.
3. Scenario B: preview shows 20/20; **Spielplan übernehmen** is enabled and
   persists; reload shows the saved Ligaphase.
4. Editable preview: move a match up/down, change a kickoff and a field,
   recompute times, reset — validation blocks double bookings / same-club /
   duplicate pairings; apply persists the edited order/times.
5. Club assignment: missing clubs are surfaced; suggestions appear; VfL
   Kirchheim 1 and 2 can be assigned to the same club; no silent assignment.
6. Protections hold: a tournament with results / live / KO / completed is locked;
   RBAC/RLS respected; concurrent edits produce a clear stale/confirm message.
7. Public schedule + standings + PDF reflect the applied plan.

Capture screenshots into `e2e/screenshots/` for the acceptance record.
