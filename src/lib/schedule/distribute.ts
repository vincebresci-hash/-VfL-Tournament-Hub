export type DistributableTeam = {
  applicationId: string;
  categoryRank: number;
  internalStrength: number;
  selfRatedStrength: number;
};

export function categoryRank(category: string | null | undefined) {
  if (category === "S") return 4;
  if (category === "A") return 3;
  if (category === "B") return 2;
  if (category === "C") return 1;
  return 0;
}

export function compareTeamStrength(a: DistributableTeam, b: DistributableTeam) {
  return (
    b.categoryRank - a.categoryRank ||
    b.internalStrength - a.internalStrength ||
    b.selfRatedStrength - a.selfRatedStrength ||
    a.applicationId.localeCompare(b.applicationId)
  );
}

function snakeIndex(index: number, groupCount: number) {
  const round = Math.floor(index / groupCount);
  const position = index % groupCount;
  return round % 2 === 0 ? position : groupCount - 1 - position;
}

export function distributeTeams(
  teams: DistributableTeam[],
  groupCount: number,
  options?: { balanceStrength?: boolean },
) {
  if (groupCount < 1) {
    throw new Error("Es muss mindestens eine Gruppe gewählt werden.");
  }

  const groups: string[][] = Array.from({ length: groupCount }, () => []);
  if (teams.length === 0) {
    return groups;
  }

  const ordered = options?.balanceStrength
    ? [...teams].sort(compareTeamStrength)
    : [...teams].sort((a, b) => a.applicationId.localeCompare(b.applicationId));

  ordered.forEach((team, index) => {
    const groupIndex = options?.balanceStrength
      ? snakeIndex(index, groupCount)
      : index % groupCount;
    groups[groupIndex].push(team.applicationId);
  });

  return groups;
}

export function groupSizeSpread(groups: Array<{ length: number }>) {
  if (groups.length === 0) {
    return 0;
  }

  const sizes = groups.map((group) => group.length);
  return Math.max(...sizes) - Math.min(...sizes);
}
