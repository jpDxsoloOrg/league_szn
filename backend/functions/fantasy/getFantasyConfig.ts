import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import type { FantasyConfig } from '../../lib/repositories';

const DEFAULT_CONFIG: FantasyConfig = {
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

export { DEFAULT_CONFIG };

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const { user: { fantasy } } = getRepositories();
    const config = await fantasy.getConfig();
    return success(config || DEFAULT_CONFIG);
  } catch (err) {
    console.error('Error fetching fantasy config:', err);
    return serverError('Failed to fetch fantasy config');
  }
};
