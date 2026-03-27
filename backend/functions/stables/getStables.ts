import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

interface StableRecord {
  stableId: string;
  name: string;
  leaderId: string;
  memberIds: string[];
  status: string;
  imageUrl?: string;
  wins: number;
  losses: number;
  draws: number;
  createdAt: string;
  updatedAt: string;
  disbandedAt?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const statusFilter = event.queryStringParameters?.status;

    let items: Record<string, unknown>[];

    if (statusFilter) {
      items = await dynamoDb.scanAll({
        TableName: TableNames.STABLES,
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': statusFilter },
      });
    } else {
      items = await dynamoDb.scanAll({
        TableName: TableNames.STABLES,
      });
    }

    const stables = items as unknown as StableRecord[];

    return success(stables);
  } catch (err) {
    console.error('Error fetching stables:', err);
    return serverError('Failed to fetch stables');
  }
};
