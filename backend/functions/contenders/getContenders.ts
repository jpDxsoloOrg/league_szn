import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const championshipId = event.pathParameters?.championshipId;

    if (!championshipId) {
      return badRequest('Championship ID is required');
    }

    const { competition: { championships, contenders }, roster: { players } } = getRepositories();

    // ------------------------------------------------------------------
    // 1. Validate the championship exists
    // ------------------------------------------------------------------
    const championship = await championships.findById(championshipId);

    if (!championship) {
      return notFound('Championship not found');
    }

    // ------------------------------------------------------------------
    // 2. Query contender rankings using ranked order
    // ------------------------------------------------------------------
    const rankings = await contenders.listByChampionshipRanked(championshipId);

    // ------------------------------------------------------------------
    // 3. Collect all player IDs to fetch (contenders + current champion)
    // ------------------------------------------------------------------
    const playerIds = new Set<string>();
    for (const ranking of rankings) {
      playerIds.add(ranking.playerId);
    }

    const currentChampion = championship.currentChampion;
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
    const playersMap = new Map<string, { playerId: string; name: string; currentWrestler: string; imageUrl?: string }>();

    for (const playerId of playerIds) {
      const player = await players.findById(playerId);
      if (player) {
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

    const contendersList = filteredRankings.map((ranking, index) => {
      const player = playersMap.get(ranking.playerId);
      const previousRank = ranking.previousRank ?? null;
      const isNew = previousRank === null || previousRank === undefined;
      const adjustedRank = index + 1;
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
        isOverridden: ranking.isOverridden || false,
        overrideType: ranking.overrideType || null,
        organicRank: ranking.organicRank || null,
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
      divisionId: (championship as unknown as Record<string, unknown>).divisionId || null,
      currentChampion: currentChampionData,
      contenders: contendersList,
      calculatedAt,
    });
  } catch (err) {
    console.error('Error fetching contenders:', err);
    return serverError('Failed to fetch contenders');
  }
};
