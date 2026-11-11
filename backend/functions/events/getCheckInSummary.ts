import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { badRequest, notFound, serverError, success, unauthorized } from '../../lib/response';
import { getAuthContext } from '../../lib/auth';
import { isDeactivated } from '../../lib/discipline';

interface CheckInSummary {
  eventId: string;
  available: number;
  tentative: number;
  unavailable: number;
  total: number;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    try {
      getAuthContext(event);
    } catch {
      return unauthorized();
    }

    const eventId = event.pathParameters?.eventId;
    if (!eventId) {
      return badRequest('eventId is required');
    }

    const { leagueOps: { events }, roster: { players } } = getRepositories();

    const eventItem = await events.findById(eventId);
    if (!eventItem) {
      return notFound('Event not found');
    }

    const checkIns = await events.listCheckIns(eventId);

    // Same rule as getCheckIns, so the counts and the booking list agree.
    const deactivatedIds = new Set(
      (await players.list()).filter(isDeactivated).map((player) => player.playerId),
    );

    const summary: CheckInSummary = {
      eventId,
      available: 0,
      tentative: 0,
      unavailable: 0,
      total: 0,
    };

    for (const row of checkIns) {
      if (deactivatedIds.has(row.playerId)) continue;
      if (row.status === 'available') {
        summary.available += 1;
      } else if (row.status === 'tentative') {
        summary.tentative += 1;
      } else if (row.status === 'unavailable') {
        summary.unavailable += 1;
      }
      summary.total += 1;
    }

    return success(summary);
  } catch (err) {
    console.error('Error getting check-in summary:', err);
    return serverError('Failed to get check-in summary');
  }
};
