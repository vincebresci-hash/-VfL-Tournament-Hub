# CL Release 5 — Admin schedule E2E (local, isolated)

Real-browser end-to-end checks for the Champions League admin schedule
management. **Everything here runs against a throwaway LOCAL Supabase stack.**
It never touches the hosted project `ogopebvpojuvheimzged` and needs no remote
secrets.

> ## Execution status: real-browser E2E NOT run (environment blocker)
>
> The local stack could not be started in the delivery environment. Concrete,
> reproduced errors (2026-11-26):
>
> - `npx supabase start` →
>   `DockerLifecycleInspectError: failed to inspect container health: failed to
>   connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine ...
>   The system cannot find the file specified.`
> - `docker info` / `docker ps` → same `dockerDesktopLinuxEngine` pipe error
>   (CLI present, context `desktop-linux`, but no engine backend).
> - Launching `Docker Desktop.exe` left only `wslservice` running;
>   `com.docker.backend` never started.
> - `docker desktop start` → `✗ Failed to start Docker Desktop / Docker Desktop
>   terminated unexpectedly`.
> - `wsl --status` → "WSL1 wird mit Ihrer aktuellen Computer-Konfiguration nicht
>   unterstützt", i.e. the WSL2/virtualization backend Docker Desktop needs is not
>   usable here.
>
> No local PostgreSQL 17 binaries are installed either, so the disposable-cluster
> path could not substitute. **The production database was NOT used as a test
> environment** (explicitly out of bounds).
>
> What IS verified instead: the Node suites (`npm run test:cl-*`, 45 cases) and
> the **PostgreSQL 17 contract job in CI** (which runs the new migration and the
> resultless-legacy-switch / multi-group-block assertions on a real PG17). The
> real-browser click-through below is the remaining **open** acceptance step and
> must be run on a Docker-capable machine.
>
> ### Why Docker won't start here (diagnosed 2026-11-26, read-only)
>
> The WSL engine fails to mount Docker's data disk:
> `Fehler beim Anfügen des Datenträgers "D:\DockerData\DockerDesktopWSL\main\ext4.vhdx" an WSL2: Zugriff verweigert — Wsl/Service/CreateInstance/MountDisk/HCS/E_ACCESSDENIED`.
> Facts: WSL2 + virtualization are healthy (hypervisor present, VT enabled); the
> `docker-desktop` distro exists; the VHDX is on the **D: drive** (custom
> `CustomWslDistroDir`), ~92 MB, **not locked**, 943 GB free, user has Modify.
> The session is **not elevated**. This is the typical non-admin HCS mount
> permission failure for a WSL VHDX on a secondary drive.
>
> **Fix (needs YOUR action — elevation or a Docker-data change, intentionally not
> done automatically):** either
> 1. Start **Docker Desktop as administrator** once (right-click → *Als
>    Administrator ausführen*), let it initialize, then `docker info` should show a
>    Server; or
> 2. In Docker Desktop → *Settings → Resources → Advanced* (or *WSL*), move the
>    disk image back to the **default location on C:** (or *Troubleshoot → Clean /
>    Purge data* if you accept re-initialising Docker's local data — destructive,
>    your call); or
> 3. Grant the virtualization service access to `D:\DockerData\DockerDesktopWSL`
>    and retry.
> After `docker info` shows a Server, run the steps below.
>
> ### Safe manual acceptance path (no Docker, no prod DB)
>
> If no Docker host is available, verify on an **isolated non-production Supabase
> project** that you own (a free throwaway project — never `ogopebvpojuvheimzged`):
> point `.env.local` at it, `npx supabase db push` the migrations to THAT project,
> create the synthetic tournaments via the admin UI, and walk the checklist in
> §3 by hand, capturing screenshots. Delete the throwaway project afterwards.
> This keeps the acceptance real and browser-based without touching production.

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
