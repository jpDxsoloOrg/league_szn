import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { requireRole, getAuthContext } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const denied = requireRole(event, 'Fantasy');
    if (denied) return denied;

    const eventId = event.pathParameters?.eventId;
    if (!eventId) {
      return badRequest('Event ID is required');
    }

    if (!event.body) {
      return badRequest('Request body is required');
    }

    const { sub: fantasyUserId } = getAuthContext(event);
    const body = JSON.parse(event.body);
    const picks: Record<string, string[]> = body.picks;

    if (!picks || typeof picks !== 'object') {
      return badRequest('picks must be an object mapping divisionId to playerIds[]');
    }

    // Fetch event
    const eventResult = await dynamoDb.get({
      TableName: TableNames.EVENTS,
      Key: { eventId },
    });

    if (!eventResult.Item) {
      return notFound('Event not found');
    }

    const eventItem = eventResult.Item;

    if (!eventItem.fantasyEnabled) {
      return badRequest('This event is not fantasy-enabled');
    }

    if (eventItem.status === 'completed' || eventItem.status === 'cancelled') {
      return badRequest('This event is no longer accepting picks');
    }

    // Get config for defaults
    const configResult = await dynamoDb.get({
      TableName: TableNames.FANTASY_CONFIG,
      Key: { configKey: 'GLOBAL' },
    });

    const config = configResult.Item || { defaultBudget: 500, defaultPicksPerDivision: 2 };
    const budget = (eventItem.fantasyBudget as number) || (config.defaultBudget as number) || 500;
    const picksPerDivision =
      (eventItem.fantasyPicksPerDivision as number) || (config.defaultPicksPerDivision as number) || 2;

    // Fetch players and costs for validation
    const [allPlayers, allCosts] = await Promise.all([
      dynamoDb.scanAll({ TableName: TableNames.PLAYERS }),
      dynamoDb.scanAll({ TableName: TableNames.WRESTLER_COSTS }),
    ]);

    const playerMap = new Map<string, Record<string, unknown>>();
    for (const p of allPlayers) {
      playerMap.set(p.playerId as string, p);
    }

    const costMap = new Map<string, number>();
    for (const c of allCosts) {
      costMap.set(c.playerId as string, (c.currentCost as number) || 100);
    }

    // Validate each pick
    for (const [divisionId, playerIds] of Object.entries(picks)) {
      if (!Array.isArray(playerIds)) {
        return badRequest(`Picks for division ${divisionId} must be an array`);
      }

      if (playerIds.length > picksPerDivision) {
        return badRequest(
          `Too many picks for division ${divisionId}. Max: ${picksPerDivision}`
        );
      }

      for (const playerId of playerIds) {
        const player = playerMap.get(playerId);
        if (!player) {
          return badRequest(`Player ${playerId} not found`);
        }
        if (player.divisionId !== divisionId) {
          return badRequest(
            `Player ${player.name} does not belong to division ${divisionId}`
          );
        }
      }
    }

    // Calculate total cost
    let totalSpent = 0;
    for (const playerIds of Object.values(picks)) {
      for (const playerId of playerIds) {
        totalSpent += costMap.get(playerId) || 100;
      }
    }

    if (totalSpent > budget) {
      return badRequest(`Total cost $${totalSpent} exceeds budget $${budget}`);
    }

    // Check for existing picks (to preserve createdAt)
    const existingResult = await dynamoDb.get({
      TableName: TableNames.FANTASY_PICKS,
      Key: { eventId, fantasyUserId },
    });

    const timestamp = new Date().toISOString();
    const pickRecord = {
      eventId,
      fantasyUserId,
      picks,
      totalSpent,
      createdAt: (existingResult.Item?.createdAt as string) || timestamp,
      updatedAt: timestamp,
    };

    await dynamoDb.put({
      TableName: TableNames.FANTASY_PICKS,
      Item: pickRecord,
    });

    return success(pickRecord);
  } catch (err) {
    console.error('Error submitting picks:', err);
    return serverError('Failed to submit picks');
  }
};
