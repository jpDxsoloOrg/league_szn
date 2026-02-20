import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const params = event.queryStringParameters ?? {};

    const filters: string[] = [];
    const attrNames: Record<string, string> = {};
    const attrValues: Record<string, unknown> = {};

    if (params.status) {
      filters.push('#status = :status');
      attrNames['#status'] = 'status';
      attrValues[':status'] = params.status;
    }

    if (params.playerId) {
      filters.push('contains(#participants, :playerId)');
      attrNames['#participants'] = 'participants';
      attrValues[':playerId'] = params.playerId;
    }

    if (params.matchType) {
      filters.push('#matchFormat = :matchFormat');
      attrNames['#matchFormat'] = 'matchFormat';
      attrValues[':matchFormat'] = params.matchType;
    }

    if (params.stipulationId) {
      filters.push('#stipulationId = :stipulationId');
      attrNames['#stipulationId'] = 'stipulationId';
      attrValues[':stipulationId'] = params.stipulationId;
    }

    if (params.championshipId) {
      filters.push('#championshipId = :championshipId');
      attrNames['#championshipId'] = 'championshipId';
      attrValues[':championshipId'] = params.championshipId;
    }

    if (params.seasonId) {
      filters.push('#seasonId = :seasonId');
      attrNames['#seasonId'] = 'seasonId';
      attrValues[':seasonId'] = params.seasonId;
    }

    if (params.dateFrom) {
      filters.push('#date >= :dateFrom');
      attrNames['#date'] = 'date';
      attrValues[':dateFrom'] = params.dateFrom;
    }

    if (params.dateTo) {
      if (!attrNames['#date']) {
        attrNames['#date'] = 'date';
      }
      filters.push('#date <= :dateTo');
      attrValues[':dateTo'] = params.dateTo;
    }

    const result = await dynamoDb.scan({
      TableName: TableNames.MATCHES,
      ...(filters.length > 0 && {
        FilterExpression: filters.join(' AND '),
        ExpressionAttributeNames: attrNames,
        ExpressionAttributeValues: attrValues,
      }),
    });

    // Sort by date descending (most recent first)
    const matches = (result.Items || []).sort((a, b) => {
      return new Date(b.date as string).getTime() - new Date(a.date as string).getTime();
    });

    return success(matches);
  } catch (err) {
    console.error('Error fetching matches:', err);
    return serverError('Failed to fetch matches');
  }
};
