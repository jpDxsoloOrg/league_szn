import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, notFound, serverError } from '../../lib/response';
import { getAuthContext, requireRole } from '../../lib/auth';

interface StorylineRequestRecord {
  requestId: string;
  requesterId: string;
  targetPlayerIds: string[];
  requestType: string;
  description: string;
  status: string;
  gmNote?: string;
  createdAt: string;
  updatedAt: string;
}

interface PlayerRecord {
  playerId: string;
  name: string;
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

    const requesterId = playerResult.Items[0].playerId as string;

    const requestsResult = await dynamoDb.queryAll({
      TableName: TableNames.STORYLINE_REQUESTS,
      IndexName: 'RequesterIndex',
      KeyConditionExpression: 'requesterId = :requesterId',
      ExpressionAttributeValues: { ':requesterId': requesterId },
      ScanIndexForward: false,
    });

    const requests = requestsResult as unknown as StorylineRequestRecord[];

    // Collect target player IDs and resolve names
    const targetIds = new Set<string>();
    for (const req of requests) {
      for (const pid of req.targetPlayerIds || []) targetIds.add(pid);
    }

    const playersMap = new Map<string, string>();
    await Promise.all(
      Array.from(targetIds).map(async (playerId) => {
        const result = await dynamoDb.get({
          TableName: TableNames.PLAYERS,
          Key: { playerId },
        });
        if (result.Item) {
          const p = result.Item as unknown as PlayerRecord;
          playersMap.set(playerId, p.name);
        }
      })
    );

    const enriched = requests.map((req) => ({
      ...req,
      targetPlayerNames: (req.targetPlayerIds || []).map(
        (pid) => playersMap.get(pid) ?? 'Unknown Player'
      ),
    }));

    enriched.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return success(enriched);
  } catch (err) {
    console.error('Error fetching my storyline requests:', err);
    return serverError('Failed to fetch storyline requests');
  }
};
