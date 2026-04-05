import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

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
  reviewedBy?: string;
}

interface PlayerRecord {
  playerId: string;
  name: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const statusFilter = event.queryStringParameters?.status;

    let requests: StorylineRequestRecord[];

    if (statusFilter) {
      const result = await dynamoDb.queryAll({
        TableName: TableNames.STORYLINE_REQUESTS,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': statusFilter },
        ScanIndexForward: false,
      });
      requests = result as unknown as StorylineRequestRecord[];
    } else {
      const result = await dynamoDb.scanAll({ TableName: TableNames.STORYLINE_REQUESTS });
      requests = result as unknown as StorylineRequestRecord[];
    }

    // Collect unique player IDs (requester + targets)
    const playerIds = new Set<string>();
    for (const req of requests) {
      playerIds.add(req.requesterId);
      for (const pid of req.targetPlayerIds || []) playerIds.add(pid);
    }

    const playersResult = await dynamoDb.scanAll({ TableName: TableNames.PLAYERS });
    const playersMap = new Map<string, string>(
      (playersResult as unknown as PlayerRecord[])
        .filter((p) => playerIds.has(p.playerId))
        .map((p) => [p.playerId, p.name])
    );

    const enriched = requests.map((req) => ({
      ...req,
      requesterName: playersMap.get(req.requesterId) ?? 'Unknown Player',
      targetPlayerNames: (req.targetPlayerIds || []).map(
        (pid) => playersMap.get(pid) ?? 'Unknown Player'
      ),
    }));

    enriched.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return success(enriched);
  } catch (err) {
    console.error('Error fetching storyline requests:', err);
    return serverError('Failed to fetch storyline requests');
  }
};
