import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { calculateFantasyPoints } from './calculateFantasyPoints';

/**
 * Scores all completed events that have unscored fantasy picks.
 * Called by the dashboard on load to ensure retroactive scoring.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const denied = requireRole(event, 'Fantasy');
    if (denied) return denied;

    const { events, fantasy } = getRepositories();

    // Find all completed events
    const allEvents = await events.list();
    const completedEvents = allEvents.filter((e) => e.status === 'completed');
    const completedEventIds = new Set(completedEvents.map((e) => e.eventId));

    // Find all picks that have no pointsEarned set (unscored)
    const allPicks = await fantasy.listAllPicks();

    // Find event IDs that have unscored picks
    const unscoredEventIds = new Set<string>();
    for (const pick of allPicks) {
      if (
        completedEventIds.has(pick.eventId) &&
        (pick.pointsEarned === undefined || pick.pointsEarned === null)
      ) {
        unscoredEventIds.add(pick.eventId);
      }
    }

    // Score each unscored event
    const scored: string[] = [];
    for (const eventId of unscoredEventIds) {
      try {
        await calculateFantasyPoints(eventId);
        scored.push(eventId);
      } catch (err) {
        console.warn(`Failed to score event ${eventId}:`, err);
      }
    }

    return success({
      message: `Scored ${scored.length} event(s)`,
      scoredEventIds: scored,
    });
  } catch (err) {
    console.error('Error scoring events:', err);
    return serverError('Failed to score events');
  }
};
