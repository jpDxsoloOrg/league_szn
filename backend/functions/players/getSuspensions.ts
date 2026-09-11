import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { buildSuspensionRow, todayIsoDateUtc, type SuspensionRow } from '../../lib/suspensions';

/**
 * GET /players/suspensions
 * Staff-only list of currently suspended players with computed eligibility.
 * Players eligible for reinstatement sort first; ties by suspendedAt ascending.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const { roster, leagueOps } = getRepositories();
    const [players, completedEvents] = await Promise.all([
      roster.players.list(),
      leagueOps.events.listByStatus('completed'),
    ]);

    const today = todayIsoDateUtc();
    const rows: SuspensionRow[] = [];
    for (const player of players) {
      const row = buildSuspensionRow(player, completedEvents, today);
      if (row) rows.push(row);
    }

    rows.sort((a, b) => {
      if (a.eligibleForReinstatement !== b.eligibleForReinstatement) {
        return a.eligibleForReinstatement ? -1 : 1;
      }
      return a.suspension.suspendedAt.localeCompare(b.suspension.suspendedAt);
    });

    return success(rows);
  } catch (err) {
    console.error('Error listing suspensions:', err);
    return serverError('Failed to list suspensions');
  }
};
