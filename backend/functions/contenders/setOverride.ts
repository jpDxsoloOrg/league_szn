import type { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { created, badRequest, serverError } from '../../lib/response';
import type { Championship } from '../../lib/repositories/types';
import { parseBody } from '../../lib/parseBody';
import { getAuthContext } from '../../lib/auth';
import { isPlayerVisible, TARGET_NEEDS_WRESTLER_MESSAGE } from '../../lib/needsWrestler';
import { bookingRefusal } from '../../lib/discipline';
import { recalculateContenderRankings } from '../../lib/services/recalculateContenderRankings';

/**
 * A singles title takes `playerId`. A tag title takes `tagTeamId` (an active
 * team) and refuses `playerId`, because it ranks teams, not players.
 */
interface SetOverrideBody {
  championshipId: string;
  playerId?: string;
  tagTeamId?: string;
  overrideType: 'bump_to_top' | 'send_to_bottom';
  reason: string;
  expiresAt?: string;
}

const VALID_OVERRIDE_TYPES = ['bump_to_top', 'send_to_bottom'] as const;

type OverrideEntityType = 'player' | 'tagTeam';

/** The entity an override will target, or the response refusing it. */
type TargetCheck =
  | { entityType: OverrideEntityType; entityId: string; error?: undefined }
  | { error: APIGatewayProxyResult };

/** `currentTagTeamId` is added to Championship by TTC-10; read it defensively until then. */
function currentTagTeamIdOf(championship: Championship): string | undefined {
  const value = (championship as Championship & { currentTagTeamId?: unknown }).currentTagTeamId;
  return typeof value === 'string' && value ? value : undefined;
}

/** The current champion's player ids. */
function championIdsOf(championship: Championship): string[] {
  const { currentChampion } = championship;
  if (!currentChampion) return [];
  return Array.isArray(currentChampion) ? currentChampion : [currentChampion];
}

/** Checks a singles override's player, the same way as before tag overrides. */
async function checkPlayerTarget(championship: Championship, playerId: string): Promise<TargetCheck> {
  const { roster: { players } } = getRepositories();

  const player = await players.findById(playerId);
  if (!player) return { error: badRequest('Player not found') };

  const bookingBlocked = bookingRefusal(player);
  if (bookingBlocked) return { error: bookingBlocked };

  // A hidden player can't be ranked, so the override could never show
  if (!isPlayerVisible(player)) return { error: badRequest(TARGET_NEEDS_WRESTLER_MESSAGE) };

  if (championIdsOf(championship).includes(playerId)) {
    return { error: badRequest('Cannot set override for the current champion') };
  }

  const divisionId = championship.divisionId;
  if (divisionId && player.divisionId !== divisionId) {
    return { error: badRequest('Player is not in the division required for this championship') };
  }

  return { entityType: 'player', entityId: playerId };
}

/**
 * Checks a tag override's team with the rules the tag ranking uses: an active
 * team, both members live, visible and in the title's division, and not the
 * current champions.
 */
async function checkTagTeamTarget(championship: Championship, tagTeamId: string): Promise<TargetCheck> {
  const { roster: { players, tagTeams } } = getRepositories();

  const team = await tagTeams.findById(tagTeamId);
  if (!team) return { error: badRequest('Tag team not found') };
  if (team.status !== 'active') return { error: badRequest('Tag team is not active') };

  const members = await Promise.all([players.findById(team.player1Id), players.findById(team.player2Id)]);
  const divisionId = championship.divisionId;
  for (const member of members) {
    if (!member) return { error: badRequest('A member of this tag team no longer exists') };
    const bookingBlocked = bookingRefusal(member);
    if (bookingBlocked) return { error: bookingBlocked };
    if (!isPlayerVisible(member)) return { error: badRequest(TARGET_NEEDS_WRESTLER_MESSAGE) };
    if (divisionId && member.divisionId !== divisionId) {
      return { error: badRequest('Tag team is not in the division required for this championship') };
    }
  }

  const championIds = championIdsOf(championship);
  const holdsTitle = currentTagTeamIdOf(championship) === tagTeamId
    || (championIds.includes(team.player1Id) && championIds.includes(team.player2Id));
  if (holdsTitle) return { error: badRequest('Cannot set override for the current champions') };

  return { entityType: 'tagTeam', entityId: tagTeamId };
}

/** Where the override left the player or team, so staff are told what really happened. */
export type OverridePlacement =
  | { status: 'onList'; rank: number }
  | { status: 'notOnList' | 'noActiveSeason' | 'recalculationFailed'; rank: null };

/**
 * Recalculates the title and reads back the player's position. This runs in the
 * request rather than async because the answer is the point: the caller reports
 * it to staff. The override is already saved, so a failure here doesn't lose it.
 */
async function placeOverride(championshipId: string, entityId: string): Promise<OverridePlacement> {
  try {
    const summary = await recalculateContenderRankings(championshipId, { overrideChange: true });
    if (summary.championshipsFailed > 0) return { status: 'recalculationFailed', rank: null };
    if (summary.championshipsProcessed === 0) return { status: 'noActiveSeason', rank: null };

    const { competition: { contenders } } = getRepositories();
    const rankings = await contenders.listByChampionship(championshipId);
    const row = rankings.find((ranking) => ranking.playerId === entityId);
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

    const { championshipId, playerId, tagTeamId, overrideType, reason, expiresAt } = data;

    // Validate required fields. Which entity id is required depends on the title.
    if (!championshipId || !overrideType || !reason) {
      return badRequest('championshipId, overrideType, and reason are required');
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

    const { competition: { championships, contenders } } = getRepositories();

    // Validate championship exists and is active
    const championship = await championships.findById(championshipId);
    if (!championship) {
      return badRequest('Championship not found');
    }

    if (!championship.isActive) {
      return badRequest('Championship is not active');
    }

    let target: TargetCheck;
    if (championship.type === 'tag') {
      if (playerId) return badRequest('A tag title ranks tag teams: send tagTeamId, not playerId');
      if (!tagTeamId || typeof tagTeamId !== 'string') return badRequest('tagTeamId is required for a tag title');
      target = await checkTagTeamTarget(championship, tagTeamId);
    } else {
      if (tagTeamId) return badRequest('tagTeamId is only accepted on a tag title');
      if (!playerId || typeof playerId !== 'string') return badRequest('playerId is required');
      target = await checkPlayerTarget(championship, playerId);
    }
    if (target.error) return target.error;
    const { entityType, entityId } = target;

    const auth = getAuthContext(event);

    // Deactivate existing active override for this entity/championship
    const existingOverride = await contenders.findOverride(championshipId, entityId);
    if (existingOverride && existingOverride.active) {
      await contenders.deactivateOverride(championshipId, entityId, 'replaced by new override');
    }

    // Write new override. Tag overrides key on the tagTeamId, as tag rankings do.
    const override = await contenders.createOverride({
      championshipId,
      playerId: entityId,
      entityType,
      overrideType,
      reason: reason.trim(),
      createdBy: auth.username || 'admin',
      ...(expiresAt ? { expiresAt } : {}),
    });

    const placement = await placeOverride(championshipId, entityId);

    return created({ ...override, placement });
  } catch (err) {
    console.error('Error setting contender override:', err);
    return serverError('Failed to set contender override');
  }
};
