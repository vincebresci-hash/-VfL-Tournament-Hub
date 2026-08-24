import type { PublicTournament } from "@/types/tournament";

export function getDisplayCapacity(tournament: Pick<PublicTournament, "maxTeams" | "confirmedTeams">) {
  if (tournament.maxTeams == null || tournament.maxTeams < 1) {
    return null;
  }

  return {
    maxTeams: tournament.maxTeams,
    confirmedTeams: Math.max(0, tournament.confirmedTeams),
    availableSlots: Math.max(0, tournament.maxTeams - tournament.confirmedTeams),
  };
}

export function filledPublicInfo(
  tournament: PublicTournament,
): Array<{ key: string; label: string; value: string }> {
  const fields = [
    { key: "playFormat", label: "Spielmodus", value: tournament.playFormat },
    { key: "playingTime", label: "Spielzeit", value: tournament.playingTime },
    { key: "pitchFormat", label: "Feld- / Spielform", value: tournament.pitchFormat },
    { key: "entryFee", label: "Startgebühr", value: tournament.entryFee },
    { key: "travelInfo", label: "Anreise / Parken", value: tournament.travelInfo },
    { key: "changingRooms", label: "Umkleiden", value: tournament.changingRooms },
    { key: "catering", label: "Verpflegung", value: tournament.catering },
    { key: "teamInfo", label: "Hinweise für Mannschaften", value: tournament.teamInfo },
  ];

  return fields.flatMap((field) =>
    field.value
      ? [{ key: field.key, label: field.label, value: field.value }]
      : [],
  );
}
