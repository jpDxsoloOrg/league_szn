import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { isPlayerActive } from '../../lib/activeStatus';

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const { roster: { players: playersRepo }, season: { seasons } } = getRepositories();
    const [players, activeSeason] = await Promise.all([
      playersRepo.list(),
      seasons.findActive(),
    ]);

    // Only include players who have a wrestler assigned. Inactive wrestlers
    // are deliberately NOT filtered out here — this list feeds match
    // scheduling and roster pickers, and being bookable is the only way an
    // inactive wrestler becomes active again. The flag is returned so admin
    // screens can badge them.
    const wrestlers = players
      .filter((p) => p.currentWrestler)
      .map((p) => ({ ...p, isActive: isPlayerActive(p, activeSeason?.seasonId) }));

    return success(wrestlers);
  } catch (err) {
    console.error('Error fetching players:', err);
    return serverError('Failed to fetch players');
  }
};
