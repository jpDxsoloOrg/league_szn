import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { withoutInjuryOverrideActors } from '../../lib/injuries/bookingGate';

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const { competition: { tournaments } } = getRepositories();
    const items = await tournaments.list();

    // Sort by creation date descending (most recent first)
    const sorted = items.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // INJ-06: a public route, so never say which GM booked an injured player.
    return success(sorted.map(withoutInjuryOverrideActors));
  } catch (err) {
    console.error('Error fetching tournaments:', err);
    return serverError('Failed to fetch tournaments');
  }
};
