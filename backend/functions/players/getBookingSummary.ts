import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type { Match } from '../../lib/repositories/types';
import { success, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { computeRecentFormAndStreak, type FormResult } from '../../lib/recentForm';

export interface PlayerBookingInfo {
  /** ISO date of the most recent match the player is on; null = never booked. */
  lastBookedAt: string | null;
  lastBookedMatchId?: string;
  lastBookedEventId?: string;
  /** Current run of identical results, newest first. count 0 = no completed matches. */
  currentStreak: { type: FormResult; count: number };
}

/** Everyone on the match: explicit participants plus anyone holding a slot. */
function playerIdsOn(match: Match): string[] {
  const ids = new Set<string>(match.participants ?? []);
  for (const slot of match.slots ?? []) {
    if (slot.playerId) ids.add(slot.playerId);
  }
  return [...ids];
}

/** A match that puts its players "on a card": anything not cancelled. */
const BOOKED_STATUSES = new Set<Match['status']>(['scheduled', 'open-signups', 'completed']);

/**
 * GET /players/booking-summary — staff only. One row per player with when
 * they were last put on a card (scheduled, open-signups or completed;
 * cancelled ignored) and their current streak, so booking pickers can
 * surface under-used wrestlers first.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const { roster: { players }, competition: { matches } } = getRepositories();
    // One scan, partitioned in memory — a filtered scan reads every item
    // anyway, so separate per-status calls would just multiply the cost.
    const [allPlayers, allMatches] = await Promise.all([players.list(), matches.list()]);
    const booked = allMatches.filter((m) => BOOKED_STATUSES.has(m.status));
    const completed = booked.filter((m) => m.status === 'completed');

    const latestByPlayer = new Map<string, Match>();
    for (const match of booked) {
      if (!match.date) continue;
      for (const playerId of playerIdsOn(match)) {
        const current = latestByPlayer.get(playerId);
        if (!current || match.date > current.date) latestByPlayer.set(playerId, match);
      }
    }

    const summary: Record<string, PlayerBookingInfo> = {};
    for (const player of allPlayers) {
      const latest = latestByPlayer.get(player.playerId);
      const { currentStreak } = computeRecentFormAndStreak(player.playerId, completed);
      summary[player.playerId] = {
        lastBookedAt: latest?.date ?? null,
        ...(latest ? { lastBookedMatchId: latest.matchId } : {}),
        ...(latest?.eventId ? { lastBookedEventId: latest.eventId } : {}),
        currentStreak,
      };
    }

    return success(summary);
  } catch (err) {
    console.error('Error building booking summary:', err);
    return serverError('Failed to build booking summary');
  }
};
