import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { badRequest, serverError, success, unauthorized } from '../../lib/response';
import { getAuthContext } from '../../lib/auth';

type CheckInStatus = 'available' | 'tentative' | 'unavailable';

interface CheckInRow {
  eventId: string;
  playerId: string;
  status: CheckInStatus;
  checkedInAt: string;
  ttl: number;
}

interface CheckInSummary {
  eventId: string;
  available: number;
  tentative: number;
  unavailable: number;
  total: number;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    try {
      getAuthContext(event);
    } catch {
      return unauthorized();
    }

    const eventId = event.pathParameters?.eventId;
    if (!eventId) {
      return badRequest('eventId is required');
    }

    const summary: CheckInSummary = {
      eventId,
      available: 0,
      tentative: 0,
      unavailable: 0,
      total: 0,
    };

    let lastEvaluatedKey: Record<string, unknown> | undefined;
    do {
      const result = await dynamoDb.query({
        TableName: TableNames.EVENT_CHECK_INS,
        KeyConditionExpression: 'eventId = :eid',
        ExpressionAttributeValues: {
          ':eid': eventId,
        },
        ExclusiveStartKey: lastEvaluatedKey,
      });

      const rows = (result.Items || []) as CheckInRow[];
      for (const row of rows) {
        if (row.status === 'available') {
          summary.available += 1;
        } else if (row.status === 'tentative') {
          summary.tentative += 1;
        } else if (row.status === 'unavailable') {
          summary.unavailable += 1;
        }
        summary.total += 1;
      }

      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return success(summary);
  } catch (err) {
    console.error('Error getting check-in summary:', err);
    return serverError('Failed to get check-in summary');
  }
};
