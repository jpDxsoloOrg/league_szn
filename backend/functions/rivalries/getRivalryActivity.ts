import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { authenticate } from '../../lib/authenticate';
import { getAuthContext, hasRole } from '../../lib/auth';
import type {
  Rivalry,
  RivalryActivityItem,
  RivalryActivityPage,
  RivalryMessageAudience,
  RivalryNoteVisibility,
} from '../../lib/repositories';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MEMO_TTL_MS = 30_000;

interface MemoEntry {
  page: RivalryActivityPage;
  expiresAt: number;
}

/**
 * Per-Lambda-instance memo. Cheap protection against the Hub re-firing
 * this endpoint several times within a single render cycle. Reset
 * automatically on cold start; manual reset is exposed for tests.
 */
const memo = new Map<string, MemoEntry>();

export function _resetMemoForTesting(): void {
  memo.clear();
}

function parseLimit(raw: string | undefined): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

/**
 * GET /rivalries/activity
 *
 * Merges messages, promos, matches, and notes across the caller's
 * visible rivalries into one chronologically-sorted page. Public read;
 * auth is optional — if a bearer token is present we widen the audience
 * filter (participants see participant-only items, admins see all).
 *
 * Matches and promos are currently joined to rivalries by participant
 * overlap (same heuristic the hydrated detail handler uses). When RIV-06
 * persists `rivalryId` directly on those records this can switch to a
 * cheaper direct lookup without changing the response shape.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const qp = event.queryStringParameters || {};
    const eventId = qp.eventId || undefined;
    const cursor = qp.cursor || undefined;
    const limit = parseLimit(qp.limit ?? undefined);

    // Optional auth: failures fall back to anonymous so the public feed
    // still serves the safe view to logged-out readers.
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
      roster: { players },
    } = getRepositories();

    // Default participantId to the caller's own playerId so authed users
    // see their own feed without having to pass an explicit filter.
    let participantId = qp.participantId || undefined;
    let callerPlayerId: string | undefined;
    if (auth.sub) {
      const callerPlayer = await players.findByUserId(auth.sub).catch(() => null);
      callerPlayerId = callerPlayer?.playerId;
      if (!participantId) participantId = callerPlayerId;
    }

    // Role-scoped memoization: different audiences see different items,
    // so the cache key must factor in the caller's visibility tier.
    const roleKey = isAdmin ? 'admin' : callerPlayerId ? 'participant' : 'public';
    const key = [roleKey, participantId ?? '', eventId ?? '', cursor ?? '', String(limit)].join('|');
    const now = Date.now();
    const cached = memo.get(key);
    if (cached && cached.expiresAt > now) {
      return success(cached.page);
    }

    // Visible rivalry set: by participant when scoped, else active feed.
    const visibleResult = participantId
      ? await rivalries.listByParticipant(participantId, { limit: limit * 2 })
      : await rivalries.listByStatus('active', { limit: limit * 2 });
    let visible: Rivalry[] = visibleResult.items;

    // Event filter: join via matches to find rivalry participant pairs
    // that have a match on the requested event.
    if (eventId) {
      const allMatches = await matches.list();
      const eventPairs = new Set<string>();
      for (const m of allMatches) {
        if (m.eventId !== eventId) continue;
        if (!m.participants || m.participants.length < 2) continue;
        eventPairs.add([...m.participants].sort().join('|'));
      }
      visible = visible.filter((r) => {
        const pairKey = r.participants
          .map((p) => p.playerId)
          .sort()
          .join('|');
        return eventPairs.has(pairKey);
      });
    }

    if (visible.length === 0) {
      const empty: RivalryActivityPage = { items: [], nextCursor: null };
      memo.set(key, { page: empty, expiresAt: now + MEMO_TTL_MS });
      return success(empty);
    }

    // Fan out: cap each source pull so a single rivalry with thousands
    // of messages can't swamp the merge. limit * 2 is enough headroom
    // for one round-trip of pagination per source.
    const perSourceCap = limit * 2;
    const [messagesBySource, notesBySource, allMatches, promosBySource] = await Promise.all([
      Promise.all(
        visible.map((r) =>
          rivalryMessages
            .list(r.rivalryId, { limit: perSourceCap })
            .then((p) => ({ rivalry: r, items: p.items })),
        ),
      ),
      Promise.all(
        visible.map((r) =>
          rivalryNotes
            .listByRivalry(r.rivalryId)
            .then((items) => ({ rivalry: r, items: items.slice(0, perSourceCap) })),
        ),
      ),
      matches.list(),
      Promise.all(
        visible.map(async (r) => {
          const perPlayer = await Promise.all(
            r.participants.map((p) => promos.listByPlayer(p.playerId)),
          );
          return { rivalry: r, items: perPlayer.flat().slice(0, perSourceCap) };
        }),
      ),
    ]);

    const items: RivalryActivityItem[] = [];

    for (const { rivalry, items: msgs } of messagesBySource) {
      const isParticipant = isCallerParticipant(rivalry, callerPlayerId);
      const allowed = computeAllowedAudience(isAdmin, isParticipant);
      for (const m of msgs) {
        if (!allowed.has(m.audience)) continue;
        items.push({
          kind: 'message',
          rivalryId: m.rivalryId,
          messageId: m.messageId,
          authorPlayerId: m.authorPlayerId,
          body: m.body,
          audience: m.audience,
          occurredAt: m.createdAt,
        });
      }
    }

    for (const { rivalry, items: ns } of notesBySource) {
      const isParticipant = isCallerParticipant(rivalry, callerPlayerId);
      const allowed = computeAllowedVisibility(isAdmin, isParticipant);
      for (const n of ns) {
        if (!allowed.has(n.visibility)) continue;
        items.push({
          kind: 'note',
          rivalryId: n.rivalryId,
          noteId: n.noteId,
          noteType: n.noteType,
          visibility: n.visibility,
          body: n.body,
          authorPlayerId: n.authorPlayerId,
          occurredAt: n.updatedAt || n.createdAt,
        });
      }
    }

    // Matches: heuristic join by participant overlap (every match
    // participant must also be a rivalry participant, and the match
    // must contain at least two of them). Switches to a direct lookup
    // once RIV-06 persists rivalryId on matches.
    for (const r of visible) {
      const set = new Set(r.participants.map((p) => p.playerId));
      const matched = allMatches.filter((m) => {
        if (!m.participants || m.participants.length < 2) return false;
        let hits = 0;
        for (const pid of m.participants) {
          if (set.has(pid)) hits++;
          else return false;
        }
        return hits >= 2;
      });
      const sorted = [...matched]
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, perSourceCap);
      for (const m of sorted) {
        items.push({
          kind: 'match',
          rivalryId: r.rivalryId,
          matchId: m.matchId,
          participants: m.participants,
          winners: m.winners,
          status: m.status,
          isChampionship: m.isChampionship,
          eventId: m.eventId,
          occurredAt: m.date,
        });
      }
    }

    for (const { rivalry, items: ps } of promosBySource) {
      for (const p of ps) {
        items.push({
          kind: 'promo',
          rivalryId: rivalry.rivalryId,
          promoId: p.promoId,
          authorPlayerId: p.playerId,
          title: p.title,
          content: p.content,
          occurredAt: p.createdAt,
        });
      }
    }

    items.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));

    // Cursor pagination: tail item's occurredAt becomes the next cursor.
    // Strict less-than skips ties at the boundary, which is acceptable
    // given the per-source cap is the harder limit on completeness.
    const afterCursor = cursor ? items.filter((it) => it.occurredAt < cursor) : items;
    const page = afterCursor.slice(0, limit);
    const nextCursor =
      afterCursor.length > limit ? page[page.length - 1].occurredAt : null;

    const result: RivalryActivityPage = { items: page, nextCursor };
    memo.set(key, { page: result, expiresAt: now + MEMO_TTL_MS });
    return success(result);
  } catch (err) {
    console.error('Error building rivalry activity feed:', err);
    return serverError('Failed to load rivalry activity');
  }
};

function isCallerParticipant(
  rivalry: Rivalry,
  callerPlayerId: string | undefined,
): boolean {
  if (!callerPlayerId) return false;
  return rivalry.participants.some((p) => p.playerId === callerPlayerId);
}

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
