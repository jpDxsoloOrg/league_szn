import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type { MatchSlot, Player } from '../../lib/repositories/types';
import { success, serverError } from '../../lib/response';
import { getAuthContext } from '../../lib/auth';
import { collectSlotPlayerIds, hydrateMatchSlots } from './hydrateSlots';

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

    if (!params.playerId && !params.stipulationId && !params.championshipId && !params.dateFrom && !params.dateTo && !params.matchType && !params.rivalryId) {
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
      if (params.rivalryId) {
        // Direct field comparison — more efficient than the participants
        // array overlap path used for playerId (RIV-06).
        scannedItems = scannedItems.filter((m) => m.rivalryId === params.rivalryId);
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

    // Slot hydration: collect every unique playerId across all slot-mode matches,
    // batch-fetch them in parallel, then enrich each match's slots with playerName /
    // wrestlerName. Pure read enrichment — never persisted.
    const allSlotPlayerIds = new Set<string>();
    for (const m of sortedMatches) {
      const slots = m.slots as MatchSlot[] | undefined;
      if (slots && slots.length > 0) {
        for (const id of collectSlotPlayerIds(slots)) {
          allSlotPlayerIds.add(id);
        }
      }
    }

    let playerLookup = new Map<string, Player>();
    if (allSlotPlayerIds.size > 0) {
      const { roster: { players } } = getRepositories();
      const fetched = await Promise.all(
        [...allSlotPlayerIds].map(async (id) => {
          const p = await players.findById(id);
          return p ? ([id, p] as const) : null;
        }),
      );
      playerLookup = new Map(fetched.filter((entry): entry is readonly [string, Player] => entry !== null));
    }

    const hydratedMatches = sortedMatches.map((m) => {
      const slots = m.slots as MatchSlot[] | undefined;
      if (!slots || slots.length === 0) return m;
      return { ...m, slots: hydrateMatchSlots(slots, playerLookup) };
    });

    // RIV-24: surface the calling user's rating per match so the FE rating
    // widget can render in the right state without N+1 follow-up calls.
    // Public endpoint — unauthenticated callers get false/null for every match.
    const userId = getAuthContext(event).sub || null;
    let userRatingsByMatchId = new Map<string, number>();
    if (userId) {
      const matchIds = hydratedMatches
        .map((m) => m.matchId as string | undefined)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
      if (matchIds.length > 0) {
        const { matchRatings } = getRepositories();
        const userRatings = await matchRatings.getByMatchIdsForUser(matchIds, userId);
        userRatingsByMatchId = new Map(userRatings.map((r) => [r.matchId, r.rating]));
      }
    }

    const decoratedMatches = hydratedMatches.map((m) => {
      const id = m.matchId as string | undefined;
      const rating = id ? userRatingsByMatchId.get(id) : undefined;
      return {
        ...m,
        userHasRated: rating !== undefined,
        userRating: rating ?? null,
      };
    });

    return success(decoratedMatches);
  } catch (err) {
    console.error('Error fetching matches:', err);
    return serverError('Failed to fetch matches');
  }
};
