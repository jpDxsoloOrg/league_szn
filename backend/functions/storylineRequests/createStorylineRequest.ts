import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
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

    const playerResult = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': sub },
    });

    if (!playerResult.Items || playerResult.Items.length === 0) {
      return notFound('No player profile found for this user');
    }

    const player = playerResult.Items[0];
    const requesterId = player.playerId as string;

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
      uniqueTargets.map((playerId) =>
        dynamoDb.get({ TableName: TableNames.PLAYERS, Key: { playerId } })
      )
    );

    const missing = targetResults.findIndex((r) => !r.Item);
    if (missing !== -1) {
      return notFound(`Target player not found: ${uniqueTargets[missing]}`);
    }

    const now = new Date().toISOString();
    const requestId = uuidv4();

    const item = {
      requestId,
      requesterId,
      targetPlayerIds: uniqueTargets,
      requestType,
      description: trimmedDescription,
      status: 'pending' as const,
      createdAt: now,
      updatedAt: now,
    };

    await dynamoDb.put({
      TableName: TableNames.STORYLINE_REQUESTS,
      Item: item,
    });

    return success(item);
  } catch (err) {
    console.error('Error creating storyline request:', err);
    return serverError('Failed to create storyline request');
  }
};
