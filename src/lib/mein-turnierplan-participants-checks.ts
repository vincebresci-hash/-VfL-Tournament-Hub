import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canAcceptApplicationIntoCapacity,
  canConfirmExternalTeams,
  countConfirmedParticipants,
  countConfirmedParticipantsAfterAcceptingApplication,
  countDetectedExternalTeams,
  getTournamentCapacityWithExternal,
  guestCapacityAllowsApplication,
} from "@/lib/mein-turnierplan-participants";
import {
  getPublicApplicationState,
  isPublicApplicationAllowed,
} from "@/lib/public-application-state";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function ids(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`);
}

function confirmedExternals(count: number, overrides: Partial<{
  participationStatus: string;
  externalActive: boolean | null;
  applicationId: string | null;
}> = {}) {
  return Array.from({ length: count }, () => ({
    participationStatus: overrides.participationStatus ?? "confirmed",
    externalActive: overrides.externalActive ?? true,
    applicationId: overrides.applicationId ?? null,
  }));
}

export function runMeinTurnierplanParticipantCountChecks() {
  // Legacy coverage kept
  assert(
    countConfirmedParticipants({
      acceptedApplicationIds: [],
      externalTeams: confirmedExternals(18),
    }) === 18,
    "legacy A: 18 confirmed external",
  );

  // A) 16 accepted / 0 external => full
  const caseA = countConfirmedParticipants({
    acceptedApplicationIds: ids("app", 16),
    externalTeams: [],
  });
  assert(caseA === 16, "A: 16 accepted => 16");
  assert(
    getTournamentCapacityWithExternal({
      maxTeams: 16,
      applicationStatuses: Array.from({ length: 16 }, () => "accepted"),
      acceptedApplicationIds: ids("app", 16),
      externalTeams: [],
    }).isFull,
    "A: capacity full",
  );

  // B) 8 accepted / 8 confirmed external => full
  const caseB = countConfirmedParticipants({
    acceptedApplicationIds: ids("app", 8),
    externalTeams: confirmedExternals(8),
  });
  assert(caseB === 16, "B: 8+8 => 16 full");

  // C) 8 accepted / 7 confirmed external => 15/16
  const caseC = countConfirmedParticipants({
    acceptedApplicationIds: ids("app", 8),
    externalTeams: confirmedExternals(7),
  });
  assert(caseC === 15, "C: 8+7 => 15");
  assert(
    getTournamentCapacityWithExternal({
      maxTeams: 16,
      applicationStatuses: Array.from({ length: 8 }, () => "accepted"),
      acceptedApplicationIds: ids("app", 8),
      externalTeams: confirmedExternals(7),
    }).availableSlots === 1,
    "C: one slot left",
  );

  // D) detected externals do not count
  assert(
    countConfirmedParticipants({
      acceptedApplicationIds: ids("app", 8),
      externalTeams: confirmedExternals(8, { participationStatus: "detected" }),
    }) === 8,
    "D: detected ignored",
  );

  // E) rejected externals do not count
  assert(
    countConfirmedParticipants({
      acceptedApplicationIds: ids("app", 8),
      externalTeams: confirmedExternals(8, { participationStatus: "rejected" }),
    }) === 8,
    "E: rejected ignored",
  );

  // F) inactive confirmed externals do not count
  assert(
    countConfirmedParticipants({
      acceptedApplicationIds: ids("app", 8),
      externalTeams: confirmedExternals(8, { externalActive: false }),
    }) === 8,
    "F: inactive ignored",
  );

  // G) mapped accepted + confirmed external => once
  assert(
    countConfirmedParticipants({
      acceptedApplicationIds: ["app-1"],
      externalTeams: [
        {
          participationStatus: "confirmed",
          externalActive: true,
          applicationId: "app-1",
        },
      ],
    }) === 1,
    "G: mapped pair counted once",
  );

  // H) admin accept blocked at 16/16
  const blocked = canAcceptApplicationIntoCapacity({
    maxTeams: 16,
    acceptedApplicationIds: ids("app", 16),
    externalTeams: [],
    applicationIdToAccept: "app-new",
  });
  assert(!blocked.ok, "H: accept blocked at 16/16");
  assert(
    !blocked.ok && blocked.error.includes("vollständig belegt"),
    "H: clear admin error",
  );

  // Also: 8 accepted + 8 confirmed external blocks another accept
  const blockedMixed = canAcceptApplicationIntoCapacity({
    maxTeams: 16,
    acceptedApplicationIds: ids("app", 8),
    externalTeams: confirmedExternals(8),
    applicationIdToAccept: "app-new",
  });
  assert(!blockedMixed.ok, "H: 8+8 blocks further accept");

  // I) 15/16 + new application => accept ok => 16
  const acceptOk = canAcceptApplicationIntoCapacity({
    maxTeams: 16,
    acceptedApplicationIds: ids("app", 15),
    externalTeams: [],
    applicationIdToAccept: "app-16",
  });
  assert(acceptOk.ok && acceptOk.projected === 16, "I: 15+1 => 16 allowed");

  // J) mapping special case: 15 others + confirmed external mapped to app-being-accepted
  const mappedAccept = canAcceptApplicationIntoCapacity({
    maxTeams: 16,
    acceptedApplicationIds: ids("other", 15),
    externalTeams: [
      {
        participationStatus: "confirmed",
        externalActive: true,
        applicationId: "app-mapped",
      },
    ],
    applicationIdToAccept: "app-mapped",
  });
  assert(mappedAccept.ok, "J: mapped accept must be allowed");
  assert(mappedAccept.projected === 16, "J: end state 16/16");
  assert(
    countConfirmedParticipants({
      acceptedApplicationIds: ids("other", 15),
      externalTeams: [
        {
          participationStatus: "confirmed",
          externalActive: true,
          applicationId: "app-mapped",
        },
      ],
    }) === 16,
    "J: before accept already 16 via external slot",
  );
  assert(
    countConfirmedParticipantsAfterAcceptingApplication({
      acceptedApplicationIds: ids("other", 15),
      externalTeams: [
        {
          participationStatus: "confirmed",
          externalActive: true,
          applicationId: "app-mapped",
        },
      ],
      applicationIdToAccept: "app-mapped",
    }) === 16,
    "J: after accept still 16 (external deduped)",
  );

  // K) guest capacity at full => waitlist rule
  assert(
    guestCapacityAllowsApplication({
      maxTeams: 16,
      confirmedParticipants: 16,
      tournamentWaitlistEnabled: true,
      globalWaitlistEnabled: true,
    }).reason === "waitlist",
    "K: full + waitlist allowed",
  );
  assert(
    !guestCapacityAllowsApplication({
      maxTeams: 16,
      confirmedParticipants: 16,
      tournamentWaitlistEnabled: false,
      globalWaitlistEnabled: true,
    }).allowed,
    "K: full without tournament waitlist blocked",
  );
  assert(
    isPublicApplicationAllowed({
      status: "active",
      applicationsEnabled: true,
      applicationsOpen: true,
      archivedAt: null,
      availableSlots: 0,
      waitlistEnabled: true,
      isFull: true,
      maxTeams: 16,
    }) &&
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
    "K: public waitlist state preserved",
  );
  assert(
    guestCapacityAllowsApplication({
      maxTeams: 16,
      confirmedParticipants: 15,
      tournamentWaitlistEnabled: false,
      globalWaitlistEnabled: false,
    }).reason === "has-slots",
    "K: under capacity still open",
  );

  // Confirm gate regression
  const capacityGate = canConfirmExternalTeams({
    maxTeams: 18,
    currentConfirmedCount: 17,
    acceptedApplicationIds: [],
    teamsToConfirm: Array.from({ length: 5 }, () => ({
      participationStatus: "detected",
      externalActive: true,
      applicationId: null,
    })),
  });
  assert(!capacityGate.ok, "confirm gate still blocks overflow");
  assert(
    countDetectedExternalTeams(confirmedExternals(1, { participationStatus: "detected" })) === 1,
    "detected helper still works",
  );

  // Migration asserts: guest gate uses occupancy semantics; old apps-only path replaced.
  const guestCapacityMigration = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260825190000_guest_application_capacity_parity.sql",
    ),
    "utf8",
  );
  assert(
    guestCapacityMigration.includes("guest_application_allowed"),
    "migration updates guest_application_allowed",
  );
  assert(
    guestCapacityMigration.includes("participation_status = 'confirmed'"),
    "migration counts confirmed externals",
  );
  assert(
    guestCapacityMigration.includes("external_active = true"),
    "migration requires external_active",
  );
  assert(
    guestCapacityMigration.includes("application_id"),
    "migration dedupes mapped application_id",
  );
  assert(
    guestCapacityMigration.includes("waitlist_enabled"),
    "migration keeps waitlist branch",
  );

  const occupancyMigration = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260825140000_external_team_participation_status.sql",
    ),
    "utf8",
  );
  assert(
    occupancyMigration.includes("participation_status = 'confirmed'"),
    "occupancy migration left untouched and still defines confirmed externals",
  );

  const adminActions = readFileSync(
    join(process.cwd(), "src/lib/db/admin-actions.ts"),
    "utf8",
  );
  assert(
    adminActions.includes("canAcceptApplicationIntoCapacity"),
    "admin accept uses shared capacity helper",
  );
  assert(
    !adminActions.includes("TURNIER AUSGEBUCHT"),
    "legacy apps-only accept error removed",
  );

  return "ok";
}
