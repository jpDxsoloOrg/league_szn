import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DEFAULT_WINDOW_DAYS = 60;

interface ParticipantRow {
  playerId: string;
  playerName: string;
  isFactionMember: boolean;
}

interface ScheduledMatchRow {
  matchId: string;
  scheduledFor: string;
  matchFormat: string;
  eventId: string | null;
  eventName: string | null;
  location: string | null;
  participants: ParticipantRow[];
}

/**
 * GET /stables/{stableId}/schedule?from=&to=&limit=
 *
 * Public read. Returns upcoming/scheduled matches involving any current member
 * of the faction, in the supplied time window. Default window is the next 60
 * days. Sorted by scheduledFor ascending.
 *
 * The membership pivot is the *current* memberIds — a wrestler who left the
 * faction last week won't have their upcoming matches in this list. (Past
 * matches are surfaced via FAC-07's stats endpoint.)
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const factionId = event.pathParameters?.stableId;
    if (!factionId) {
      return badRequest('stableId is required');
    }

    const qs = event.queryStringParameters || {};

    let limit = DEFAULT_LIMIT;
    if (qs.limit) {
      const parsed = Number(qs.limit);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return badRequest('limit must be a positive number');
      }
      limit = Math.min(Math.floor(parsed), MAX_LIMIT);
    }

    const now = new Date();
    const defaultTo = new Date(now.getTime() + DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const from = qs.from ? new Date(qs.from) : now;
    const to = qs.to ? new Date(qs.to) : defaultTo;
    if (Number.isNaN(from.getTime())) {
      return badRequest('from must be a valid ISO date');
    }
    if (Number.isNaN(to.getTime())) {
      return badRequest('to must be a valid ISO date');
    }
    if (from > to) {
      return badRequest('from must be before to');
    }

    const {
      roster: { stables: stablesRepo, players: playersRepo },
      competition: { matches: matchesRepo },
      leagueOps: { events: eventsRepo },
    } = getRepositories();

    const faction = await stablesRepo.findById(factionId);
    if (!faction) {
      return notFound('Faction not found');
    }

    const memberIds = new Set(faction.memberIds ?? []);

    const scheduled = await matchesRepo.listByStatus('scheduled');

    const fromMs = from.getTime();
    const toMs = to.getTime();

    const filtered = scheduled.filter((m) => {
      const t = new Date(m.date).getTime();
      if (Number.isNaN(t) || t < fromMs || t > toMs) return false;
      return (m.participants || []).some((pid) => memberIds.has(pid));
    });

    filtered.sort((a, b) => a.date.localeCompare(b.date));
    const sliced = filtered.slice(0, limit);

    // Hydrate participants + events in parallel batches.
    const playerIds = new Set<string>();
    const eventIds = new Set<string>();
    for (const m of sliced) {
      for (const pid of m.participants || []) playerIds.add(pid);
      if (m.eventId) eventIds.add(m.eventId);
    }

    const [playerEntries, eventEntries] = await Promise.all([
      Promise.all(
        Array.from(playerIds).map(async (pid) => [pid, await playersRepo.findById(pid)] as const),
      ),
      Promise.all(
        Array.from(eventIds).map(async (eid) => [eid, await eventsRepo.findById(eid)] as const),
      ),
    ]);

    const playerById = new Map(playerEntries);
    const eventById = new Map(eventEntries);

    const items: ScheduledMatchRow[] = sliced.map((m) => {
      const ev = m.eventId ? eventById.get(m.eventId) ?? null : null;
      return {
        matchId: m.matchId,
        scheduledFor: m.date,
        matchFormat: m.matchFormat || m.matchType || 'unknown',
        eventId: m.eventId ?? null,
        eventName: ev?.name ?? null,
        location: ev?.venue ?? null,
        participants: (m.participants || []).map((pid) => {
          const p = playerById.get(pid);
          return {
            playerId: pid,
            playerName: p?.name ?? 'Unknown',
            isFactionMember: memberIds.has(pid),
          };
        }),
      };
    });

    return success({ items });
  } catch (err) {
    console.error('Error computing faction schedule:', err);
    return serverError('Failed to compute faction schedule');
  }
};
