import { dynamoDb, TableNames } from '../../lib/dynamodb';

interface UpdateGroupStatsInput {
  winners: string[];
  losers: string[];
  isDraw: boolean;
  participants: string[];
  teams?: string[][];
}

interface PlayerRecord {
  playerId: string;
  stableId?: string;
  tagTeamId?: string;
}

interface TagTeamRecord {
  tagTeamId: string;
  player1Id: string;
  player2Id: string;
  status: string;
}

export async function updateGroupStats(input: UpdateGroupStatsInput): Promise<void> {
  const { winners, losers, isDraw, participants, teams } = input;

  if (participants.length === 0) return;

  // 1. Batch-get all participant Player records (parallel individual gets)
  const playerPromises = participants.map((playerId) =>
    dynamoDb.get({
      TableName: TableNames.PLAYERS,
      Key: { playerId },
      ProjectionExpression: 'playerId, stableId, tagTeamId',
    })
  );
  const playerResults = await Promise.all(playerPromises);

  const players: PlayerRecord[] = [];
  for (const result of playerResults) {
    if (result.Item) {
      players.push({
        playerId: result.Item.playerId as string,
        stableId: result.Item.stableId as string | undefined,
        tagTeamId: result.Item.tagTeamId as string | undefined,
      });
    }
  }

  // 2. Update stable stats
  await updateStableStats(players, winners, losers, isDraw);

  // 3. Update tag team stats
  await updateTagTeamStats(players, winners, losers, isDraw, teams);
}

async function updateStableStats(
  players: PlayerRecord[],
  winners: string[],
  losers: string[],
  isDraw: boolean
): Promise<void> {
  // Group participants by stableId
  const stableMembers = new Map<string, string[]>();
  for (const player of players) {
    if (!player.stableId) continue;
    const existing = stableMembers.get(player.stableId) || [];
    existing.push(player.playerId);
    stableMembers.set(player.stableId, existing);
  }

  const winnersSet = new Set(winners);
  const losersSet = new Set(losers);
  const now = new Date().toISOString();

  for (const [stableId, memberIds] of stableMembers) {
    let field: string | null = null;

    if (isDraw) {
      field = 'draws';
    } else if (memberIds.some((id) => winnersSet.has(id))) {
      field = 'wins';
    } else if (memberIds.some((id) => losersSet.has(id))) {
      field = 'losses';
    }

    if (!field) continue;

    try {
      await dynamoDb.update({
        TableName: TableNames.STABLES,
        Key: { stableId },
        UpdateExpression: `SET ${field} = if_not_exists(${field}, :zero) + :one, updatedAt = :now`,
        ExpressionAttributeValues: { ':one': 1, ':zero': 0, ':now': now },
      });
    } catch (err) {
      console.warn(`Failed to update stable stats for ${stableId}:`, err);
    }
  }
}

async function updateTagTeamStats(
  players: PlayerRecord[],
  winners: string[],
  losers: string[],
  isDraw: boolean,
  teams?: string[][]
): Promise<void> {
  // Tag team stats only update when teams field is present (tag/multi-person matches)
  if (!teams || teams.length === 0) return;

  // Collect unique tagTeamIds from participants
  const tagTeamIds = new Set<string>();
  for (const player of players) {
    if (player.tagTeamId) {
      tagTeamIds.add(player.tagTeamId);
    }
  }

  if (tagTeamIds.size === 0) return;

  // Fetch tag team records in parallel
  const tagTeamPromises = Array.from(tagTeamIds).map((tagTeamId) =>
    dynamoDb.get({
      TableName: TableNames.TAG_TEAMS,
      Key: { tagTeamId },
      ProjectionExpression: 'tagTeamId, player1Id, player2Id, #s',
      ExpressionAttributeNames: { '#s': 'status' },
    })
  );
  const tagTeamResults = await Promise.all(tagTeamPromises);

  const participantSet = new Set(players.map((p) => p.playerId));
  const winnersSet = new Set(winners);
  const losersSet = new Set(losers);
  const now = new Date().toISOString();

  for (const result of tagTeamResults) {
    if (!result.Item) continue;

    const tagTeam: TagTeamRecord = {
      tagTeamId: result.Item.tagTeamId as string,
      player1Id: result.Item.player1Id as string,
      player2Id: result.Item.player2Id as string,
      status: result.Item.status as string,
    };

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
    let field: string | null = null;

    if (isDraw) {
      field = 'draws';
    } else if (winnersSet.has(tagTeam.player1Id) && winnersSet.has(tagTeam.player2Id)) {
      field = 'wins';
    } else if (losersSet.has(tagTeam.player1Id) && losersSet.has(tagTeam.player2Id)) {
      field = 'losses';
    }

    if (!field) continue;

    try {
      await dynamoDb.update({
        TableName: TableNames.TAG_TEAMS,
        Key: { tagTeamId: tagTeam.tagTeamId },
        UpdateExpression: `SET ${field} = if_not_exists(${field}, :zero) + :one, updatedAt = :now`,
        ExpressionAttributeValues: { ':one': 1, ':zero': 0, ':now': now },
      });
    } catch (err) {
      console.warn(`Failed to update tag team stats for ${tagTeam.tagTeamId}:`, err);
    }
  }
}
