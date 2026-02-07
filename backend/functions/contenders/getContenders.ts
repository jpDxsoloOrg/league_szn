import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';

interface ContenderRanking {
  championshipId: string;
  playerId: string;
  rank: number;
  rankingScore: number;
  winPercentage: number;
  currentStreak: number;
  matchesInPeriod: number;
  winsInPeriod: number;
  previousRank?: number | null;
  calculatedAt: string;
}

interface Player {
  playerId: string;
  name: string;
  currentWrestler: string;
  imageUrl?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const championshipId = event.pathParameters?.championshipId;

    if (!championshipId) {
      return badRequest('Championship ID is required');
    }

    // ------------------------------------------------------------------
    // 1. Validate the championship exists
    // ------------------------------------------------------------------
    const championshipResult = await dynamoDb.get({
      TableName: TableNames.CHAMPIONSHIPS,
      Key: { championshipId },
    });

    if (!championshipResult.Item) {
      return notFound('Championship not found');
    }

    const championship = championshipResult.Item;

    // ------------------------------------------------------------------
    // 2. Query contender rankings using the RankIndex GSI
    // ------------------------------------------------------------------
    const rankingsResult = await dynamoDb.queryAll({
      TableName: TableNames.CONTENDER_RANKINGS,
      IndexName: 'RankIndex',
      KeyConditionExpression: 'championshipId = :cid',
      ExpressionAttributeValues: { ':cid': championshipId },
      ScanIndexForward: true, // ascending by rank
    });

    const rankings = rankingsResult as unknown as ContenderRanking[];

    // ------------------------------------------------------------------
    // 3. Collect all player IDs to fetch (contenders + current champion)
    // ------------------------------------------------------------------
    const playerIds = new Set<string>();
    for (const ranking of rankings) {
      playerIds.add(ranking.playerId);
    }

    const currentChampion = championship.currentChampion as string | string[] | undefined;
    if (currentChampion) {
      if (Array.isArray(currentChampion)) {
        currentChampion.forEach((id) => playerIds.add(id));
      } else {
        playerIds.add(currentChampion);
      }
    }

    // ------------------------------------------------------------------
    // 4. Fetch all required player records
    // ------------------------------------------------------------------
    const playersMap = new Map<string, Player>();

    for (const playerId of playerIds) {
      const playerResult = await dynamoDb.get({
        TableName: TableNames.PLAYERS,
        Key: { playerId },
      });

      if (playerResult.Item) {
        const player = playerResult.Item as unknown as Player;
        playersMap.set(playerId, player);
      }
    }

    // ------------------------------------------------------------------
    // 5. Build the current champion object
    // ------------------------------------------------------------------
    let currentChampionData: Record<string, unknown> | null = null;

    if (currentChampion) {
      const championId = Array.isArray(currentChampion) ? currentChampion[0] : currentChampion;
      const championPlayer = playersMap.get(championId);

      if (championPlayer) {
        currentChampionData = {
          playerId: championPlayer.playerId,
          playerName: championPlayer.name,
          wrestlerName: championPlayer.currentWrestler,
          imageUrl: championPlayer.imageUrl || null,
        };
      }
    }

    // ------------------------------------------------------------------
    // 6. Build enriched contender list, excluding the current champion
    //    (handles case where #1 contender became champion but rankings
    //    haven't been recalculated yet)
    // ------------------------------------------------------------------
    const championIds = new Set<string>();
    if (currentChampion) {
      if (Array.isArray(currentChampion)) {
        currentChampion.forEach((id) => championIds.add(id));
      } else {
        championIds.add(currentChampion);
      }
    }

    const filteredRankings = rankings.filter(
      (ranking) => !championIds.has(ranking.playerId),
    );

    const contenders = filteredRankings.map((ranking, index) => {
      const player = playersMap.get(ranking.playerId);
      const previousRank = ranking.previousRank ?? null;
      const isNew = previousRank === null || previousRank === undefined;
      const adjustedRank = index + 1; // Re-rank after filtering out champion
      const movement = isNew ? 0 : (previousRank as number) - adjustedRank;

      return {
        rank: adjustedRank,
        playerId: ranking.playerId,
        playerName: player?.name || 'Unknown',
        wrestlerName: player?.currentWrestler || 'Unknown',
        imageUrl: player?.imageUrl || null,
        rankingScore: ranking.rankingScore,
        winPercentage: ranking.winPercentage,
        currentStreak: ranking.currentStreak,
        matchesInPeriod: ranking.matchesInPeriod,
        winsInPeriod: ranking.winsInPeriod,
        previousRank: previousRank,
        movement,
        isNew,
      };
    });

    // ------------------------------------------------------------------
    // 7. Determine the most recent calculatedAt timestamp
    // ------------------------------------------------------------------
    const calculatedAt =
      rankings.length > 0
        ? rankings.reduce<string>(
            (latest, r) => (r.calculatedAt > latest ? r.calculatedAt : latest),
            rankings[0].calculatedAt
          )
        : null;

    return success({
      championshipId,
      championshipName: championship.name || championshipId,
      divisionId: championship.divisionId || null,
      currentChampion: currentChampionData,
      contenders,
      calculatedAt,
    });
  } catch (err) {
    console.error('Error fetching contenders:', err);
    return serverError('Failed to fetch contenders');
  }
};
