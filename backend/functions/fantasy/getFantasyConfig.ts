import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

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

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const result = await dynamoDb.get({
      TableName: TableNames.FANTASY_CONFIG,
      Key: { configKey: 'GLOBAL' },
    });

    return success(result.Item || DEFAULT_CONFIG);
  } catch (err) {
    console.error('Error fetching fantasy config:', err);
    return serverError('Failed to fetch fantasy config');
  }
};
