import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { created, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const denied = requireRole(event, 'Admin');
    if (denied) return denied;

    const body = event.body ? JSON.parse(event.body) : {};
    const baseCost = body.baseCost || 100;
    const timestamp = new Date().toISOString();
    const today = timestamp.split('T')[0];

    const [players, existingCosts] = await Promise.all([
      dynamoDb.scanAll({ TableName: TableNames.PLAYERS }),
      dynamoDb.scanAll({ TableName: TableNames.WRESTLER_COSTS }),
    ]);

    const existingIds = new Set(existingCosts.map((c) => c.playerId as string));

    let newCount = 0;
    for (const player of players) {
      if (existingIds.has(player.playerId as string)) continue;

      await dynamoDb.put({
        TableName: TableNames.WRESTLER_COSTS,
        Item: {
          playerId: player.playerId,
          currentCost: baseCost,
          baseCost,
          costHistory: [{ date: today, cost: baseCost, reason: 'Initialized' }],
          winRate30Days: 0,
          recentRecord: '0-0',
          updatedAt: timestamp,
        },
      });
      newCount++;
    }

    return created({
      message: 'Wrestler costs initialized',
      initialized: newCount,
      skipped: existingCosts.length,
      total: players.length,
    });
  } catch (err) {
    console.error('Error initializing wrestler costs:', err);
    return serverError('Failed to initialize wrestler costs');
  }
};
