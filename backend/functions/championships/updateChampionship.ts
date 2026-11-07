import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories, NotFoundError } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';
import { championIdsOf, firstBookingRefusal, newlyAddedIds } from '../../lib/disciplineGates';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const championshipId = event.pathParameters?.championshipId;

    if (!championshipId) {
      return badRequest('Championship ID is required');
    }

    const { data: body, error: parseError } = parseBody(event);
    if (parseError) return parseError;

    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.type !== undefined) patch.type = body.type;
    if (body.imageUrl !== undefined) patch.imageUrl = body.imageUrl;
    if (body.isActive !== undefined) patch.isActive = body.isActive;
    if (body.currentChampion !== undefined) patch.currentChampion = body.currentChampion;
    if (body.divisionId !== undefined) patch.divisionId = body.divisionId;

    if (Object.keys(patch).length === 0) {
      return badRequest('No valid fields to update');
    }

    const { competition: { championships } } = getRepositories();

    if (body.currentChampion !== undefined) {
      const existing = await championships.findById(championshipId);
      if (!existing) return notFound('Championship not found');

      const addedIds = newlyAddedIds(championIdsOf(body.currentChampion), championIdsOf(existing.currentChampion));
      const { roster: { players } } = getRepositories();
      const addedPlayers = await Promise.all(addedIds.map((id) => players.findById(id)));
      const bookingBlocked = firstBookingRefusal(addedPlayers);
      if (bookingBlocked) return bookingBlocked;
    }

    const updated = await championships.update(championshipId, patch);

    return success(updated);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return notFound('Championship not found');
    }
    console.error('Error updating championship:', err);
    return serverError('Failed to update championship');
  }
};
