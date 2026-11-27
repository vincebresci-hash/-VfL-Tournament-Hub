import type { CSSProperties, ReactNode } from "react";
import type { PdfLayout, PdfTimelineRow } from "@/lib/schedule/pdf-layout";
import type { KnockoutRound } from "@/types/schedule";

const NAVY = "#0b2a5e";
const BLUE = "#0b4aa0";
const BLUE_ROW = "#eaf1fb";
const YELLOW = "#ffcc00";
const BORDER = "#c7d3e6";

export type PdfMatchRow = {
  key: string;
  number: number;
  time: string;
  fieldName: string;
  homeName: string;
  awayName: string;
  result: string;
  roundLabel?: string | null;
  round?: KnockoutRound | null;
  nextKey?: string | null;
  isFinal?: boolean;
};

export type PdfStandingRow = {
  rank: number;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals: string;
  goalDiff: number;
  points: number;
  qualified: boolean;
};

export type SchedulePdfDocumentProps = {
  layout: PdfLayout;
  draft: boolean;
  tournamentName: string;
  dateLabel: string;
  startTimeLabel: string | null;
  location: string | null;
  description: string | null;
  modeLabel: string;
  metaLine: string;
  participants: string[];
  participantGroups: Array<{ title: string; names: string[] }> | null;
  scheduleTitle: string;
  singleColumnMatches: PdfMatchRow[];
  timelineRows: Array<PdfTimelineRow<PdfMatchRow>> | null;
  fieldNames: string[];
  standings: Array<{ title: string; rows: PdfStandingRow[] }>;
  showStandings: boolean;
  standingsFinalized: boolean;
  knockoutTitle: string;
  knockoutSchedule: PdfMatchRow[];
  knockout: PdfMatchRow[];
};

const th: CSSProperties = {
  background: BLUE,
  color: "white",
  textAlign: "left",
  padding: "5px 7px",
  fontSize: "9.5px",
  fontWeight: 600,
  letterSpacing: "0.03em",
};
const td: CSSProperties = { padding: "4px 7px", fontSize: "10px", borderBottom: `1px solid ${BORDER}` };

function rowStyle(index: number, highlight?: boolean): CSSProperties {
  return { background: highlight ? "#fff6cc" : index % 2 === 1 ? BLUE_ROW : "white" };
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 style={{ color: NAVY, fontSize: "15px", fontWeight: 700, margin: "0 0 7px", borderLeft: `4px solid ${YELLOW}`, paddingLeft: "8px" }}>
      {children}
    </h2>
  );
}

function ResultValue({ result, compact = false }: { result: string; compact?: boolean }) {
  const empty = !result.trim() || result === "—" || result === "-";
  if (!empty) return <strong>{result}</strong>;
  return (
    <span className={`pdf-result-fields${compact ? " pdf-result-fields-compact" : ""}`} aria-label="Ergebnis zum Eintragen">
      <span />
      <b>:</b>
      <span />
    </span>
  );
}

function ScheduleTable({
  rows,
  showResult,
  showRound = false,
}: {
  rows: PdfMatchRow[];
  showResult: boolean;
  showRound?: boolean;
}) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={{ ...th, width: "7%" }}>Nr.</th>
          <th style={{ ...th, width: "16%" }}>Anstoß</th>
          <th style={{ ...th, width: "12%" }}>Feld</th>
          {showRound ? <th style={{ ...th, width: "15%" }}>Runde</th> : null}
          <th style={th}>Team 1</th>
          <th style={th}>Team 2</th>
          {showResult ? <th style={{ ...th, width: "14%" }}>Ergebnis</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((match, index) => (
          <tr
            key={match.key}
            style={rowStyle(index)}
            {...(showRound ? { "data-knockout-key": match.key } : { "data-match-key": match.key })}
          >
            <td style={td}>{match.number}</td>
            <td style={td}>{match.time}</td>
            <td style={td}>{match.fieldName}</td>
            {showRound ? <td style={td}>{match.roundLabel ?? "K.-o.-Spiel"}</td> : null}
            <td style={{ ...td, fontWeight: 600 }}>{match.homeName}</td>
            <td style={{ ...td, fontWeight: 600 }}>{match.awayName}</td>
            {showResult ? (
              <td style={td} data-match-result={match.result}>
                <ResultValue result={match.result} />
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TimelineTable({
  rows,
  fieldNames,
  showResult,
}: {
  rows: Array<PdfTimelineRow<PdfMatchRow>>;
  fieldNames: string[];
  showResult: boolean;
}) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
      <thead>
        <tr>
          <th style={{ ...th, width: "13%" }}>Anstoß</th>
          {fieldNames.map((name) => (
            <th key={name} style={th}>
              {name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={row.scheduledAt ?? `u${index}`} style={rowStyle(index)}>
            <td style={{ ...td, fontWeight: 600 }}>{row.cells.find((cell) => cell.match)?.match?.time ?? "—"}</td>
            {row.cells.map((cell) => (
              <td key={cell.fieldId} style={td}>
                {cell.match ? (
                  <span className="pdf-timeline-match" data-match-key={cell.match.key}>
                    <span className="pdf-timeline-fixture">
                      <span style={{ color: BLUE, fontWeight: 700 }}>#{cell.match.number} </span>
                      {cell.match.homeName} – {cell.match.awayName}
                    </span>
                    {showResult ? (
                      <span
                        className="pdf-timeline-result"
                        data-match-result={cell.match.result}
                      >
                        <ResultValue result={cell.match.result} compact />
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span style={{ color: "#9aa7bd" }}>—</span>
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StandingsTable({ rows }: { rows: PdfStandingRow[] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={{ ...th, width: "6%" }}>Pl.</th>
          <th style={th}>Mannschaft</th>
          <th style={{ ...th, width: "7%" }}>Sp</th>
          <th style={{ ...th, width: "6%" }}>S</th>
          <th style={{ ...th, width: "6%" }}>U</th>
          <th style={{ ...th, width: "6%" }}>N</th>
          <th style={{ ...th, width: "12%" }}>Tore</th>
          <th style={{ ...th, width: "8%" }}>Diff</th>
          <th style={{ ...th, width: "8%" }}>Pkt</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr
            key={`${row.rank}-${row.teamName}`}
            style={{
              ...rowStyle(index, row.qualified),
              ...(index > 0 && rows[index - 1]?.qualified && !row.qualified
                ? { borderTop: `3px solid ${YELLOW}` }
                : {}),
            }}
          >
            <td style={{ ...td, fontWeight: 700, color: row.qualified ? NAVY : undefined }}>{row.rank}</td>
            <td style={{ ...td, fontWeight: 600 }}>{row.teamName}</td>
            <td style={td}>{row.played}</td>
            <td style={td}>{row.won}</td>
            <td style={td}>{row.drawn}</td>
            <td style={td}>{row.lost}</td>
            <td style={td}>{row.goals}</td>
            <td style={td}>{row.goalDiff}</td>
            <td style={{ ...td, fontWeight: 700 }}>{row.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const BRACKET_ROUNDS: KnockoutRound[] = [
  "round-of-16",
  "quarterfinal",
  "semifinal",
  "final",
];

function BracketMatch({ match }: { match: PdfMatchRow }) {
  return (
    <article className={`pdf-bracket-match${match.isFinal ? " pdf-bracket-final" : ""}`}>
      <p className="pdf-bracket-meta">
        {match.time} · {match.fieldName}
      </p>
      <div className="pdf-bracket-team">{match.homeName}</div>
      <div className="pdf-bracket-team">{match.awayName}</div>
      <span className="pdf-bracket-result"><ResultValue result={match.result} compact /></span>
    </article>
  );
}

function KnockoutBracket({ matches }: { matches: PdfMatchRow[] }) {
  const mainRounds = BRACKET_ROUNDS.map((round) => ({
    round,
    matches: matches.filter((match) => match.round === round),
  })).filter((entry) => entry.matches.length > 0);
  const placementMatches = matches.filter(
    (match) =>
      match.round === "third-place" ||
      match.round === "placement-5" ||
      match.round === "placement-7",
  );

  return (
    <div
      className="pdf-bracket"
      style={{ gridTemplateColumns: `repeat(${Math.max(mainRounds.length, 1)}, minmax(0, 1fr))` }}
    >
      {mainRounds.map((entry, roundIndex) => (
        <section className="pdf-bracket-round" key={entry.round}>
          <h3>{entry.matches[0]?.roundLabel}</h3>
          <div className="pdf-bracket-stack">
            {roundIndex < mainRounds.length - 1
              ? Array.from(
                  { length: Math.ceil(entry.matches.length / 2) },
                  (_, pairIndex) => entry.matches.slice(pairIndex * 2, pairIndex * 2 + 2),
                ).map((pair) => (
                  <div className="pdf-bracket-pair" key={pair.map((match) => match.key).join("-")}>
                    {pair.map((match) => (
                      <div className="pdf-bracket-connector" key={match.key}>
                        <BracketMatch match={match} />
                      </div>
                    ))}
                  </div>
                ))
              : (
                <>
                  {entry.matches.map((match) => <BracketMatch key={match.key} match={match} />)}
                  {placementMatches.map((match) => (
                    <div className="pdf-bracket-placement" key={match.key}>
                      <h4>{match.roundLabel}</h4>
                      <BracketMatch match={match} />
                    </div>
                  ))}
                </>
              )}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * Central, reusable schedule PDF document. All content is derived from the
 * tournament data passed in — nothing is hard-coded from the reference designs.
 * Print-optimised adaptive A4 layout with paged-media headers and counters.
 */
export function SchedulePdfDocument(props: SchedulePdfDocumentProps) {
  const pageOrientation =
    props.layout === "cl-single" || props.layout === "bambini"
      ? "portrait"
      : "landscape";

  return (
    <div
      className={`pdf-root pdf-layout-${props.layout}${props.participants.length <= 10 ? " pdf-small-tournament" : ""}`}
      style={{ background: "white", color: "#13223d", fontFamily: "'Segoe UI', Arial, sans-serif" }}
    >
      <style>{`
        @page {
          size: A4 ${pageOrientation};
          margin: 13mm 10mm 14mm;
          @top-left { content: "VfL Kirchheim/Teck · Tournament Hub"; color: ${NAVY}; font-size: 9px; font-weight: 700; }
          @top-right { content: "Offizieller Turnierspielplan"; color: ${BLUE}; font-size: 9px; }
          @bottom-left { content: "VfL Kirchheim/Teck"; color: #66758d; font-size: 8px; }
          @bottom-right { content: "Seite " counter(page) " / " counter(pages); color: #66758d; font-size: 8px; }
        }
        @media print {
          html, body, main { margin: 0 !important; padding: 0 !important; background: white !important; }
          nav, header.app-chrome, button, .print\\:hidden, .pdf-document-footer { display: none !important; }
          .pdf-preview-shell { max-width: none !important; margin: 0 !important; padding: 0 !important; background: white !important; }
          .pdf-root { width: auto !important; max-width: none !important; margin: 0 !important; padding: 0 !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
          .pdf-root th { padding: 3px 5px !important; font-size: 8px !important; }
          .pdf-root td { padding: 2.4px 5px !important; font-size: 8.4px !important; line-height: 1.18 !important; }
          .pdf-root .pdf-document-header { gap: 9px !important; padding-bottom: 6px !important; }
          .pdf-root .pdf-document-header img { width: 42px !important; height: 42px !important; }
          .pdf-root .pdf-document-title { font-size: 18px !important; }
          .pdf-root .pdf-description { margin-top: 6px !important; font-size: 9px !important; line-height: 1.3 !important; }
          .pdf-root .pdf-content-section { margin-top: 7px !important; }
          .pdf-root .pdf-section-heading { margin-bottom: 4px !important; font-size: 12px !important; }
          .pdf-root .pdf-participant-list { font-size: 8.5px !important; line-height: 1.15 !important; }
          .pdf-root .pdf-knockout-section { break-before: page; page-break-before: always; }
          .pdf-layout-cl-single .pdf-standings-table { break-inside: avoid; page-break-inside: avoid; }
          .pdf-layout-cl-single td { padding-top: 1.8px !important; padding-bottom: 1.8px !important; }
          .pdf-small-tournament .pdf-standings-table { break-inside: avoid; page-break-inside: avoid; }
          .pdf-small-tournament th { padding-top: 2px !important; padding-bottom: 2px !important; }
          .pdf-small-tournament td { padding-top: 1.2px !important; padding-bottom: 1.2px !important; font-size: 7.9px !important; line-height: 1.08 !important; }
          .pdf-small-tournament .pdf-content-section { margin-top: 5px !important; }
          .pdf-small-tournament .pdf-result-fields-compact > span { width: 11px !important; height: 9px !important; }
        }
        .pdf-root section { break-inside: auto; }
        .pdf-root table { break-inside: auto; }
        .pdf-root thead { display: table-header-group; }
        .pdf-root tr, .pdf-root h2, .pdf-root h3 { break-inside: avoid; }
        .pdf-root h2 { break-after: avoid; page-break-after: avoid; }
        .pdf-section { break-before: auto; }
        .pdf-knockout-schedule, .pdf-bracket-block { break-inside: avoid; page-break-inside: avoid; }
        .pdf-bracket-block { margin-top: 14px; }
        .pdf-bracket { display: grid; gap: 20px; align-items: stretch; }
        .pdf-bracket-round { display: flex; min-width: 0; flex-direction: column; }
        .pdf-bracket-round > h3 { margin: 0 0 6px; color: ${NAVY}; font-size: 11px; text-transform: uppercase; }
        .pdf-bracket-stack { position: relative; display: flex; flex: 1; flex-direction: column; justify-content: space-evenly; gap: 5px; }
        .pdf-bracket-pair { position: relative; display: flex; flex: 1; flex-direction: column; justify-content: space-evenly; gap: 5px; }
        .pdf-bracket-pair::after { content: ""; position: absolute; z-index: 0; top: 25%; right: -10px; bottom: 25%; border-right: 2px solid ${BLUE}; }
        .pdf-bracket-connector { position: relative; break-inside: avoid; page-break-inside: avoid; }
        .pdf-bracket-connector::after { content: ""; position: absolute; z-index: 0; top: 50%; right: -10px; width: 10px; border-top: 2px solid ${BLUE}; }
        .pdf-bracket-round:not(:first-child) .pdf-bracket-match::before { content: ""; position: absolute; top: 50%; left: -11px; width: 10px; border-top: 2px solid ${BLUE}; }
        .pdf-bracket-match { position: relative; z-index: 1; break-inside: avoid; page-break-inside: avoid; border: 1px solid ${BORDER}; border-left: 4px solid ${YELLOW}; background: white; padding: 4px 6px; box-shadow: 0 1px 2px rgba(11,42,94,.08); }
        .pdf-bracket-final { border-color: ${BLUE}; background: #f4f8ff; }
        .pdf-bracket-meta { margin: 0 0 3px; color: #66758d; font-size: 8px; }
        .pdf-bracket-team { border-top: 1px solid #e5ebf4; padding: 3px 0; color: ${NAVY}; font-size: 9px; font-weight: 600; }
        .pdf-bracket-result { position: absolute; right: 7px; top: 5px; color: ${BLUE}; font-size: 9px; }
        .pdf-result-fields { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; }
        .pdf-result-fields > span { display: inline-block; width: 20px; height: 15px; border: 1.5px solid ${BLUE}; border-radius: 2px; background: white; }
        .pdf-result-fields > b { color: ${NAVY}; font-size: 10px; }
        .pdf-result-fields-compact > span { width: 13px; height: 11px; }
        .pdf-result-fields-compact > b { font-size: 8px; }
        .pdf-timeline-match { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 5px; }
        .pdf-timeline-fixture { min-width: 0; overflow-wrap: anywhere; }
        .pdf-timeline-result { flex: none; color: ${NAVY}; white-space: nowrap; }
        .pdf-bracket-placement { break-inside: avoid; page-break-inside: avoid; border-top: 2px solid ${YELLOW}; padding-top: 6px; }
        .pdf-bracket-placement h4 { margin: 0 0 5px; color: ${NAVY}; font-size: 9px; text-transform: uppercase; }
        .pdf-layout-cl-multi th { padding-top: 4px !important; padding-bottom: 4px !important; }
        .pdf-layout-cl-multi td { padding-top: 3px !important; padding-bottom: 3px !important; }
        .pdf-layout-bambini th, .pdf-layout-bambini td { padding-top: 2.5px !important; padding-bottom: 2.5px !important; }
        .pdf-layout-bambini section { margin-top: 10px !important; }
      `}</style>

      {/* Header */}
      <div className="pdf-document-header" style={{ display: "flex", alignItems: "center", gap: "14px", borderBottom: `3px solid ${YELLOW}`, paddingBottom: "10px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/vfl-logo-transparent.png" alt="VfL Kirchheim/Teck" width={56} height={56} style={{ objectFit: "contain" }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h1 className="pdf-document-title" style={{ color: NAVY, fontSize: "22px", fontWeight: 800, margin: 0 }}>{props.tournamentName}</h1>
            {props.draft ? (
              <span style={{ background: YELLOW, color: NAVY, fontSize: "10px", fontWeight: 800, padding: "2px 8px", borderRadius: "3px", letterSpacing: "0.08em" }}>
                ENTWURF
              </span>
            ) : null}
          </div>
          <p style={{ margin: "3px 0 0", fontSize: "11px", color: "#44546f" }}>
            {props.dateLabel}
            {props.startTimeLabel ? ` · ab ${props.startTimeLabel} Uhr` : ""}
            {props.location ? ` · ${props.location}` : ""}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: "11px", color: BLUE, fontWeight: 600 }}>
            {props.modeLabel} · {props.metaLine}
          </p>
        </div>
      </div>

      {props.description ? (
        <p className="pdf-description" style={{ fontSize: "10.5px", color: "#3b485f", margin: "10px 0 0", lineHeight: 1.5 }}>{props.description}</p>
      ) : null}

      {/* Participants */}
      {props.participants.length > 0 ? (
        <section className="pdf-content-section" style={{ marginTop: "11px" }}>
          <div className="pdf-section-heading"><SectionHeading>Teilnehmer ({props.participants.length})</SectionHeading></div>
          {props.participantGroups && props.participantGroups.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(props.participantGroups.length, 4)}, minmax(0, 1fr))`, gap: "12px" }}>
              {props.participantGroups.map((group) => (
                <div key={group.title} style={{ breakInside: "avoid" }}>
                  <h3 style={{ color: NAVY, fontSize: "10.5px", margin: "0 0 3px" }}>{group.title}</h3>
                  <ol className="pdf-participant-list" style={{ margin: 0, paddingLeft: "18px", fontSize: "9.5px" }}>
                    {group.names.map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}
                  </ol>
                </div>
              ))}
            </div>
          ) : (
            <ol className="pdf-participant-list" style={{ columnCount: props.participants.length > 12 ? 3 : props.participants.length > 1 ? 2 : 1, columnGap: "20px", margin: 0, paddingLeft: "18px", fontSize: "9.5px", lineHeight: 1.25 }}>
              {props.participants.map((name, index) => (
                <li key={`${name}-${index}`} style={{ breakInside: "avoid", padding: "0.5px 0" }}>
                  {name}
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}

      {/* Schedule */}
      <section className="pdf-content-section" style={{ marginTop: "13px" }}>
        <div className="pdf-section-heading"><SectionHeading>{props.scheduleTitle}</SectionHeading></div>
        {props.timelineRows && props.timelineRows.length > 0 ? (
          <TimelineTable
            rows={props.timelineRows}
            fieldNames={props.fieldNames}
            showResult={props.layout !== "bambini"}
          />
        ) : props.singleColumnMatches.length > 0 ? (
          <ScheduleTable rows={props.singleColumnMatches} showResult={props.layout !== "bambini"} />
        ) : (
          <p style={{ fontSize: "11px" }}>Noch keine Begegnungen.</p>
        )}
      </section>

      {/* Standings */}
      {props.showStandings && props.standings.length > 0 ? (
        <section className="pdf-section pdf-content-section pdf-standings-section" style={{ marginTop: "16px" }}>
          <div className="pdf-section-heading"><SectionHeading>{props.layout.startsWith("cl") ? "Gesamttabelle (Ligaphase)" : "Tabellen"}</SectionHeading></div>
          {props.standings.map((table) => (
            <div key={table.title} style={{ marginTop: "10px" }}>
              {props.standings.length > 1 || !props.layout.startsWith("cl") ? (
                <h3 style={{ color: NAVY, fontSize: "12px", fontWeight: 700, margin: "0 0 5px" }}>{table.title}</h3>
              ) : null}
              <div className="pdf-standings-table"><StandingsTable rows={table.rows} /></div>
            </div>
          ))}
          {props.layout.startsWith("cl") ? (
            <p style={{ fontSize: "9.5px", color: "#5a6a85", margin: "6px 0 0" }}>
              {props.standingsFinalized
                ? "Die gelb markierten Plätze sind nach Abschluss der Ligaphase für die K.-o.-Runde qualifiziert."
                : "Gelb markierter Qualifikationsbereich: Die Mannschaften stehen erst nach vollständigem Abschluss der Ligaphase fest."}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Knockout */}
      {props.layout !== "bambini" && props.knockout.length > 0 ? (
        <section className="pdf-section pdf-knockout-section" style={{ marginTop: "16px" }}>
          <div className="pdf-knockout-schedule">
            <SectionHeading>Endrunden-Spielplan</SectionHeading>
            <ScheduleTable rows={props.knockoutSchedule} showResult showRound />
          </div>
          <div className="pdf-bracket-block">
            <SectionHeading>{props.knockoutTitle}</SectionHeading>
            <KnockoutBracket matches={props.knockout} />
          </div>
        </section>
      ) : null}

      <div className="pdf-document-footer" style={{ marginTop: "18px", borderTop: `1px solid ${BORDER}`, paddingTop: "6px", fontSize: "9px", color: "#7a88a0", display: "flex", justifyContent: "space-between" }}>
        <span>VfL Kirchheim/Teck · Tournament Hub</span>
        <span>{props.draft ? "Entwurf – noch nicht übernommen" : "Gespeicherter Spielplan"}</span>
      </div>
    </div>
  );
}
