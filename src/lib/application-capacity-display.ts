import type { PublicApplicationState } from "@/lib/public-application-state";
import { getDisplayCapacity } from "@/lib/public-tournament";

export type ApplicationCapacityDisplayInput = {
  maxTeams: number | null;
  confirmedTeams: number;
  applicationState: PublicApplicationState;
};

export type ApplicationCapacityDisplay = {
  heading: string;
  participantLine: string;
  statusLine: string | null;
};

/**
 * Public application capacity presentation.
 * Shows configured maximum only — never confirmed count or free places.
 */
export function getApplicationCapacityDisplay(
  input: ApplicationCapacityDisplayInput,
): ApplicationCapacityDisplay | null {
  const capacity = getDisplayCapacity({
    maxTeams: input.maxTeams,
    confirmedTeams: input.confirmedTeams,
  });

  if (!capacity) {
    return null;
  }

  const participantLine = `Max. ${capacity.maxTeams} Teams`;

  if (input.applicationState === "waitlist") {
    return {
      heading: "Teilnehmer",
      participantLine,
      statusLine: "Aktuell ausgebucht – Bewerbung für Warteliste möglich",
    };
  }

  if (capacity.availableSlots <= 0) {
    return {
      heading: "Teilnehmer",
      participantLine,
      statusLine: "Aktuell ausgebucht",
    };
  }

  return {
    heading: "Teilnehmer",
    participantLine,
    statusLine: null,
  };
}
