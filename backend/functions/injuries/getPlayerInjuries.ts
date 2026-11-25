import { APIGatewayProxyHandler } from 'aws-lambda';
import { isPlayerVisible } from '../../lib/needsWrestler';
import { getVerifiedCaller, isStaff } from '../../lib/optionalCaller';
import { getRepositories } from '../../lib/repositories';
import { toPublicInjuryHistory } from '../../lib/repositories/injuries';
import { badRequest, notFound, serverError, success } from '../../lib/response';
import { injuriesEnabled } from './shared';

/**
 * GET /players/{playerId}/injuries (public). The player's injury history,
 * newest first. Everyone gets the public view (dates, severity, length,
 * match; no reverted injuries). A verified Moderator or Admin gets the full
 * rows: source, GM notes, who created it and the change log.
 *
 * While the injuries feature is off it returns an empty list, so a profile
 * page can call it without checking the flag first.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const playerId = event.pathParameters?.playerId;
    if (!playerId) return badRequest('Player ID is required');

    const { injuries, roster: { players } } = getRepositories();
    const player = await players.findById(playerId);
    const caller = await getVerifiedCaller(event);
    const staff = isStaff(caller);
    const isSelf = Boolean(caller?.sub) && caller?.sub === player?.userId;
    if (!player || (!isPlayerVisible(player) && !staff && !isSelf)) return notFound('Player not found');

    if (!(await injuriesEnabled())) return success([]);

    const history = await injuries.listByPlayer(playerId);
    return success(staff ? history : toPublicInjuryHistory(history));
  } catch (err) {
    console.error('Error getting player injuries:', err);
    return serverError('Failed to get injuries');
  }
};
