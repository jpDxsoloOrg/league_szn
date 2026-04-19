import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { competition: { tournaments } } = getRepositories();
    const tournamentId = event.pathParameters?.tournamentId;

    if (!tournamentId) {
      return badRequest('Tournament ID is required');
    }

    const { data: body, error: parseError } = parseBody<Record<string, unknown>>(event);
    if (parseError) return parseError;

    const existing = await tournaments.findById(tournamentId);
    if (!existing) {
      return notFound('Tournament not found');
    }

    const patch: Record<string, unknown> = {};
    if (body.status !== undefined) patch.status = body.status;
    if (body.winner !== undefined) patch.winner = body.winner;
    if (body.brackets !== undefined) patch.brackets = body.brackets;
    if (body.standings !== undefined) patch.standings = body.standings;

    if (Object.keys(patch).length === 0) {
      return badRequest('No valid fields to update');
    }

    const updated = await tournaments.update(tournamentId, patch);
    return success(updated);
  } catch (err) {
    console.error('Error updating tournament:', err);
    return serverError('Failed to update tournament');
  }
};
