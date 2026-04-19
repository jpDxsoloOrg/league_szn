import { getRepositories } from '../../lib/repositories';

interface RevertGroupStatsInput {
  winners: string[];
  losers: string[];
  isDraw: boolean;
  participants: string[];
  teams?: string[][];
}

export async function revertGroupStats(input: RevertGroupStatsInput): Promise<void> {
  const { winners, losers, isDraw, participants, teams } = input;

  if (participants.length === 0) return;

  const { roster: { players } } = getRepositories();

  // Fetch all participant Player records in parallel
  const playerPromises = participants.map((playerId) => players.findById(playerId));
  const playerResults = await Promise.all(playerPromises);

  const playerRecords = playerResults.filter(
    (p): p is NonNullable<typeof p> => p !== null
  );

  await revertStableStats(playerRecords, winners, losers, isDraw);
  await revertTagTeamStats(playerRecords, winners, losers, isDraw, teams);
}

async function revertStableStats(
  playerRecords: Array<{ playerId: string; stableId?: string }>,
  winners: string[],
  losers: string[],
  isDraw: boolean
): Promise<void> {
  const { roster: { stables } } = getRepositories();

  const stableMembers = new Map<string, string[]>();
  for (const player of playerRecords) {
    if (!player.stableId) continue;
    const existing = stableMembers.get(player.stableId) || [];
    existing.push(player.playerId);
    stableMembers.set(player.stableId, existing);
  }

  const winnersSet = new Set(winners);
  const losersSet = new Set(losers);

  for (const [stableId, memberIds] of stableMembers) {
    let field: 'wins' | 'losses' | 'draws' | null = null;

    if (isDraw) {
      field = 'draws';
    } else if (memberIds.some((id) => winnersSet.has(id))) {
      field = 'wins';
    } else if (memberIds.some((id) => losersSet.has(id))) {
      field = 'losses';
    }

    if (!field) continue;

    try {
      const stable = await stables.findById(stableId);
      if (!stable) continue;

      const patch: Record<string, number> = {};
      patch[field] = Math.max((stable[field] || 0) - 1, 0);

      await stables.update(stableId, patch);
    } catch (err) {
      console.warn(`Failed to revert stable stats for ${stableId}:`, err);
    }
  }
}

async function revertTagTeamStats(
  playerRecords: Array<{ playerId: string; tagTeamId?: string }>,
  winners: string[],
  losers: string[],
  isDraw: boolean,
  teams?: string[][]
): Promise<void> {
  if (!teams || teams.length === 0) return;

  const { roster: { tagTeams } } = getRepositories();

  const tagTeamIds = new Set<string>();
  for (const player of playerRecords) {
    if (player.tagTeamId) {
      tagTeamIds.add(player.tagTeamId);
    }
  }

  if (tagTeamIds.size === 0) return;

  const tagTeamPromises = Array.from(tagTeamIds).map((tagTeamId) =>
    tagTeams.findById(tagTeamId)
  );
  const tagTeamResults = await Promise.all(tagTeamPromises);

  const participantSet = new Set(playerRecords.map((p) => p.playerId));
  const winnersSet = new Set(winners);
  const losersSet = new Set(losers);

  for (const tagTeam of tagTeamResults) {
    if (!tagTeam) continue;

    if (!participantSet.has(tagTeam.player1Id) || !participantSet.has(tagTeam.player2Id)) {
      continue;
    }

    const sameTeam = teams.some(
      (team) => team.includes(tagTeam.player1Id) && team.includes(tagTeam.player2Id)
    );
    if (!sameTeam) continue;

    let field: 'wins' | 'losses' | 'draws' | null = null;

    if (isDraw) {
      field = 'draws';
    } else if (winnersSet.has(tagTeam.player1Id) && winnersSet.has(tagTeam.player2Id)) {
      field = 'wins';
    } else if (losersSet.has(tagTeam.player1Id) && losersSet.has(tagTeam.player2Id)) {
      field = 'losses';
    }

    if (!field) continue;

    try {
      const patch: Record<string, number> = {};
      patch[field] = Math.max((tagTeam[field] || 0) - 1, 0);

      await tagTeams.update(tagTeam.tagTeamId, patch);
    } catch (err) {
      console.warn(`Failed to revert tag team stats for ${tagTeam.tagTeamId}:`, err);
    }
  }
}
