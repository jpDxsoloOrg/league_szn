import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

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

interface PlayerRecord {
  playerId: string;
  name: string;
}

interface DivisionRecord {
  divisionId: string;
  name: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const statusFilter = event.queryStringParameters?.status;

    let requests: TransferRequestRecord[];

    if (statusFilter) {
      const result = await dynamoDb.queryAll({
        TableName: TableNames.TRANSFER_REQUESTS,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': statusFilter },
      });
      requests = result as unknown as TransferRequestRecord[];
    } else {
      const result = await dynamoDb.scanAll({ TableName: TableNames.TRANSFER_REQUESTS });
      requests = result as unknown as TransferRequestRecord[];
    }

    // Collect unique player/division IDs
    const playerIds = new Set<string>(requests.map((r) => r.playerId));
    const divisionIds = new Set<string>();
    for (const req of requests) {
      divisionIds.add(req.fromDivisionId);
      divisionIds.add(req.toDivisionId);
    }

    const [playersResult, divisionsResult] = await Promise.all([
      dynamoDb.scanAll({ TableName: TableNames.PLAYERS }),
      dynamoDb.scanAll({ TableName: TableNames.DIVISIONS }),
    ]);

    const playersMap = new Map<string, string>(
      (playersResult as unknown as PlayerRecord[])
        .filter((p) => playerIds.has(p.playerId))
        .map((p) => [p.playerId, p.name])
    );

    const divisionsMap = new Map<string, string>(
      (divisionsResult as unknown as DivisionRecord[])
        .filter((d) => divisionIds.has(d.divisionId))
        .map((d) => [d.divisionId, d.name])
    );

    const enriched = requests.map((req) => ({
      ...req,
      playerName: playersMap.get(req.playerId) ?? 'Unknown Player',
      fromDivisionName: divisionsMap.get(req.fromDivisionId) ?? req.fromDivisionId,
      toDivisionName: divisionsMap.get(req.toDivisionId) ?? req.toDivisionId,
    }));

    enriched.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return success(enriched);
  } catch (err) {
    console.error('Error fetching all transfer requests:', err);
    return serverError('Failed to fetch transfer requests');
  }
};
