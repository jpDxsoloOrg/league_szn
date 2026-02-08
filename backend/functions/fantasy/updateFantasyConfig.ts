import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

const DEFAULT_CONFIG = {
  configKey: 'GLOBAL',
  defaultBudget: 500,
  defaultPicksPerDivision: 2,
  baseWinPoints: 10,
  championshipBonus: 5,
  titleWinBonus: 10,
  titleDefenseBonus: 5,
  costFluctuationEnabled: true,
  costChangePerWin: 10,
  costChangePerLoss: 5,
  costResetStrategy: 'reset',
  underdogMultiplier: 1.5,
  perfectPickBonus: 50,
  streakBonusThreshold: 5,
  streakBonusPoints: 25,
};

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const denied = requireRole(event, 'Admin');
    if (denied) return denied;

    if (!event.body) {
      return badRequest('Request body is required');
    }

    const body = JSON.parse(event.body);

    // Read existing config or use defaults
    const existing = await dynamoDb.get({
      TableName: TableNames.FANTASY_CONFIG,
      Key: { configKey: 'GLOBAL' },
    });

    const currentConfig = existing.Item || DEFAULT_CONFIG;

    // Merge body into existing config
    const updatedConfig = {
      ...currentConfig,
      ...body,
      configKey: 'GLOBAL', // Always enforce the key
    };

    await dynamoDb.put({
      TableName: TableNames.FANTASY_CONFIG,
      Item: updatedConfig,
    });

    return success(updatedConfig);
  } catch (err) {
    console.error('Error updating fantasy config:', err);
    return serverError('Failed to update fantasy config');
  }
};
