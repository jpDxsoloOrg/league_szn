interface TagTeamPair {
  player1Id: string;
  player2Id: string;
}

/**
 * The tag team a booked side is, if any: the side must be exactly the team's
 * two members, in either order. A side of one, three or more is never a team.
 */
export function findTagTeamForSide<T extends TagTeamPair>(
  tagTeams: readonly T[],
  side: readonly string[] | undefined,
): T | undefined {
  if (!side || side.length !== 2) return undefined;
  const [firstId, secondId] = side;
  return tagTeams.find(
    (team) => (team.player1Id === firstId && team.player2Id === secondId)
      || (team.player1Id === secondId && team.player2Id === firstId),
  );
}
