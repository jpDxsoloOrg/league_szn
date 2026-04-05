import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, notFound, serverError } from '../../lib/response';
import { getAuthContext, requireRole } from '../../lib/auth';

interface TransferRequestRecord {
  requestId: string;
  playerId: string;
  fromDivisionId: string;
  toDivisionId: string;
  reason: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  reviewedBy?: string;
  reviewNote?: string;
}

interface DivisionRecord {
  divisionId: string;
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

    const player = playerResult.Items[0];
    const playerId = player.playerId as string;

    const requestsResult = await dynamoDb.queryAll({
      TableName: TableNames.TRANSFER_REQUESTS,
      IndexName: 'PlayerTransfersIndex',
      KeyConditionExpression: 'playerId = :playerId',
      ExpressionAttributeValues: { ':playerId': playerId },
    });

    const requests = requestsResult as unknown as TransferRequestRecord[];

    // Collect unique division IDs to join names
    const divisionIds = new Set<string>();
    for (const req of requests) {
      divisionIds.add(req.fromDivisionId);
      divisionIds.add(req.toDivisionId);
    }

    const divisionsMap = new Map<string, string>();
    await Promise.all(
      Array.from(divisionIds).map(async (divisionId) => {
        const result = await dynamoDb.get({
          TableName: TableNames.DIVISIONS,
          Key: { divisionId },
        });
        if (result.Item) {
          const div = result.Item as unknown as DivisionRecord;
          divisionsMap.set(divisionId, div.name);
        }
      })
    );

    const enriched = requests.map((req) => ({
      ...req,
      fromDivisionName: divisionsMap.get(req.fromDivisionId) ?? req.fromDivisionId,
      toDivisionName: divisionsMap.get(req.toDivisionId) ?? req.toDivisionId,
    }));

    enriched.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return success(enriched);
  } catch (err) {
    console.error('Error fetching transfer requests:', err);
    return serverError('Failed to fetch transfer requests');
  }
};
