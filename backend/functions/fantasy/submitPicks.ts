import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { requireRole, getAuthContext } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { DEFAULT_CONFIG } from './getFantasyConfig';

interface SubmitPicksBody {
  picks: Record<string, string[]>;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const denied = requireRole(event, 'Fantasy');
    if (denied) return denied;

    const eventId = event.pathParameters?.eventId;
    if (!eventId) {
      return badRequest('Event ID is required');
    }

    const { sub: fantasyUserId, username } = getAuthContext(event);
    const { data: body, error: parseError } = parseBody<SubmitPicksBody>(event);
    if (parseError) return parseError;
    const { picks } = body;

    if (!picks || typeof picks !== 'object') {
      return badRequest('picks must be an object mapping divisionId to playerIds[]');
    }

    const { events, fantasy, players } = getRepositories();

    const eventItem = await events.findById(eventId);
    if (!eventItem) {
      return notFound('Event not found');
    }

    if (eventItem.status === 'completed' || eventItem.status === 'cancelled') {
      return badRequest('This event is no longer accepting picks');
    }

    if (eventItem.fantasyLocked) {
      return badRequest('Picks are locked for this event');
    }

    // Get config for defaults
    const config = await fantasy.getConfig() || DEFAULT_CONFIG;
    const budget = eventItem.fantasyBudget || config.defaultBudget || 500;
    const picksPerDivision = eventItem.fantasyPicksPerDivision || config.defaultPicksPerDivision || 2;

    // Fetch players and costs for validation
    const [allPlayers, allCosts] = await Promise.all([
      players.list(),
      fantasy.listAllCosts(),
    ]);

    const playerMap = new Map<string, typeof allPlayers[number]>();
    for (const p of allPlayers) {
      playerMap.set(p.playerId, p);
    }

    const costMap = new Map<string, number>();
    for (const c of allCosts) {
      costMap.set(c.playerId, c.currentCost || 100);
    }

    // Validate each pick
    const allPickedPlayers = new Set<string>();
    for (const [divisionId, playerIds] of Object.entries(picks)) {
      if (!Array.isArray(playerIds)) {
        return badRequest(`Picks for division ${divisionId} must be an array`);
      }

      if (playerIds.length > picksPerDivision) {
        return badRequest(
          `Too many picks for division ${divisionId}. Max: ${picksPerDivision}`
        );
      }

      for (const playerId of playerIds) {
        if (allPickedPlayers.has(playerId)) {
          return badRequest(`Player ${playerId} is picked in multiple divisions`);
        }
        allPickedPlayers.add(playerId);

        const player = playerMap.get(playerId);
        if (!player) {
          return badRequest(`Player ${playerId} not found`);
        }
        if (player.divisionId !== divisionId) {
          return badRequest(
            `Player ${player.name} does not belong to division ${divisionId}`
          );
        }
      }
    }

    // Calculate total cost
    let totalSpent = 0;
    for (const playerIds of Object.values(picks)) {
      for (const playerId of playerIds) {
        totalSpent += costMap.get(playerId) || 100;
      }
    }

    if (totalSpent > budget) {
      return badRequest(`Total cost $${totalSpent} exceeds budget $${budget}`);
    }

    // Check for existing picks (to preserve createdAt)
    const existingPick = await fantasy.findPick(eventId, fantasyUserId);

    const pickRecord = await fantasy.savePick(
      {
        eventId,
        fantasyUserId,
        username,
        picks,
        totalSpent,
      },
      existingPick?.createdAt,
    );

    return success(pickRecord);
  } catch (err) {
    console.error('Error submitting picks:', err);
    return serverError('Failed to submit picks');
  }
};
