const BYE = "__bye__";

export type RoundRobinFixture = {
  homeId: string;
  awayId: string;
};

export function roundRobinFixtures(teamIds: string[]): RoundRobinFixture[] {
  const unique = [...new Set(teamIds.filter(Boolean))];
  if (unique.length < 2) {
    return [];
  }

  const teams = [...unique];
  if (teams.length % 2 === 1) {
    teams.push(BYE);
  }

  const n = teams.length;
  const rounds = n - 1;
  const half = n / 2;
  let circle = [...teams];
  const fixtures: RoundRobinFixture[] = [];

  for (let round = 0; round < rounds; round += 1) {
    for (let index = 0; index < half; index += 1) {
      const home = circle[index];
      const away = circle[n - 1 - index];
      if (!home || !away || home === BYE || away === BYE) {
        continue;
      }

      if (round % 2 === 0) {
        fixtures.push({ homeId: home, awayId: away });
      } else {
        fixtures.push({ homeId: away, awayId: home });
      }
    }

    const [fixed, ...rest] = circle;
    const last = rest.pop();
    if (!fixed || last === undefined) {
      break;
    }
    circle = [fixed, last, ...rest];
  }

  return fixtures;
}

export function expectedGroupMatchCount(teamCount: number) {
  if (teamCount < 2) {
    return 0;
  }

  return (teamCount * (teamCount - 1)) / 2;
}

export function hasSelfPlay(fixtures: RoundRobinFixture[]) {
  return fixtures.some((fixture) => fixture.homeId === fixture.awayId);
}

export function interleaveGroupFixtures<T extends { groupId: string }>(grouped: T[][]) {
  const queues = grouped.map((items) => [...items]);
  const result: T[] = [];
  let added = true;

  while (added) {
    added = false;
    for (const queue of queues) {
      const next = queue.shift();
      if (next) {
        result.push(next);
        added = true;
      }
    }
  }

  return result;
}
