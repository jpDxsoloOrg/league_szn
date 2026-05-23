import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { authenticate } from '../../lib/authenticate';
import { getAuthContext, hasRole } from '../../lib/auth';
import type {
  Rivalry,
  RivalryMessage,
  RivalryMessageAudience,
  RivalryNote,
  RivalryNoteVisibility,
} from '../../lib/repositories';

const MAX_PROMOS = 5;
const MAX_MESSAGES = 3;

interface HeadToHead {
  totalMatches: number;
  championshipMatches: number;
  lastMatchDate?: string;
  recentMatchIds: string[];
  /** Wins per participant playerId. */
  winsByParticipant: Record<string, number>;
  draws: number;
}

interface UpcomingEvent {
  eventId: string;
  name: string;
  date: string;
  eventType: string;
  venue?: string;
}

interface HydratedRivalry {
  rivalry: Rivalry;
  headToHead: HeadToHead;
  nextEvent: UpcomingEvent | null;
  recentPromos: Array<{
    promoId: string;
    playerId: string;
    title?: string;
    content: string;
    createdAt: string;
  }>;
  recentMessages: RivalryMessage[];
  notes: RivalryNote[];
}

/**
 * GET /rivalry-requests/{rivalryId}
 *
 * Public read access. If a valid bearer token is present the response also
 * surfaces participant-only messages and (for admins/moderators) booker
 * notes + moderationNote. Anonymous callers see only the public-safe view.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const rivalryId = event.pathParameters?.rivalryId;
    if (!rivalryId) return badRequest('rivalryId is required');

    // Optional auth: failures are silently treated as anonymous so the
    // public endpoint still serves the safe view to logged-out readers.
    if (event.headers?.Authorization || event.headers?.authorization) {
      await authenticate(event).catch(() => undefined);
    }
    const auth = getAuthContext(event);
    const isAdmin = hasRole(auth, 'Admin');

    const {
      rivalries,
      rivalryMessages,
      rivalryNotes,
      competition: { matches },
      content: { promos },
      leagueOps: { events },
      roster: { players },
    } = getRepositories();

    const rivalry = await rivalries.get(rivalryId);
    if (!rivalry) return notFound('Rivalry not found');

    const participantIds = rivalry.participants.map((p) => p.playerId);
    const participantSet = new Set(participantIds);
    const callerPlayer = auth.sub
      ? await players.findByUserId(auth.sub).catch(() => null)
      : null;
    const callerIsParticipant = !!callerPlayer && participantSet.has(callerPlayer.playerId);

    const messageAudience = computeAllowedAudience(isAdmin, callerIsParticipant);
    const noteVisibility = computeAllowedVisibility(isAdmin, callerIsParticipant);

    // Run independent fetches in parallel.
    const [allMatches, perPlayerPromos, upcomingEvents, messagesPage, allNotes] =
      await Promise.all([
        matches.list(),
        Promise.all(participantIds.map((pid) => promos.listByPlayer(pid))),
        events.listByStatus('upcoming'),
        rivalryMessages.list(rivalryId, { limit: MAX_MESSAGES * 4 }),
        rivalryNotes.listByRivalry(rivalryId),
      ]);

    const headToHead = computeHeadToHead(allMatches, participantIds, {
      startedAt: rivalry.startedAt,
      endedAt: rivalry.endedAt,
    });
    const nextEvent = pickNextEvent(upcomingEvents, allMatches, participantSet, {
      startedAt: rivalry.startedAt,
      endedAt: rivalry.endedAt,
    });

    const recentPromos = perPlayerPromos
      .flat()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, MAX_PROMOS)
      .map((p) => ({
        promoId: p.promoId,
        playerId: p.playerId,
        title: p.title,
        content: p.content,
        targetPlayerId: p.targetPlayerId,
        rivalryId: p.rivalryId,
        createdAt: p.createdAt,
      }));

    const recentMessages = messagesPage.items
      .filter((m) => messageAudience.has(m.audience))
      .slice(0, MAX_MESSAGES);

    const notes = allNotes.filter((n) => noteVisibility.has(n.visibility));

    const payload: HydratedRivalry = {
      rivalry: sanitizeRivalry(rivalry, isAdmin),
      headToHead,
      nextEvent,
      recentPromos,
      recentMessages,
      notes,
    };

    return success(payload);
  } catch (err) {
    console.error('Error fetching rivalry:', err);
    return serverError('Failed to fetch rivalry');
  }
};

function computeAllowedAudience(
  isAdmin: boolean,
  isParticipant: boolean,
): Set<RivalryMessageAudience> {
  if (isAdmin) return new Set(['all', 'participants', 'admins']);
  if (isParticipant) return new Set(['all', 'participants']);
  return new Set(['all']);
}

function computeAllowedVisibility(
  isAdmin: boolean,
  isParticipant: boolean,
): Set<RivalryNoteVisibility> {
  if (isAdmin) return new Set(['all', 'participants', 'admins']);
  if (isParticipant) return new Set(['all', 'participants']);
  return new Set(['all']);
}

function sanitizeRivalry(r: Rivalry, isAdmin: boolean): Rivalry {
  if (isAdmin) return r;
  const { moderationNote, ...rest } = r;
  void moderationNote;
  return rest as Rivalry;
}

interface MatchLite {
  matchId: string;
  date: string;
  participants?: string[];
  winners?: string[];
  isDraw?: boolean;
  isChampionship?: boolean;
  status: string;
  eventId?: string;
}

interface RivalryWindow {
  startedAt?: string;
  endedAt?: string;
}

function isWithinWindow(date: string, window: RivalryWindow): boolean {
  if (window.startedAt && date < window.startedAt) return false;
  if (window.endedAt && date > window.endedAt) return false;
  return true;
}

function computeHeadToHead(
  allMatches: MatchLite[],
  participantIds: string[],
  window: RivalryWindow = {},
): HeadToHead {
  const set = new Set(participantIds);
  const completed = allMatches.filter((m) => {
    if (m.status !== 'completed') return false;
    if (!m.participants || m.participants.length < 2) return false;
    if (!isWithinWindow(m.date, window)) return false;
    // The match must include at least two of the rivalry's participants.
    // Outsiders are tolerated (e.g. a triple-threat with the two rivals +
    // a third party still counts toward the rivalry's H2H).
    let hits = 0;
    for (const pid of m.participants) {
      if (set.has(pid)) hits++;
    }
    return hits >= 2;
  });

  const winsByParticipant: Record<string, number> = {};
  for (const pid of participantIds) winsByParticipant[pid] = 0;
  let draws = 0;
  let championshipMatches = 0;
  let lastMatchDate: string | undefined;

  const sorted = [...completed].sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const m of sorted) {
    if (m.isChampionship) championshipMatches++;
    if (m.isDraw) {
      draws++;
    } else if (m.winners && m.winners.length > 0) {
      for (const w of m.winners) {
        if (set.has(w)) {
          winsByParticipant[w] = (winsByParticipant[w] ?? 0) + 1;
        }
      }
    }
    if (!lastMatchDate || m.date > lastMatchDate) lastMatchDate = m.date;
  }

  return {
    totalMatches: completed.length,
    championshipMatches,
    lastMatchDate,
    recentMatchIds: sorted.slice(0, 5).map((m) => m.matchId),
    winsByParticipant,
    draws,
  };
}

interface UpcomingEventLite {
  eventId: string;
  name: string;
  date: string;
  eventType: string;
  venue?: string;
  status: string;
}

function pickNextEvent(
  upcoming: UpcomingEventLite[],
  allMatches: MatchLite[],
  participantSet: Set<string>,
  window: RivalryWindow = {},
): UpcomingEvent | null {
  // Match an upcoming event to the rivalry only if it has a scheduled match
  // featuring the rivalry's participant set, AND the match falls within the
  // rivalry's lifecycle window.
  const matchedEventIds = new Set<string>();
  for (const m of allMatches) {
    if (m.status !== 'scheduled' || !m.eventId || !m.participants) continue;
    if (!isWithinWindow(m.date, window)) continue;
    const overlap = m.participants.filter((p) => participantSet.has(p)).length;
    if (overlap >= 2) matchedEventIds.add(m.eventId);
  }
  const candidates = upcoming
    .filter((e) => matchedEventIds.has(e.eventId))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (candidates.length === 0) return null;
  const next = candidates[0];
  return {
    eventId: next.eventId,
    name: next.name,
    date: next.date,
    eventType: next.eventType,
    venue: next.venue,
  };
}
