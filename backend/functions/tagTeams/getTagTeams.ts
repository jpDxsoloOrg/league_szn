import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

interface TagTeamRecord {
  tagTeamId: string;
  name: string;
  player1Id: string;
  player2Id: string;
  imageUrl?: string;
  status: string;
  wins: number;
  losses: number;
  draws: number;
  createdAt: string;
  updatedAt: string;
  dissolvedAt?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const statusFilter = event.queryStringParameters?.status;

    let items: Record<string, unknown>[];

    if (statusFilter) {
      items = await dynamoDb.queryAll({
        TableName: TableNames.TAG_TEAMS,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': statusFilter },
      });
    } else {
      items = await dynamoDb.scanAll({
        TableName: TableNames.TAG_TEAMS,
      });
    }

    const tagTeams = items as unknown as TagTeamRecord[];

    return success(tagTeams);
  } catch (err) {
    console.error('Error fetching tag teams:', err);
    return serverError('Failed to fetch tag teams');
  }
};
