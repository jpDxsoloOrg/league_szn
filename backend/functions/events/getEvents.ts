import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const eventType = event.queryStringParameters?.eventType;
    const status = event.queryStringParameters?.status;
    const seasonId = event.queryStringParameters?.seasonId;

    let events: Record<string, any>[] = [];

    if (eventType) {
      // Query DateIndex: PK=eventType, SK=date
      const result = await dynamoDb.query({
        TableName: TableNames.EVENTS,
        IndexName: 'DateIndex',
        KeyConditionExpression: '#eventType = :eventType',
        ExpressionAttributeNames: { '#eventType': 'eventType' },
        ExpressionAttributeValues: { ':eventType': eventType },
        ScanIndexForward: false,
      });
      events = (result.Items || []) as Record<string, any>[];
    } else if (status) {
      // Query StatusIndex: PK=status, SK=date
      const result = await dynamoDb.query({
        TableName: TableNames.EVENTS,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': status },
        ScanIndexForward: false,
      });
      events = (result.Items || []) as Record<string, any>[];
    } else if (seasonId) {
      // Query SeasonIndex: PK=seasonId, SK=date
      const result = await dynamoDb.query({
        TableName: TableNames.EVENTS,
        IndexName: 'SeasonIndex',
        KeyConditionExpression: '#seasonId = :seasonId',
        ExpressionAttributeNames: { '#seasonId': 'seasonId' },
        ExpressionAttributeValues: { ':seasonId': seasonId },
        ScanIndexForward: false,
      });
      events = (result.Items || []) as Record<string, any>[];
    } else {
      // No filters: scan all events
      const result = await dynamoDb.scan({
        TableName: TableNames.EVENTS,
      });
      events = (result.Items || []) as Record<string, any>[];
    }

    // Sort by date descending (most recent first)
    events.sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    return success(events);
  } catch (err) {
    console.error('Error fetching events:', err);
    return serverError('Failed to fetch events');
  }
};
