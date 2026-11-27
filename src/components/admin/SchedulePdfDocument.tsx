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
  scheduleTitle: string;
  singleColumnMatches: PdfMatchRow[];
  timelineRows: Array<PdfTimelineRow<PdfMatchRow>> | null;
  fieldNames: string[];
  standings: Array<{ title: string; rows: PdfStandingRow[] }>;
  showStandings: boolean;
  knockoutTitle: string;
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

function ScheduleTable({ rows, showResult }: { rows: PdfMatchRow[]; showResult: boolean }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={{ ...th, width: "7%" }}>Nr.</th>
          <th style={{ ...th, width: "16%" }}>Anstoß</th>
          <th style={{ ...th, width: "12%" }}>Feld</th>
          <th style={th}>Team 1</th>
          <th style={th}>Team 2</th>
          {showResult ? <th style={{ ...th, width: "14%" }}>Ergebnis</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((match, index) => (
          <tr key={match.key} style={rowStyle(index)} data-match-key={match.key}>
            <td style={td}>{match.number}</td>
            <td style={td}>{match.time}</td>
            <td style={td}>{match.fieldName}</td>
            <td style={{ ...td, fontWeight: 600 }}>{match.homeName}</td>
            <td style={{ ...td, fontWeight: 600 }}>{match.awayName}</td>
            {showResult ? (
              <td style={td} data-match-result={match.result}>
                {match.result}
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
                  <span data-match-key={cell.match.key}>
                    <span style={{ color: BLUE, fontWeight: 700 }}>#{cell.match.number} </span>
                    {cell.match.homeName} – {cell.match.awayName}
                    {showResult ? (
                      <strong
                        data-match-result={cell.match.result}
                        style={{ marginLeft: "6px", color: NAVY, whiteSpace: "nowrap" }}
                      >
                        {cell.match.result}
                      </strong>
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
          <tr key={`${row.rank}-${row.teamName}`} style={rowStyle(index, row.qualified)}>
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
    <article className="pdf-bracket-match">
      <p className="pdf-bracket-meta">
        {match.time} · {match.fieldName}
      </p>
      <div className="pdf-bracket-team">{match.homeName}</div>
      <div className="pdf-bracket-team">{match.awayName}</div>
      {match.result !== "—" ? <strong className="pdf-bracket-result">{match.result}</strong> : null}
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
    <div>
      <div
        className="pdf-bracket"
        style={{ gridTemplateColumns: `repeat(${Math.max(mainRounds.length, 1)}, minmax(0, 1fr))` }}
      >
        {mainRounds.map((entry, roundIndex) => (
          <section className="pdf-bracket-round" key={entry.round}>
            <h3>{entry.matches[0]?.roundLabel}</h3>
            <div className="pdf-bracket-stack">
              {entry.matches.map((match) => (
                <div
                  className={roundIndex < mainRounds.length - 1 ? "pdf-bracket-connector" : undefined}
                  key={match.key}
                >
                  <BracketMatch match={match} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      {placementMatches.length > 0 ? (
        <div className="pdf-placement-grid">
          {placementMatches.map((match) => (
            <div key={match.key}>
              <h3>{match.roundLabel}</h3>
              <BracketMatch match={match} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Central, reusable schedule PDF document. All content is derived from the
 * tournament data passed in — nothing is hard-coded from the reference designs.
 * Print-optimised A4 landscape with paged-media headers and page counters.
 */
export function SchedulePdfDocument(props: SchedulePdfDocumentProps) {
  return (
    <div
      className="pdf-root"
      style={{ background: "white", color: "#13223d", fontFamily: "'Segoe UI', Arial, sans-serif" }}
    >
      <style>{`
        @page {
          size: A4 landscape;
          margin: 18mm 12mm 18mm;
          @top-left { content: "VfL Kirchheim/Teck · Tournament Hub"; color: ${NAVY}; font-size: 9px; font-weight: 700; }
          @top-right { content: "Offizieller Turnierspielplan"; color: ${BLUE}; font-size: 9px; }
          @bottom-left { content: "VfL Kirchheim/Teck"; color: #66758d; font-size: 8px; }
          @bottom-right { content: "Seite " counter(page) " / " counter(pages); color: #66758d; font-size: 8px; }
        }
        @media print { nav, header.app-chrome, button, .print\\:hidden { display: none !important; } body { background: white; } }
        .pdf-root section { break-inside: auto; }
        .pdf-root table { break-inside: auto; }
        .pdf-root tr, .pdf-root h2, .pdf-root h3 { break-inside: avoid; }
        .pdf-break { break-before: page; }
        .pdf-bracket { display: grid; gap: 22px; min-height: 148mm; }
        .pdf-bracket-round { display: flex; min-width: 0; flex-direction: column; }
        .pdf-bracket-round > h3, .pdf-placement-grid h3 { margin: 0 0 6px; color: ${NAVY}; font-size: 11px; text-transform: uppercase; }
        .pdf-bracket-stack { display: flex; flex: 1; flex-direction: column; justify-content: space-around; gap: 5px; }
        .pdf-bracket-connector { position: relative; break-inside: avoid; page-break-inside: avoid; }
        .pdf-bracket-connector::after { content: ""; position: absolute; top: 50%; right: -22px; width: 22px; border-top: 2px solid ${BLUE}; }
        .pdf-bracket-match { position: relative; break-inside: avoid; page-break-inside: avoid; border: 1px solid ${BORDER}; border-left: 4px solid ${YELLOW}; background: white; padding: 5px 7px; box-shadow: 0 1px 2px rgba(11,42,94,.08); }
        .pdf-bracket-meta { margin: 0 0 3px; color: #66758d; font-size: 8px; }
        .pdf-bracket-team { border-top: 1px solid #e5ebf4; padding: 3px 0; color: ${NAVY}; font-size: 9px; font-weight: 600; }
        .pdf-bracket-result { position: absolute; right: 7px; top: 5px; color: ${BLUE}; font-size: 9px; }
        .pdf-placement-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; margin-top: 12px; border-top: 2px solid ${YELLOW}; padding-top: 10px; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px", borderBottom: `3px solid ${YELLOW}`, paddingBottom: "10px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/vfl-logo-transparent.png" alt="VfL Kirchheim/Teck" width={56} height={56} style={{ objectFit: "contain" }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h1 style={{ color: NAVY, fontSize: "22px", fontWeight: 800, margin: 0 }}>{props.tournamentName}</h1>
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
        <p style={{ fontSize: "10.5px", color: "#3b485f", margin: "10px 0 0", lineHeight: 1.5 }}>{props.description}</p>
      ) : null}

      {/* Participants */}
      {props.participants.length > 0 ? (
        <section style={{ marginTop: "14px" }}>
          <SectionHeading>Teilnehmer ({props.participants.length})</SectionHeading>
          <ol style={{ columnCount: props.participants.length > 8 ? 2 : 1, columnGap: "24px", margin: 0, paddingLeft: "18px", fontSize: "10.5px" }}>
            {props.participants.map((name, index) => (
              <li key={`${name}-${index}`} style={{ breakInside: "avoid", padding: "1px 0" }}>
                {name}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* Schedule */}
      <section style={{ marginTop: "16px" }}>
        <SectionHeading>{props.scheduleTitle}</SectionHeading>
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
        <section className="pdf-break" style={{ marginTop: "16px" }}>
          <SectionHeading>{props.layout.startsWith("cl") ? "Gesamttabelle (Ligaphase)" : "Tabellen"}</SectionHeading>
          {props.standings.map((table) => (
            <div key={table.title} style={{ marginTop: "10px" }}>
              {props.standings.length > 1 || !props.layout.startsWith("cl") ? (
                <h3 style={{ color: NAVY, fontSize: "12px", fontWeight: 700, margin: "0 0 5px" }}>{table.title}</h3>
              ) : null}
              <StandingsTable rows={table.rows} />
            </div>
          ))}
          {props.layout.startsWith("cl") ? (
            <p style={{ fontSize: "9.5px", color: "#5a6a85", margin: "6px 0 0" }}>
              Champions-League-Modus: eine gemeinsame Ligaphase und Gesamttabelle. Markierte Plätze qualifizieren sich für die K.-o.-Runde.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Knockout */}
      {props.layout !== "bambini" && props.knockout.length > 0 ? (
        <section className="pdf-break" style={{ marginTop: "16px" }}>
          <SectionHeading>{props.knockoutTitle}</SectionHeading>
          <KnockoutBracket matches={props.knockout} />
        </section>
      ) : null}

      <div style={{ marginTop: "18px", borderTop: `1px solid ${BORDER}`, paddingTop: "6px", fontSize: "9px", color: "#7a88a0", display: "flex", justifyContent: "space-between" }}>
        <span>VfL Kirchheim/Teck · Tournament Hub</span>
        <span>{props.draft ? "Entwurf – noch nicht übernommen" : "Gespeicherter Spielplan"}</span>
      </div>
    </div>
  );
}
