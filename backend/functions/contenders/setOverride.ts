import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { created, badRequest, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';
import { getAuthContext } from '../../lib/auth';
import { invokeAsync } from '../../lib/asyncLambda';

interface SetOverrideBody {
  championshipId: string;
  playerId: string;
  overrideType: 'bump_to_top' | 'send_to_bottom';
  reason: string;
  expiresAt?: string;
}

const VALID_OVERRIDE_TYPES = ['bump_to_top', 'send_to_bottom'] as const;

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { data, error } = parseBody<SetOverrideBody>(event);
    if (error) return error;

    const { championshipId, playerId, overrideType, reason, expiresAt } = data;

    // Validate required fields
    if (!championshipId || !playerId || !overrideType || !reason) {
      return badRequest('championshipId, playerId, overrideType, and reason are required');
    }

    if (!VALID_OVERRIDE_TYPES.includes(overrideType as typeof VALID_OVERRIDE_TYPES[number])) {
      return badRequest('overrideType must be "bump_to_top" or "send_to_bottom"');
    }

    if (typeof reason !== 'string' || reason.trim().length === 0) {
      return badRequest('reason must be a non-empty string');
    }

    const { championships, players, contenders } = getRepositories();

    // Validate championship exists and is active
    const championship = await championships.findById(championshipId);
    if (!championship) {
      return badRequest('Championship not found');
    }

    if (!championship.isActive) {
      return badRequest('Championship is not active');
    }

    // Validate player exists
    const player = await players.findById(playerId);
    if (!player) {
      return badRequest('Player not found');
    }

    // Player must not be the current champion
    const currentChampion = championship.currentChampion;
    if (currentChampion) {
      const championIds = Array.isArray(currentChampion) ? currentChampion : [currentChampion];
      if (championIds.includes(playerId)) {
        return badRequest('Cannot set override for the current champion');
      }
    }

    // If championship is division-locked, player must be in that division
    const champDivisionId = (championship as unknown as Record<string, unknown>).divisionId as string | undefined;
    if (champDivisionId && player.divisionId !== champDivisionId) {
      return badRequest('Player is not in the division required for this championship');
    }

    const auth = getAuthContext(event);

    // Deactivate existing active override for this player/championship
    const existingOverride = await contenders.findOverride(championshipId, playerId);
    if (existingOverride && existingOverride.active) {
      await contenders.deactivateOverride(championshipId, playerId, 'replaced by new override');
    }

    // Write new override
    const override = await contenders.createOverride({
      championshipId,
      playerId,
      overrideType,
      reason: reason.trim(),
      createdBy: auth.username || 'admin',
      ...(expiresAt ? { expiresAt } : {}),
    });

    // Trigger ranking recalculation for this championship
    try {
      await invokeAsync('contenders', { source: 'recordResult', championshipId });
    } catch (err) {
      console.warn('Failed to invoke calculateRankings async:', err);
    }

    return created(override);
  } catch (err) {
    console.error('Error setting contender override:', err);
    return serverError('Failed to set contender override');
  }
};
