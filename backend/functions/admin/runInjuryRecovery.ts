import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { leagueWeekOf } from '../../lib/leagueWeek';
import { runRecovery } from '../../lib/injuries/recovery';

/**
 * POST /admin/injury-recovery (INJ-05, Admin) — run this league week's
 * recovery now, for testing on devtest. It makes the same claim as the hourly
 * job, so it never recovers twice in one week: a week already run answers
 * `status: 'alreadyRun'`.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    const now = new Date();
    const { timezone } = await getRepositories().user.siteConfig.getInjuryTunables();
    const result = await runRecovery(now, leagueWeekOf(now, timezone));
    return success(result);
  } catch (error) {
    console.error('Run injury recovery error:', error);
    return serverError('Failed to run the weekly recovery');
  }
};
