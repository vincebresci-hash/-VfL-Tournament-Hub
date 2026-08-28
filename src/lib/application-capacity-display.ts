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
  statusLine: string;
};

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

  const participantLine = `${capacity.confirmedTeams} von ${capacity.maxTeams} Teams bestätigt`;

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

  const slotLabel = capacity.availableSlots === 1 ? "Platz" : "Plätze";

  return {
    heading: "Teilnehmer",
    participantLine,
    statusLine: `Noch ${capacity.availableSlots} ${slotLabel} frei`,
  };
}
