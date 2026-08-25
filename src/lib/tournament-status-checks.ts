import { readFileSync } from "node:fs";
import { join } from "node:path";
import { countConfirmedParticipants } from "@/lib/mein-turnierplan-participants";
import {
  getEffectiveTournamentStatus,
  getSuggestedTournamentStatusFromCapacity,
  getTournamentStatusCapacityWarning,
} from "@/lib/tournament-status";
import {
  getPublicApplicationState,
  publicApplicationStateLabel,
} from "@/lib/public-application-state";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

export function runTournamentStatusCapacityChecks() {
  // A) status=full, 0/16 => public NOT full + admin warning
  assert(
    getEffectiveTournamentStatus({
      dbStatus: "full",
      maxTeams: 16,
      confirmedParticipants: 0,
    }) === "active",
    "A: full DB with 0/16 demotes publicly",
  );
  assert(
    Boolean(
      getTournamentStatusCapacityWarning({
        dbStatus: "full",
        maxTeams: 16,
        confirmedParticipants: 0,
      }),
    ),
    "A: admin warning when DB full but free slots",
  );

  // B) status=active, 16/16 => public full + admin warning
  assert(
    getEffectiveTournamentStatus({
      dbStatus: "active",
      maxTeams: 16,
      confirmedParticipants: 16,
    }) === "full",
    "B: active DB with 16/16 is publicly full",
  );
  assert(
    Boolean(
      getTournamentStatusCapacityWarning({
        dbStatus: "active",
        maxTeams: 16,
        confirmedParticipants: 16,
      }),
    ),
    "B: admin warning when capacity full but DB not full",
  );

  // C) status=full, 16/16 => full, no warning
  assert(
    getEffectiveTournamentStatus({
      dbStatus: "full",
      maxTeams: 16,
      confirmedParticipants: 16,
    }) === "full",
    "C: aligned full",
  );
  assert(
    getTournamentStatusCapacityWarning({
      dbStatus: "full",
      maxTeams: 16,
      confirmedParticipants: 16,
    }) === null,
    "C: no warning when aligned",
  );

  // D) completed wins
  assert(
    getEffectiveTournamentStatus({
      dbStatus: "completed",
      maxTeams: 16,
      confirmedParticipants: 16,
    }) === "completed",
    "D: completed wins over capacity full",
  );
  assert(
    getTournamentStatusCapacityWarning({
      dbStatus: "completed",
      maxTeams: 16,
      confirmedParticipants: 16,
    }) === null,
    "D: no capacity warning for completed",
  );

  // E) active 15/16
  assert(
    getEffectiveTournamentStatus({
      dbStatus: "active",
      maxTeams: 16,
      confirmedParticipants: 15,
    }) === "active",
    "E: 15/16 stays active",
  );

  // F) max_teams NULL => no automatic full
  assert(
    getEffectiveTournamentStatus({
      dbStatus: "active",
      maxTeams: null,
      confirmedParticipants: 100,
    }) === "active",
    "F: null max does not force full",
  );
  assert(
    getEffectiveTournamentStatus({
      dbStatus: "full",
      maxTeams: null,
      confirmedParticipants: 0,
    }) === "full",
    "F: null max keeps DB full (no occupancy override)",
  );
  assert(
    getTournamentStatusCapacityWarning({
      dbStatus: "full",
      maxTeams: null,
      confirmedParticipants: 0,
    }) === null,
    "F: no warning without max_teams",
  );

  // G) 16/16 + waitlist => full badge + waitlist application state
  assert(
    getEffectiveTournamentStatus({
      dbStatus: "active",
      maxTeams: 16,
      confirmedParticipants: 16,
    }) === "full",
    "G: capacity full shows full",
  );
  assert(
    getPublicApplicationState({
      status: "active",
      applicationsEnabled: true,
      applicationsOpen: true,
      archivedAt: null,
      availableSlots: 0,
      waitlistEnabled: true,
      isFull: true,
      maxTeams: 16,
    }) === "waitlist",
    "G: waitlist application state separate",
  );
  assert(
    publicApplicationStateLabel.waitlist.toLowerCase().includes("voll") ||
      publicApplicationStateLabel.waitlist.length > 0,
    "G: waitlist label present",
  );

  // H/I) confirmed externals via shared counter
  const withExternals = countConfirmedParticipants({
    acceptedApplicationIds: Array.from({ length: 8 }, (_, i) => `a${i}`),
    externalTeams: Array.from({ length: 8 }, () => ({
      participationStatus: "confirmed",
      externalActive: true,
      applicationId: null,
    })),
  });
  assert(withExternals === 16, "H: externals count toward full");
  assert(
    getEffectiveTournamentStatus({
      dbStatus: "active",
      maxTeams: 16,
      confirmedParticipants: withExternals,
    }) === "full",
    "H: effective full with externals",
  );

  const mapped = countConfirmedParticipants({
    acceptedApplicationIds: ["app-1", ...Array.from({ length: 15 }, (_, i) => `a${i}`)],
    externalTeams: [
      {
        participationStatus: "confirmed",
        externalActive: true,
        applicationId: "app-1",
      },
    ],
  });
  assert(mapped === 16, "I: mapped external not double-counted");
  assert(
    getEffectiveTournamentStatus({
      dbStatus: "coming-soon",
      maxTeams: 16,
      confirmedParticipants: mapped,
    }) === "full",
    "I: mapped occupancy still drives full",
  );

  assert(
    getSuggestedTournamentStatusFromCapacity({
      dbStatus: "full",
      maxTeams: 16,
      confirmedParticipants: 0,
    }) === "active",
    "suggest demotes stale full",
  );
  assert(
    getSuggestedTournamentStatusFromCapacity({
      dbStatus: "active",
      maxTeams: 16,
      confirmedParticipants: 16,
    }) === "full",
    "suggest promotes to full",
  );

  const statusSource = readFileSync(
    join(process.cwd(), "src/lib/tournament-status.ts"),
    "utf8",
  );
  assert(statusSource.includes("getEffectiveTournamentStatus"), "helper exported");
  assert(statusSource.includes("getTournamentStatusCapacityWarning"), "warning helper");

  return "ok";
}
