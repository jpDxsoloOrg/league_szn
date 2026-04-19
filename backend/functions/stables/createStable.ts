import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { created, badRequest, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

interface CreateStableBody {
  name: string;
  imageUrl?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return badRequest('Only wrestlers can create stables');
    }

    const { data: body, error: parseError } = parseBody<CreateStableBody>(event);
    if (parseError) return parseError;

    const { name, imageUrl } = body;

    if (!name || !name.trim()) {
      return badRequest('Stable name is required');
    }

    const { players: playersRepo, stables: stablesRepo } = getRepositories();

    // Find the player record via auth.sub
    const player = await playersRepo.findByUserId(auth.sub);
    if (!player) {
      return badRequest('No player profile linked to your account');
    }

    // Check player doesn't already belong to a stable
    if (player.stableId) {
      return badRequest('You already belong to a stable');
    }

    const stable = await stablesRepo.create({
      name: name.trim(),
      leaderId: player.playerId,
      memberIds: [player.playerId],
      status: 'pending',
      imageUrl: imageUrl || undefined,
    });

    return created(stable);
  } catch (err) {
    console.error('Error creating stable:', err);
    return serverError('Failed to create stable');
  }
};
