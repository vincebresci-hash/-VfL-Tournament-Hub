import type { TournamentStatus } from "@/types/tournament";

export type PublicApplicationState = "coming-soon" | "open" | "waitlist" | "closed";

export function getPublicApplicationState(input: {
  status: TournamentStatus;
  applicationsEnabled: boolean;
  applicationsOpen?: boolean;
  availableSlots: number;
  waitlistEnabled: boolean;
  isFull: boolean;
  applicationStart?: string | null;
  applicationDeadline?: string | null;
  now?: Date;
}): PublicApplicationState {
  const now = input.now ?? new Date();

  if (input.status === "coming-soon") {
    return "coming-soon";
  }

  if (!input.applicationsEnabled || input.applicationsOpen === false) {
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

  if (!input.isFull && input.availableSlots > 0) {
    return "open";
  }

  if (input.waitlistEnabled) {
    return "waitlist";
  }

  return "closed";
}

export const publicApplicationStateLabel: Record<PublicApplicationState, string> = {
  "coming-soon": "Demnächst bewerben",
  open: "Anmeldung offen",
  waitlist: "Turnier aktuell voll",
  closed: "Bewerbung geschlossen",
};
