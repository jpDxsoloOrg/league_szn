import { APIGatewayProxyHandler } from 'aws-lambda';
import { getAuthContext } from '../../lib/auth';
import { toPlayerBuildView } from '../../lib/builds/playerBuild';
import { activeNoShows } from '../../lib/fines';
import { activeInjury } from '../../lib/injuries';
import { isStaff } from '../../lib/optionalCaller';
import { applyDrain, formatKeyForMatch, matchDrain, returnDate, staminaOf } from '../../lib/policies/fatigue';
import type { InjuryTunables } from '../../lib/policies/fatigueDefaults';
import { getRepositories } from '../../lib/repositories';
import { toPublicCurrentInjury, type PublicCurrentInjury } from '../../lib/repositories/injuries';
import type { Match, Player } from '../../lib/repositories/types';
import { badRequest, forbidden, notFound, serverError, success } from '../../lib/response';
import { resolveSimCategory } from '../../lib/sim/category';
import { requireInjuriesEnabled } from './shared';

/** The player's next booked match and what it will take from them. */
export interface NextMatchDrain {
  matchId: string;
  date: string;
  drain: number;
  staminaAfter: number;
}

/** GET /players/{playerId}/condition: what the stamina meter shows. */
export interface PlayerConditionView {
  playerId: string;
  stamina: number;
  maxStamina: number;
  /**
   * Which injury-chance band the stamina falls in: 0 is the band for the
   * highest stamina, `bandCount - 1` the lowest. The meter's colour.
   */
  band: number;
  bandCount: number;
  weeklyRecovery: number | 'full';
  /** The next Sunday 00:00 in the league time zone, when stamina comes back. */
  nextRecoveryAt: string;
  /** The injury that still keeps the player out, public fields only. */
  currentInjury: PublicCurrentInjury | null;
  nextMatch: NextMatchDrain | null;
}

/** Index of the chance band `stamina` falls in (bands are sorted highest first). */
export function staminaBand(stamina: number, tunables: Pick<InjuryTunables, 'injuryChanceBands'>): number {
  const bands = tunables.injuryChanceBands;
  const index = bands.findIndex((entry) => stamina >= entry.minStamina);
  return index === -1 ? Math.max(0, bands.length - 1) : index;
}

/** The earliest scheduled match the player is booked in and not marked a no-show for. */
function nextBookedMatch(scheduled: readonly Match[], playerId: string): Match | null {
  const booked = scheduled.filter((match) =>
    (match.participants ?? []).includes(playerId)
    && !activeNoShows(match).some((mark) => mark.playerId === playerId));
  booked.sort((left, right) => left.date.localeCompare(right.date));
  return booked[0] ?? null;
}

/**
 * GET /players/{playerId}/condition (INJ-12). The stamina meter for the
 * player themselves and for staff: stamina, its band, the next weekly
 * recovery and the drain of the next booked match. Everyone else gets 403;
 * the public injury badge reads `currentInjury` from the player row instead.
 * 403 while the injuries feature is off.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const playerId = event.pathParameters?.playerId;
    if (!playerId) return badRequest('Player ID is required');

    const disabled = await requireInjuriesEnabled();
    if (disabled) return disabled;

    const repos = getRepositories();
    const player = await repos.roster.players.findById(playerId);
    if (!player || player.deletedAt) return notFound('Player not found');

    const caller = getAuthContext(event);
    const isSelf = Boolean(player.userId) && caller.sub === player.userId;
    if (!isSelf && !isStaff(caller)) return forbidden('Only the player and staff can see their stamina');

    const [tunables, scheduled] = await Promise.all([
      repos.user.siteConfig.getInjuryTunables(),
      repos.competition.matches.listByStatus('scheduled'),
    ]);
    const now = new Date();
    const stamina = staminaOf(player.stamina, tunables);
    const injury = activeInjury(player, now);
    const next = nextBookedMatch(scheduled, playerId);

    const view: PlayerConditionView = {
      playerId,
      stamina,
      maxStamina: tunables.maxStamina,
      band: staminaBand(stamina, tunables),
      bandCount: tunables.injuryChanceBands.length,
      weeklyRecovery: tunables.weeklyRecovery,
      nextRecoveryAt: returnDate(now, 0, tunables.timezone).toISOString(),
      currentInjury: injury ? toPublicCurrentInjury(injury) : null,
      nextMatch: next ? await nextMatchDrain(next, player, stamina, tunables) : null,
    };
    return success(view);
  } catch (err) {
    console.error('Error getting player condition:', err);
    return serverError('Failed to get condition');
  }
};

/** Same drain the result will apply (INJ-04), from the match's category, format and the player's endurance. */
async function nextMatchDrain(
  match: Match,
  player: Player,
  stamina: number,
  tunables: InjuryTunables,
): Promise<NextMatchDrain> {
  const repos = getRepositories();
  const [stipulations, matchTypes, division] = await Promise.all([
    repos.competition.stipulations.list(),
    repos.competition.matchTypes.list(),
    player.divisionId ? repos.leagueOps.divisions.findById(player.divisionId) : Promise.resolve(null),
  ]);
  const category = resolveSimCategory(match, stipulations, matchTypes);
  const endurance = toPlayerBuildView(player, division).effective.stats.endurance;
  const drain = matchDrain({ category, format: formatKeyForMatch(match, tunables), endurance }, tunables);
  return {
    matchId: match.matchId,
    date: match.date,
    drain,
    staminaAfter: applyDrain(stamina, drain, tunables),
  };
}
