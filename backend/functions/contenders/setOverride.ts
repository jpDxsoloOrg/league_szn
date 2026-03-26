import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { created, badRequest, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';
import { getAuthContext } from '../../lib/auth';
import { invokeAsync } from '../../lib/asyncLambda';

interface SetOverrideBody {
  championshipId: string;
  playerId: string;
  overrideType: 'bump_to_top' | 'send_to_bottom';
  reason: string;
  expiresAt?: string;
}

interface Championship {
  championshipId: string;
  currentChampion?: string | string[];
  divisionId?: string;
  isActive: boolean;
}

interface Player {
  playerId: string;
  name: string;
  divisionId?: string;
}

const VALID_OVERRIDE_TYPES = ['bump_to_top', 'send_to_bottom'] as const;

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { data, error } = parseBody<SetOverrideBody>(event);
    if (error) return error;

    const { championshipId, playerId, overrideType, reason, expiresAt } = data;

    // Validate required fields
    if (!championshipId || !playerId || !overrideType || !reason) {
      return badRequest('championshipId, playerId, overrideType, and reason are required');
    }

    if (!VALID_OVERRIDE_TYPES.includes(overrideType as typeof VALID_OVERRIDE_TYPES[number])) {
      return badRequest('overrideType must be "bump_to_top" or "send_to_bottom"');
    }

    if (typeof reason !== 'string' || reason.trim().length === 0) {
      return badRequest('reason must be a non-empty string');
    }

    // Validate championship exists and is active
    const champResult = await dynamoDb.get({
      TableName: TableNames.CHAMPIONSHIPS,
      Key: { championshipId },
    });

    if (!champResult.Item) {
      return badRequest('Championship not found');
    }

    const championship = champResult.Item as unknown as Championship;

    if (!championship.isActive) {
      return badRequest('Championship is not active');
    }

    // Validate player exists
    const playerResult = await dynamoDb.get({
      TableName: TableNames.PLAYERS,
      Key: { playerId },
    });

    if (!playerResult.Item) {
      return badRequest('Player not found');
    }

    const player = playerResult.Item as unknown as Player;

    // Player must not be the current champion
    const currentChampion = championship.currentChampion;
    if (currentChampion) {
      const championIds = Array.isArray(currentChampion) ? currentChampion : [currentChampion];
      if (championIds.includes(playerId)) {
        return badRequest('Cannot set override for the current champion');
      }
    }

    // If championship is division-locked, player must be in that division
    if (championship.divisionId && player.divisionId !== championship.divisionId) {
      return badRequest('Player is not in the division required for this championship');
    }

    const now = new Date().toISOString();
    const auth = getAuthContext(event);

    // Deactivate existing active override for this player/championship
    const existingResult = await dynamoDb.get({
      TableName: TableNames.CONTENDER_OVERRIDES,
      Key: { championshipId, playerId },
    });

    if (existingResult.Item && existingResult.Item.active) {
      await dynamoDb.update({
        TableName: TableNames.CONTENDER_OVERRIDES,
        Key: { championshipId, playerId },
        UpdateExpression: 'SET active = :false, removedAt = :now, removedReason = :reason',
        ExpressionAttributeValues: {
          ':false': false,
          ':now': now,
          ':reason': 'replaced by new override',
        },
      });
    }

    // Write new override
    const override = {
      championshipId,
      playerId,
      overrideType,
      reason: reason.trim(),
      createdBy: auth.username || 'admin',
      createdAt: now,
      ...(expiresAt ? { expiresAt } : {}),
      active: true,
    };

    await dynamoDb.put({
      TableName: TableNames.CONTENDER_OVERRIDES,
      Item: override,
    });

    // Trigger ranking recalculation for this championship
    try {
      await invokeAsync('contenders', { source: 'recordResult', championshipId });
    } catch (err) {
      console.warn('Failed to invoke calculateRankings async:', err);
    }

    return created(override);
  } catch (err) {
    console.error('Error setting contender override:', err);
    return serverError('Failed to set contender override');
  }
};
