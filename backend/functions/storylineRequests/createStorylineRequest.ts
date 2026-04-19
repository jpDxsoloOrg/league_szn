import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { getAuthContext, requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

type StorylineRequestType = 'storyline' | 'backstage_attack' | 'rivalry';

const VALID_TYPES: readonly StorylineRequestType[] = ['storyline', 'backstage_attack', 'rivalry'];
const MAX_DESCRIPTION_LENGTH = 500;

interface CreateStorylineRequestBody {
  requestType: StorylineRequestType;
  targetPlayerIds: string[];
  description: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Wrestler');
  if (denied) return denied;

  try {
    const { sub } = getAuthContext(event);
    const { players, storylineRequests } = getRepositories();

    const player = await players.findByUserId(sub);
    if (!player) {
      return notFound('No player profile found for this user');
    }

    const requesterId = player.playerId;

    const parsed = parseBody<CreateStorylineRequestBody>(event);
    if (parsed.error) return parsed.error;
    const { requestType, targetPlayerIds, description } = parsed.data;

    if (!requestType || !VALID_TYPES.includes(requestType)) {
      return badRequest(`requestType must be one of: ${VALID_TYPES.join(', ')}`);
    }

    if (!Array.isArray(targetPlayerIds) || targetPlayerIds.length === 0) {
      return badRequest('targetPlayerIds must be a non-empty array');
    }

    if (targetPlayerIds.some((id) => typeof id !== 'string' || id.length === 0)) {
      return badRequest('targetPlayerIds must contain valid player IDs');
    }

    if (targetPlayerIds.includes(requesterId)) {
      return badRequest('You cannot target yourself in a storyline request');
    }

    const uniqueTargets = Array.from(new Set(targetPlayerIds));

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return badRequest('description is required');
    }

    const trimmedDescription = description.trim();
    if (trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
      return badRequest(`description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer`);
    }

    // Validate all target players exist
    const targetResults = await Promise.all(
      uniqueTargets.map((playerId) => players.findById(playerId))
    );

    const missing = targetResults.findIndex((r) => !r);
    if (missing !== -1) {
      return notFound(`Target player not found: ${uniqueTargets[missing]}`);
    }

    const item = await storylineRequests.create({
      requesterId,
      targetPlayerIds: uniqueTargets,
      requestType,
      description: trimmedDescription,
    });

    return success(item);
  } catch (err) {
    console.error('Error creating storyline request:', err);
    return serverError('Failed to create storyline request');
  }
};
