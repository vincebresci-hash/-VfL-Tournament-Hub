import Link from "next/link";
import {
  adminCardShellClass,
  adminCompactSecondaryButtonClass,
  adminSectionTitleClass,
  adminTextLinkClass,
} from "@/components/admin/AdminPanel";
import { formatBerlinClock } from "@/lib/schedule/datetime";
import { teamLabel } from "@/lib/schedule/names";
import type { TournamentMatchdayDashboardModel } from "@/lib/schedule/tournament-matchday-dashboard";
import type { TournamentFieldRecord, TournamentMatchRecord } from "@/types/schedule";

type TournamentMatchdayDashboardProps = {
  model: TournamentMatchdayDashboardModel;
  fields: TournamentFieldRecord[];
  teamLabels: Record<string, string>;
};

function fieldName(
  fields: TournamentFieldRecord[],
  fieldId: string | null,
): string | null {
  if (!fieldId) {
    return null;
  }
  return fields.find((field) => field.id === fieldId)?.name ?? null;
}

function matchLine(
  match: TournamentMatchRecord,
  teamLabels: Record<string, string>,
): string {
  const home = teamLabel(
    teamLabels,
    match.homeApplicationId ?? match.homeExternalTeamId,
    "Heim",
  );
  const away = teamLabel(
    teamLabels,
    match.awayApplicationId ?? match.awayExternalTeamId,
    "Gast",
  );
  return `${home} vs ${away}`;
}

function MatchRow({
  match,
  fields,
  teamLabels,
  badge,
}: {
  match: TournamentMatchRecord;
  fields: TournamentFieldRecord[];
  teamLabels: Record<string, string>;
  badge: string;
}) {
  const field = fieldName(fields, match.fieldId);
  const clock = formatBerlinClock(match.scheduledAt);
  const meta = [
    match.phase === "knockout" ? "K.-o." : "Gruppe",
    field,
    clock !== "—" ? clock : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className={`${adminCardShellClass} px-4 py-3`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
            {meta || "Spiel"}
          </p>
          <p className="mt-1 text-[15px] text-ink">{matchLine(match, teamLabels)}</p>
          {match.status === "completed" &&
          match.homeScore != null &&
          match.awayScore != null ? (
            <p className="mt-1 text-[14px] font-semibold text-ink">
              {match.homeScore}:{match.awayScore}
            </p>
          ) : null}
        </div>
        <span className="inline-flex h-7 shrink-0 items-center rounded-md border border-line bg-surface px-2 text-[11px] font-semibold tracking-[0.08em] text-ink uppercase">
          {badge}
        </span>
      </div>
    </article>
  );
}

export function TournamentMatchdayDashboard({
  model,
  fields,
  teamLabels,
}: TournamentMatchdayDashboardProps) {
  const { attention, progress, matchLists, quickActions, correctionWarning } = model;
  const hasMatchSection =
    matchLists.live.length > 0 ||
    matchLists.next.length > 0 ||
    matchLists.recent.length > 0;

  return (
    <section className="grid gap-5" aria-label="Matchday Dashboard">
      <div className={`${adminCardShellClass} border-brand-yellow/50 bg-[#fff8e0] px-4 py-4`}>
        <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
          Jetzt wichtig
        </p>
        <p className="mt-2 font-display text-xl font-bold tracking-wide text-ink uppercase">
          {attention.title}
        </p>
        {attention.href && attention.linkLabel ? (
          <Link href={attention.href} className={`mt-3 inline-flex ${adminTextLinkClass}`}>
            {attention.linkLabel} →
          </Link>
        ) : null}
        {correctionWarning ? (
          <p className="mt-3 text-[13px] leading-relaxed text-ink" role="status">
            {correctionWarning}
          </p>
        ) : null}
      </div>

      <section>
        <h2 className={adminSectionTitleClass}>Turnierfortschritt</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <ProgressStat label="Teams" value={String(progress.teamCount)} />
          <ProgressStat label="Gruppen" value={String(progress.groupCount)} />
          <ProgressStat
            label="Gruppenspiele"
            value={String(progress.groupMatchCount)}
          />
          <ProgressStat label="K.-o.-Spiele" value={String(progress.koMatchCount)} />
        </div>
        <div className={`mt-3 ${adminCardShellClass} px-4 py-3.5`}>
          <p className="text-[14px] text-ink">{progress.groupProgressLabel}</p>
          {progress.groupProgress.complete && progress.koMatchCount === 0 ? (
            <p className="mt-1 text-[13px] text-muted">Qualifikation bereit</p>
          ) : null}
          {progress.koProgressLabel ? (
            <p className="mt-1 text-[14px] text-ink">{progress.koProgressLabel}</p>
          ) : null}
          {progress.overallTotal > 0 ? (
            <p className="mt-1 text-[13px] text-muted">
              {progress.overallCompleted} von {progress.overallTotal} Spielen
              abgeschlossen
            </p>
          ) : null}
        </div>
      </section>

      {hasMatchSection ? (
        <section className="grid gap-3">
          {matchLists.live.length > 0 ? (
            <div>
              <h2 className={adminSectionTitleClass}>Live</h2>
              <div className="mt-3 grid gap-2">
                {matchLists.live.map((row) => (
                  <MatchRow
                    key={row.id}
                    match={row}
                    fields={fields}
                    teamLabels={teamLabels}
                    badge="Live"
                  />
                ))}
              </div>
            </div>
          ) : null}

          {matchLists.next.length > 0 ? (
            <div>
              <h2 className={adminSectionTitleClass}>Nächste Spiele</h2>
              <div className="mt-3 grid gap-2">
                {matchLists.next.map((row) => (
                  <MatchRow
                    key={row.id}
                    match={row}
                    fields={fields}
                    teamLabels={teamLabels}
                    badge="Geplant"
                  />
                ))}
              </div>
            </div>
          ) : null}

          {matchLists.recent.length > 0 ? (
            <div>
              <h2 className={adminSectionTitleClass}>Zuletzt beendet</h2>
              <div className="mt-3 grid gap-2">
                {matchLists.recent.map((row) => (
                  <MatchRow
                    key={row.id}
                    match={row}
                    fields={fields}
                    teamLabels={teamLabels}
                    badge="Beendet"
                  />
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section>
        <h2 className={adminSectionTitleClass}>Schnellzugriff</h2>
        <p className="mt-1 text-[13px] text-muted">
          Bestehende Bereiche — ohne neue Aktionen auf diesem Dashboard.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {quickActions.map((action) => (
            <Link
              key={action.key}
              href={action.href}
              className={
                action.emphasized
                  ? `${adminCardShellClass} border-brand-yellow/70 bg-[#fff8e0] px-4 py-3.5 transition-colors hover:border-navy/20`
                  : `${adminCardShellClass} px-4 py-3.5 transition-colors hover:border-navy/20`
              }
            >
              <p className="font-display text-sm font-bold tracking-wide text-ink uppercase">
                {action.label}
              </p>
              <p className="mt-1 text-[13px] text-muted">{action.hint}</p>
            </Link>
          ))}
        </div>
        {attention.href && attention.linkLabel ? (
          <Link
            href={attention.href}
            className={`mt-4 inline-flex ${adminCompactSecondaryButtonClass}`}
          >
            {attention.linkLabel}
          </Link>
        ) : null}
      </section>
    </section>
  );
}

function ProgressStat({ label, value }: { label: string; value: string }) {
  return (
    <article className={`${adminCardShellClass} px-4 py-3.5`}>
      <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
        {label}
      </p>
      <p className="mt-1.5 font-display text-2xl font-bold tracking-wide text-ink">
        {value}
      </p>
    </article>
  );
}
