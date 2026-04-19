import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
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
    const { competition: { matches } } = getRepositories();
    const params = event.queryStringParameters ?? {};
    const allowedMatchTypeValues = params.matchType ? getAllowedMatchTypeValues(params.matchType) : null;

    // Use repo methods for common filter cases; fall back to list() + client-side filter for complex combos
    let scannedItems: Record<string, unknown>[];

    if (!params.playerId && !params.stipulationId && !params.championshipId && !params.dateFrom && !params.dateTo && !params.matchType) {
      // Simple status-only or no-filter path
      if (params.status && !params.seasonId) {
        scannedItems = await matches.listByStatus(params.status) as unknown as Record<string, unknown>[];
      } else if (params.seasonId && !params.status) {
        scannedItems = await matches.listBySeason(params.seasonId) as unknown as Record<string, unknown>[];
      } else {
        scannedItems = await matches.list() as unknown as Record<string, unknown>[];
        // Apply remaining filters client-side
        if (params.status) {
          scannedItems = scannedItems.filter((m) => m.status === params.status);
        }
        if (params.seasonId) {
          scannedItems = scannedItems.filter((m) => m.seasonId === params.seasonId);
        }
      }
    } else {
      // Complex filter — fetch all and filter client-side
      scannedItems = await matches.list() as unknown as Record<string, unknown>[];

      if (params.status) {
        scannedItems = scannedItems.filter((m) => m.status === params.status);
      }
      if (params.playerId) {
        scannedItems = scannedItems.filter((m) => {
          const participants = m.participants as string[] | undefined;
          return participants && participants.includes(params.playerId as string);
        });
      }
      if (params.stipulationId) {
        scannedItems = scannedItems.filter((m) => m.stipulationId === params.stipulationId);
      }
      if (params.championshipId) {
        scannedItems = scannedItems.filter((m) => m.championshipId === params.championshipId);
      }
      if (params.seasonId) {
        scannedItems = scannedItems.filter((m) => m.seasonId === params.seasonId);
      }
      if (params.dateFrom) {
        scannedItems = scannedItems.filter((m) => (m.date as string) >= (params.dateFrom as string));
      }
      if (params.dateTo) {
        scannedItems = scannedItems.filter((m) => (m.date as string) <= (params.dateTo as string));
      }
    }

    const filteredMatches = allowedMatchTypeValues
      ? scannedItems.filter((item) => {
        const rawMatchType = typeof item.matchFormat === 'string'
          ? item.matchFormat
          : (typeof item.matchType === 'string' ? item.matchType : null);

        if (!rawMatchType) return false;
        return allowedMatchTypeValues.has(normalizeMatchType(rawMatchType));
      })
      : scannedItems;

    // Sort by date descending (most recent first)
    const sortedMatches = filteredMatches.sort((a, b) => {
      return new Date(b.date as string).getTime() - new Date(a.date as string).getTime();
    });

    return success(sortedMatches);
  } catch (err) {
    console.error('Error fetching matches:', err);
    return serverError('Failed to fetch matches');
  }
};
