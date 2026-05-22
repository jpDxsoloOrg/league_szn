import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, serverError } from '../../lib/response';
import type { Rivalry, RivalryStatus } from '../../lib/repositories';

const VALID_STATUS: ReadonlyArray<RivalryStatus> = [
  'pending',
  'active',
  'completed',
  'rejected',
  'cancelled',
];

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function parseLimit(raw: string | undefined): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

/**
 * Public list endpoint for persistent rivalries.
 *
 * Filters: status, participantId, seasonId, eventId, cursor, limit. The
 * primary DynamoDB query is driven by participantId (preferred) → status
 * (next) → status=active (default), and any remaining filters are applied
 * in-memory. seasonId/eventId join via the matches table.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const qp = event.queryStringParameters || {};
    const statusFilter = qp.status as RivalryStatus | undefined;
    const participantId = qp.participantId || undefined;
    const seasonId = qp.seasonId || undefined;
    const eventId = qp.eventId || undefined;
    const cursor = qp.cursor || undefined;
    const limit = parseLimit(qp.limit ?? undefined);

    if (statusFilter && !VALID_STATUS.includes(statusFilter)) {
      return badRequest(`status must be one of: ${VALID_STATUS.join(', ')}`);
    }

    const { rivalries, competition: { matches } } = getRepositories();

    let primary: { items: Rivalry[]; nextCursor?: string };
    if (participantId) {
      primary = await rivalries.listByParticipant(participantId, { limit, cursor });
    } else if (statusFilter) {
      primary = await rivalries.listByStatus(statusFilter, { limit, cursor });
    } else {
      // Public default: show ongoing storylines, not the moderation backlog.
      primary = await rivalries.listByStatus('active', { limit, cursor });
    }

    let items: Rivalry[] = primary.items;

    // In-memory filters that don't fit the primary index.
    if (participantId && statusFilter) {
      items = items.filter((r) => r.status === statusFilter);
    }

    if (seasonId || eventId) {
      const allMatches = await matches.list();
      const inScope = allMatches.filter((m) => {
        if (seasonId && m.seasonId !== seasonId) return false;
        if (eventId && m.eventId !== eventId) return false;
        return true;
      });
      const scopedParticipantPairs = new Set<string>();
      for (const m of inScope) {
        if (!m.participants || m.participants.length < 2) continue;
        const key = [...m.participants].sort().join('|');
        scopedParticipantPairs.add(key);
      }
      items = items.filter((r) => {
        const key = r.participants
          .map((p) => p.playerId)
          .sort()
          .join('|');
        return scopedParticipantPairs.has(key);
      });
    }

    // Sensitive fields are filtered server-side per ticket note.
    const sanitized = items.map(sanitizeRivalry);

    return success({
      rivalries: sanitized,
      nextCursor: primary.nextCursor ?? null,
    });
  } catch (err) {
    console.error('Error listing rivalries:', err);
    return serverError('Failed to list rivalries');
  }
};

/**
 * Strip booker-only fields (moderationNote) from the public payload. The
 * authenticated detail handler (getRivalry) re-applies role-based gating
 * before returning the full record.
 */
function sanitizeRivalry(r: Rivalry): Omit<Rivalry, 'moderationNote'> {
  const { moderationNote, ...rest } = r;
  void moderationNote;
  return rest;
}
