import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

const MATCH_TYPE_ALIAS_GROUPS: string[][] = [
  ['single', 'singles'],
  ['tag', 'tag team', 'tag-team', 'tagteam'],
];

function normalizeMatchType(value: string): string {
  return value.trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
}

function getAllowedMatchTypeValues(matchType: string): Set<string> {
  const normalized = normalizeMatchType(matchType);
  const matchingGroup = MATCH_TYPE_ALIAS_GROUPS.find((group) => {
    return group.some((entry) => normalizeMatchType(entry) === normalized);
  });

  if (!matchingGroup) {
    return new Set([normalized]);
  }

  return new Set(matchingGroup.map((entry) => normalizeMatchType(entry)));
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const params = event.queryStringParameters ?? {};
    const allowedMatchTypeValues = params.matchType ? getAllowedMatchTypeValues(params.matchType) : null;

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

    const scannedMatches = await dynamoDb.scanAll({
      TableName: TableNames.MATCHES,
      ...(filters.length > 0 && {
        FilterExpression: filters.join(' AND '),
        ExpressionAttributeNames: attrNames,
        ExpressionAttributeValues: attrValues,
      }),
    });

    const scannedItems = Array.isArray(scannedMatches)
      ? scannedMatches
      : ((scannedMatches as { Items?: Record<string, unknown>[] }).Items || []);

    const filteredMatches = allowedMatchTypeValues
      ? scannedItems.filter((item) => {
        const record = item as Record<string, unknown>;
        const rawMatchType = typeof record.matchFormat === 'string'
          ? record.matchFormat
          : (typeof record.matchType === 'string' ? record.matchType : null);

        if (!rawMatchType) return false;
        return allowedMatchTypeValues.has(normalizeMatchType(rawMatchType));
      })
      : scannedItems;

    // Sort by date descending (most recent first)
    const matches = filteredMatches.sort((a, b) => {
      return new Date(b.date as string).getTime() - new Date(a.date as string).getTime();
    });

    return success(matches);
  } catch (err) {
    console.error('Error fetching matches:', err);
    return serverError('Failed to fetch matches');
  }
};
