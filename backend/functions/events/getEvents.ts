import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import type { LeagueEvent } from '../../lib/repositories/types';

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

    return success(results);
  } catch (err) {
    console.error('Error fetching events:', err);
    return serverError('Failed to fetch events');
  }
};
