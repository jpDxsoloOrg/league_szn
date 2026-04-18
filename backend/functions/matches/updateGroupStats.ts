import { getRepositories } from '../../lib/repositories';

interface UpdateGroupStatsInput {
  winners: string[];
  losers: string[];
  isDraw: boolean;
  participants: string[];
  teams?: string[][];
}

export async function updateGroupStats(input: UpdateGroupStatsInput): Promise<void> {
  const { winners, losers, isDraw, participants, teams } = input;

  if (participants.length === 0) return;

  const { players } = getRepositories();

  // 1. Fetch all participant Player records in parallel
  const playerPromises = participants.map((playerId) => players.findById(playerId));
  const playerResults = await Promise.all(playerPromises);

  const playerRecords = playerResults.filter(
    (p): p is NonNullable<typeof p> => p !== null
  );

  // 2. Update stable stats
  await updateStableStats(playerRecords, winners, losers, isDraw);

  // 3. Update tag team stats
  await updateTagTeamStats(playerRecords, winners, losers, isDraw, teams);
}

async function updateStableStats(
  playerRecords: Array<{ playerId: string; stableId?: string }>,
  winners: string[],
  losers: string[],
  isDraw: boolean
): Promise<void> {
  const { stables } = getRepositories();

  // Group participants by stableId
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
      patch[field] = (stable[field] || 0) + 1;

      await stables.update(stableId, patch);
    } catch (err) {
      console.warn(`Failed to update stable stats for ${stableId}:`, err);
    }
  }
}

async function updateTagTeamStats(
  playerRecords: Array<{ playerId: string; tagTeamId?: string }>,
  winners: string[],
  losers: string[],
  isDraw: boolean,
  teams?: string[][]
): Promise<void> {
  // Tag team stats only update when teams field is present (tag/multi-person matches)
  if (!teams || teams.length === 0) return;

  const { tagTeams } = getRepositories();

  // Collect unique tagTeamIds from participants
  const tagTeamIds = new Set<string>();
  for (const player of playerRecords) {
    if (player.tagTeamId) {
      tagTeamIds.add(player.tagTeamId);
    }
  }

  if (tagTeamIds.size === 0) return;

  // Fetch tag team records in parallel
  const tagTeamPromises = Array.from(tagTeamIds).map((tagTeamId) =>
    tagTeams.findById(tagTeamId)
  );
  const tagTeamResults = await Promise.all(tagTeamPromises);

  const participantSet = new Set(playerRecords.map((p) => p.playerId));
  const winnersSet = new Set(winners);
  const losersSet = new Set(losers);

  for (const tagTeam of tagTeamResults) {
    if (!tagTeam) continue;

    // Both members must be participants in this match
    if (!participantSet.has(tagTeam.player1Id) || !participantSet.has(tagTeam.player2Id)) {
      continue;
    }

    // Both members must be on the same team
    const sameTeam = teams.some(
      (team) => team.includes(tagTeam.player1Id) && team.includes(tagTeam.player2Id)
    );
    if (!sameTeam) continue;

    // Determine result for this tag team
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
      patch[field] = (tagTeam[field] || 0) + 1;

      await tagTeams.update(tagTeam.tagTeamId, patch);
    } catch (err) {
      console.warn(`Failed to update tag team stats for ${tagTeam.tagTeamId}:`, err);
    }
  }
}
