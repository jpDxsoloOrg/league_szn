import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { sortDivisionsByRank } from '../../lib/divisionLadder';

const RECENT_MOVEMENTS_LIMIT = 20;

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    const {
      user: { siteConfig },
      leagueOps: { divisions, divisionMovements },
    } = getRepositories();

    const [rules, allDivisions, recentMovements] = await Promise.all([
      siteConfig.getDivisionLadderRules(),
      divisions.list(),
      divisionMovements.listRecent(RECENT_MOVEMENTS_LIMIT),
    ]);

    return success({ rules, divisions: sortDivisionsByRank(allDivisions), recentMovements });
  } catch (error) {
    console.error('Get division ladder error:', error);
    return serverError('Failed to load division ladder');
  }
};
