import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { created, badRequest, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';
import { getAuthContext } from '../../lib/auth';
import { isPlayerVisible, TARGET_NEEDS_WRESTLER_MESSAGE } from '../../lib/needsWrestler';
import { bookingRefusal } from '../../lib/discipline';
import { recalculateContenderRankings } from '../../lib/services/recalculateContenderRankings';

interface SetOverrideBody {
  championshipId: string;
  playerId: string;
  overrideType: 'bump_to_top' | 'send_to_bottom';
  reason: string;
  expiresAt?: string;
}

const VALID_OVERRIDE_TYPES = ['bump_to_top', 'send_to_bottom'] as const;

/** Where the override left the player, so staff are told what really happened. */
export type OverridePlacement =
  | { status: 'onList'; rank: number }
  | { status: 'notOnList' | 'noActiveSeason' | 'recalculationFailed'; rank: null };

/**
 * Recalculates the title and reads back the player's position. This runs in the
 * request rather than async because the answer is the point: the caller reports
 * it to staff. The override is already saved, so a failure here doesn't lose it.
 */
async function placeOverride(championshipId: string, playerId: string): Promise<OverridePlacement> {
  try {
    const summary = await recalculateContenderRankings(championshipId, { overrideChange: true });
    if (summary.championshipsFailed > 0) return { status: 'recalculationFailed', rank: null };
    if (summary.championshipsProcessed === 0) return { status: 'noActiveSeason', rank: null };

    const { competition: { contenders } } = getRepositories();
    const rankings = await contenders.listByChampionship(championshipId);
    const row = rankings.find((ranking) => ranking.playerId === playerId);
    return row ? { status: 'onList', rank: row.rank } : { status: 'notOnList', rank: null };
  } catch (err) {
    console.warn('Failed to recalculate rankings after setting an override:', err);
    return { status: 'recalculationFailed', rank: null };
  }
}

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

    // Same comparison the recalculation makes, so an override that would never
    // apply is refused here instead of being reported as a success.
    if (expiresAt && expiresAt <= new Date().toISOString()) {
      return badRequest('expiresAt must be in the future');
    }

    const { competition: { championships, contenders }, roster: { players } } = getRepositories();

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

    const bookingBlocked = bookingRefusal(player);
    if (bookingBlocked) return bookingBlocked;

    // A hidden player can't be ranked, so the override could never show
    if (!isPlayerVisible(player)) {
      return badRequest(TARGET_NEEDS_WRESTLER_MESSAGE);
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

    const placement = await placeOverride(championshipId, playerId);

    return created({ ...override, placement });
  } catch (err) {
    console.error('Error setting contender override:', err);
    return serverError('Failed to set contender override');
  }
};
