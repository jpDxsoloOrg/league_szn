import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const championshipId = event.queryStringParameters?.championshipId;
    const { competition: { contenders }, roster: { players } } = getRepositories();

    const overrides = await contenders.listActiveOverrides(championshipId);

    // Collect unique player IDs for enrichment
    const playerIds = new Set<string>();
    for (const override of overrides) {
      playerIds.add(override.playerId);
    }

    // Fetch player details
    const playersMap = new Map<string, { name: string; currentWrestler: string; imageUrl?: string }>();
    for (const playerId of playerIds) {
      const player = await players.findById(playerId);
      if (player) {
        playersMap.set(playerId, player);
      }
    }

    // Each override's stored position, so staff can see which ones show on a list
    const rankByOverride = new Map<string, number>();
    const championshipIds = new Set(overrides.map((override) => override.championshipId));
    for (const id of championshipIds) {
      const rankings = await contenders.listByChampionship(id);
      for (const ranking of rankings) {
        rankByOverride.set(`${id}#${ranking.playerId}`, ranking.rank);
      }
    }

    // Enrich overrides with player names and sort by createdAt desc
    const enriched = overrides
      .map((override) => {
        const player = playersMap.get(override.playerId);
        return {
          ...override,
          playerName: player?.name || 'Unknown',
          wrestlerName: player?.currentWrestler || 'Unknown',
          playerImageUrl: player?.imageUrl || null,
          currentRank: rankByOverride.get(`${override.championshipId}#${override.playerId}`) ?? null,
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return success(enriched);
  } catch (err) {
    console.error('Error fetching contender overrides:', err);
    return serverError('Failed to fetch contender overrides');
  }
};
