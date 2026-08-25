import type { TournamentStatus } from "@/types/tournament";

export type PublicApplicationState = "coming-soon" | "open" | "waitlist" | "closed";

export type PublicApplicationGateInput = {
  status: TournamentStatus;
  applicationsEnabled: boolean;
  applicationsOpen?: boolean;
  archivedAt?: string | null;
  availableSlots: number;
  waitlistEnabled: boolean;
  isFull: boolean;
  applicationStart?: string | null;
  applicationDeadline?: string | null;
  maxTeams?: number | null;
  now?: Date;
};

export function getPublicApplicationState(
  input: PublicApplicationGateInput,
): PublicApplicationState {
  const now = input.now ?? new Date();

  if (!input.applicationsEnabled || input.applicationsOpen === false) {
    return "closed";
  }

  if (input.archivedAt) {
    return "closed";
  }

  if (input.status === "completed") {
    return "closed";
  }

  if (input.applicationStart && now < new Date(input.applicationStart)) {
    return "coming-soon";
  }

  if (input.applicationDeadline && now > new Date(input.applicationDeadline)) {
    return "closed";
  }

  if (input.maxTeams === null) {
    return "open";
  }

  if (!input.isFull && input.availableSlots > 0) {
    return "open";
  }

  if (input.waitlistEnabled) {
    return "waitlist";
  }

  return "closed";
}

export function isPublicApplicationAllowed(input: PublicApplicationGateInput) {
  const state = getPublicApplicationState(input);
  return state === "open" || state === "waitlist";
}

export const publicApplicationStateLabel: Record<PublicApplicationState, string> = {
  "coming-soon": "Demnächst bewerben",
  open: "Anmeldung offen",
  waitlist: "Turnier aktuell voll",
  closed: "Bewerbung geschlossen",
};

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function baseGate(
  overrides: Partial<PublicApplicationGateInput> = {},
): PublicApplicationGateInput {
  const now = new Date("2026-08-20T18:00:00.000Z");

  return {
    status: "active",
    applicationsEnabled: true,
    applicationsOpen: true,
    archivedAt: null,
    availableSlots: 4,
    waitlistEnabled: false,
    isFull: false,
    applicationStart: "2026-08-01T00:00:00.000Z",
    applicationDeadline: "2026-08-30T21:59:59.000Z",
    now,
    ...overrides,
  };
}

export function runApplicationWindowSelfChecks() {
  assert(
    isPublicApplicationAllowed(baseGate()) &&
      getPublicApplicationState(baseGate()) === "open",
    "active + offen + innerhalb Frist muss erlaubt sein",
  );
  assert(
    !isPublicApplicationAllowed(baseGate({ status: "completed" })),
    "completed muss blockiert sein",
  );
  assert(
    !isPublicApplicationAllowed(
      baseGate({ archivedAt: "2026-08-19T12:00:00.000Z" }),
    ),
    "archiviert muss blockiert sein",
  );
  assert(
    !isPublicApplicationAllowed(baseGate({ applicationsOpen: false })),
    "applications_open=false muss blockiert sein",
  );
  assert(
    !isPublicApplicationAllowed(
      baseGate({ applicationStart: "2026-08-21T00:00:00.000Z" }),
    ) &&
      getPublicApplicationState(
        baseGate({ applicationStart: "2026-08-21T00:00:00.000Z" }),
      ) === "coming-soon",
    "vor application_start muss blockiert sein",
  );
  assert(
    !isPublicApplicationAllowed(
      baseGate({ applicationDeadline: "2026-08-19T21:59:59.000Z" }),
    ),
    "nach application_deadline muss blockiert sein",
  );
  assert(
    !isPublicApplicationAllowed(
      baseGate({ isFull: true, availableSlots: 0, waitlistEnabled: false }),
    ),
    "voll ohne Warteliste muss blockiert sein",
  );
  assert(
    isPublicApplicationAllowed(
      baseGate({ isFull: true, availableSlots: 0, waitlistEnabled: true }),
    ) &&
      getPublicApplicationState(
        baseGate({ isFull: true, availableSlots: 0, waitlistEnabled: true }),
      ) === "waitlist",
    "voll mit Warteliste muss erlaubt sein",
  );
  assert(
    !isPublicApplicationAllowed(baseGate({ applicationsEnabled: false })),
    "applications_enabled=false muss blockiert sein",
  );
  assert(
    getPublicApplicationState(
      baseGate({ maxTeams: null, availableSlots: 0, isFull: false }),
    ) === "open",
    "ohne max_teams darf keine erfundene Kapazität die Bewerbung schließen",
  );

  // AUDIT-002: when occupancy says full, waitlist gate must still follow existing rules.
  assert(
    isPublicApplicationAllowed(
      baseGate({
        isFull: true,
        availableSlots: 0,
        waitlistEnabled: true,
        maxTeams: 16,
      }),
    ),
    "K: voll mit Warteliste bleibt erlaubt",
  );
  assert(
    !isPublicApplicationAllowed(
      baseGate({
        isFull: true,
        availableSlots: 0,
        waitlistEnabled: false,
        maxTeams: 16,
      }),
    ),
    "K: voll ohne Warteliste bleibt blockiert",
  );

  return "ok";
}
