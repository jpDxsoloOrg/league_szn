import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import type { LeagueEvent } from '../../lib/repositories/types';
import {
  buildInjuryLookup,
  eventCardMatches,
  eventInjuredParticipantsField,
  injuryFlagsEnabled,
} from '../../lib/injuries/scheduledMatchFlags'; // INJ-07

/** Events whose cards can still change: only these get injury flags. */
const OPEN_EVENT_STATUSES: ReadonlySet<LeagueEvent['status']> = new Set(['upcoming', 'in-progress']);

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const eventType = event.queryStringParameters?.eventType;
    const status = event.queryStringParameters?.status;
    const seasonId = event.queryStringParameters?.seasonId;

    const { leagueOps: { events } } = getRepositories();

    let results: LeagueEvent[];

    if (eventType) {
      results = await events.listByEventType(eventType);
    } else if (status) {
      results = await events.listByStatus(status as LeagueEvent['status']);
    } else if (seasonId) {
      results = await events.listBySeason(seasonId);
    } else {
      results = await events.list();
    }

    // Sort by date descending (most recent first)
    results.sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    // INJ-07: flag injured participants on open events' scheduled matches.
    // One scheduled-match read, skipped while the injuries flag is off.
    const openEvents = results.filter((item) => OPEN_EVENT_STATUSES.has(item.status) && (item.matchCards?.length ?? 0) > 0);
    if (openEvents.length > 0 && (await injuryFlagsEnabled())) {
      try {
        const { competition: { matches } } = getRepositories();
        const scheduled = await matches.listByStatus('scheduled');
        const matchesById = new Map(scheduled.map((match) => [match.matchId, match]));
        const lookup = await buildInjuryLookup(eventCardMatches(openEvents, matchesById));
        return success(results.map((item) => (OPEN_EVENT_STATUSES.has(item.status)
          ? { ...item, ...eventInjuredParticipantsField(item, matchesById, lookup) }
          : item)));
      } catch (flagErr) {
        console.warn('getEvents: injury flags failed, returning events without them', flagErr);
      }
    }

    return success(results);
  } catch (err) {
    console.error('Error fetching events:', err);
    return serverError('Failed to fetch events');
  }
};
