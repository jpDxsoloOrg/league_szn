import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const championshipId = event.pathParameters?.championshipId;

    if (!championshipId) {
      return badRequest('Championship ID is required');
    }

    const { competition: { championships }, runInTransaction } = getRepositories();

    const championship = await championships.findById(championshipId);
    if (!championship) {
      return notFound('Championship not found');
    }

    if (!championship.currentChampion) {
      return badRequest('Championship is already vacant');
    }

    // Find the current reign to close it
    const currentReign = await championships.findCurrentReign(championshipId);

    await runInTransaction(async (tx) => {
      // Remove current champion from the championship
      tx.removeChampion(championshipId);

      // Close the current reign in championship history
      if (currentReign) {
        const wonDate = new Date(currentReign.wonDate);
        const lostDate = new Date();
        const daysHeld = Math.floor((lostDate.getTime() - wonDate.getTime()) / (1000 * 60 * 60 * 24));

        tx.closeReign(championshipId, currentReign.wonDate, lostDate.toISOString(), daysHeld);
      }
    });

    // Return the updated championship
    const updated = await championships.findById(championshipId);

    return success(updated);
  } catch (err) {
    console.error('Error vacating championship:', err);
    return serverError('Failed to vacate championship');
  }
};
