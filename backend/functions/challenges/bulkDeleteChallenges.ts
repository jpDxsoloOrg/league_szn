import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';
import { requireRole } from '../../lib/auth';

const MAX_BULK_DELETE = 100;

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    const { data: body, error: parseError } = parseBody<{ statuses?: string[] }>(event);
    if (parseError) return parseError;

    const statuses = body?.statuses;
    if (!statuses || !Array.isArray(statuses) || statuses.length === 0) {
      return badRequest('statuses array is required and must not be empty');
    }

    let challenges: Record<string, unknown>[] = [];

    for (const status of statuses) {
      const items = await dynamoDb.queryAll({
        TableName: TableNames.CHALLENGES,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#s = :status',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':status': status },
        ScanIndexForward: false,
      });
      challenges = challenges.concat(items);
      if (challenges.length >= MAX_BULK_DELETE) break;
    }

    challenges = challenges.slice(0, MAX_BULK_DELETE);
    let deleted = 0;

    for (const c of challenges) {
      const challengeId = c.challengeId as string;
      if (!challengeId) continue;
      await dynamoDb.delete({
        TableName: TableNames.CHALLENGES,
        Key: { challengeId },
      });
      deleted += 1;
    }

    return success({ deleted, message: deleted >= MAX_BULK_DELETE ? `Deleted ${deleted} challenges (max limit reached). More may exist.` : `Deleted ${deleted} challenges.` });
  } catch (err) {
    console.error('Error bulk deleting challenges:', err);
    return serverError('Failed to bulk delete challenges');
  }
};
