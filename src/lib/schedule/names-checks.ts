import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hasDistinctTeamName, publicTeamLabel } from "@/lib/schedule/names";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

export function runPublicTeamLabelChecks() {
  assert(
    publicTeamLabel("VfL Kirchheim", "VfL Kirchheim") === "VfL Kirchheim",
    "same club/team => once",
  );
  assert(
    publicTeamLabel("vfl kirchheim", "VfL Kirchheim") === "vfl kirchheim",
    "case-insensitive same => once (prefer club casing)",
  );
  assert(
    publicTeamLabel("VfL Kirchheim", "VfL Kirchheim II") === "VfL Kirchheim · VfL Kirchheim II",
    "distinct team suffix kept",
  );
  assert(publicTeamLabel(null, "U10") === "U10", "missing club => team");
  assert(publicTeamLabel("SV Fellbach", null) === "SV Fellbach", "missing team => club");
  assert(publicTeamLabel("  ", "  ") === "Team", "blank => Team");
  assert(publicTeamLabel("", "") === "Team", "empty => Team");
  assert(
    publicTeamLabel("VfL Kirchheim", "  VfL Kirchheim  ") === "VfL Kirchheim",
    "trim before compare",
  );

  const longTeam =
    "TSV Sehr Langer Vereinsname mit vielen Zusätzen und Extra-Bezeichnungen II";
  const longLabel = publicTeamLabel("TSV Kurz", longTeam);
  assert(longLabel.includes("TSV Kurz"), "long team keeps club");
  assert(longLabel.includes(longTeam), "long team kept");
  assert(longLabel.includes(" · "), "long distinct uses separator");

  assert(hasDistinctTeamName("VfL Kirchheim", "VfL Kirchheim") === false, "distinct false when same");
  assert(hasDistinctTeamName("VfL Kirchheim", "VfL Kirchheim II") === true, "distinct true when different");
  assert(hasDistinctTeamName("VfL Kirchheim", "") === false, "no team => not distinct line");
  assert(hasDistinctTeamName("", "U10") === true, "team only => show team line");

  return "ok";
}

export function runLiveMatchLayoutChecks() {
  const liveView = readFileSync(join(process.cwd(), "src/components/live/LivePageView.tsx"), "utf8");
  assert(liveView.includes("LiveMatchCard"), "LiveMatchCard used on live page");
  assert(!liveView.includes("grid-cols-[1fr_auto_1fr]"), "old always-on 3-col mobile grid removed");

  const matchCard = readFileSync(join(process.cwd(), "src/components/live/LiveMatchCard.tsx"), "utf8");
  assert(matchCard.includes("sm:hidden"), "mobile stacked layout branch");
  assert(matchCard.includes("sm:grid") || matchCard.includes("hidden") && matchCard.includes("sm:grid"), "desktop grid layout");
  assert(matchCard.includes("min-w-0"), "flex/grid children allow shrink");
  assert(
    matchCard.includes("break-words") || matchCard.includes("line-clamp"),
    "long names wrap or clamp",
  );

  const namesSource = readFileSync(join(process.cwd(), "src/lib/schedule/names.ts"), "utf8");
  assert(namesSource.includes("toLowerCase()"), "label compare is case-insensitive");
  assert(namesSource.includes("publicTeamLabel"), "publicTeamLabel helper present");

  const liveQueries = readFileSync(join(process.cwd(), "src/lib/db/live-queries.ts"), "utf8");
  assert(liveQueries.includes("publicTeamLabel"), "live labels use publicTeamLabel");

  const slugPage = readFileSync(join(process.cwd(), "src/app/turniere/[slug]/page.tsx"), "utf8");
  assert(slugPage.includes("publicTeamLabel"), "tournament detail roster uses publicTeamLabel");

  return "ok";
}
