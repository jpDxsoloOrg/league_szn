import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { created, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const denied = requireRole(event, 'Admin');
    if (denied) return denied;

    const body = event.body ? JSON.parse(event.body) : {};
    const baseCost = body.baseCost || 100;

    const { fantasy, players } = getRepositories();

    const [allPlayers, existingCosts] = await Promise.all([
      players.list(),
      fantasy.listAllCosts(),
    ]);

    const existingIds = new Set(existingCosts.map((c) => c.playerId));

    let newCount = 0;
    for (const player of allPlayers) {
      if (existingIds.has(player.playerId)) continue;

      await fantasy.initializeCost({ playerId: player.playerId, baseCost });
      newCount++;
    }

    return created({
      message: 'Wrestler costs initialized',
      initialized: newCount,
      skipped: existingCosts.length,
      total: allPlayers.length,
    });
  } catch (err) {
    console.error('Error initializing wrestler costs:', err);
    return serverError('Failed to initialize wrestler costs');
  }
};
