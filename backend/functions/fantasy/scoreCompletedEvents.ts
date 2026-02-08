import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
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

    // Find all completed events
    const completedEvents = await dynamoDb.scanAll({
      TableName: TableNames.EVENTS,
      FilterExpression: '#status = :completed',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':completed': 'completed' },
    });

    // Find all picks that have no pointsEarned set (unscored)
    const allPicks = await dynamoDb.scanAll({
      TableName: TableNames.FANTASY_PICKS,
    });

    const completedEventIds = new Set(completedEvents.map((e) => e.eventId as string));

    // Find event IDs that have unscored picks
    const unscoredEventIds = new Set<string>();
    for (const pick of allPicks) {
      const eventId = pick.eventId as string;
      if (
        completedEventIds.has(eventId) &&
        (pick.pointsEarned === undefined || pick.pointsEarned === null)
      ) {
        unscoredEventIds.add(eventId);
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
