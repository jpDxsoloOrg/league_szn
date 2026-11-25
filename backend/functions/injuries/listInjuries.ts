import { APIGatewayProxyHandler } from 'aws-lambda';
import { injuryImpact, type InjuryImpact } from '../../lib/injuries/notifyStaff'; // INJ-11
import { getRepositories } from '../../lib/repositories';
import type { Injury } from '../../lib/repositories/injuries';
import { badRequest, serverError, success } from '../../lib/response';
import { requireInjuriesEnabled } from './shared';

export interface InjuryBoardPlayer {
  playerId: string;
  name: string;
  currentWrestler: string;
  imageUrl?: string;
  divisionId?: string;
  /** Stored stamina; absent means full. */
  stamina?: number;
}

export interface InjuryBoardEntry {
  injury: Injury;
  /** Null when the player row is gone. */
  player: InjuryBoardPlayer | null;
  /** True once `returnsAt` has passed and only the weekly recovery has yet to end it. */
  pastReturnDate: boolean;
  /** INJ-11: scheduled matches before the return date and active titles held. */
  impact: InjuryImpact;
}

/**
 * GET /injuries?active=true (Moderator + Admin). Every injury that has not
 * ended, soonest return first, with the player and the full row (notes and
 * the change log included), plus the scheduled matches it affects and the
 * titles the player holds. `active` defaults to true; history per player is
 * GET /players/{playerId}/injuries.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const active = event.queryStringParameters?.active;
    if (active !== undefined && active !== 'true') {
      return badRequest('Only active=true is supported; use /players/{playerId}/injuries for history');
    }
    const disabled = await requireInjuriesEnabled();
    if (disabled) return disabled;

    const { injuries, roster: { players }, competition } = getRepositories();
    const open = await injuries.listOpen();
    // INJ-11: what each injury affects, read once for the whole board.
    const [scheduled, championships] = open.length > 0
      ? await Promise.all([competition.matches.listByStatus('scheduled'), competition.championships.list()])
      : [[], []];
    const playerIds = [...new Set(open.map((injury) => injury.playerId))];
    const playerRows = await Promise.all(playerIds.map((playerId) => players.findById(playerId)));
    const playersById = new Map(
      playerRows.filter((player) => player !== null).map((player) => [player.playerId, player]),
    );

    const now = Date.now();
    const entries: InjuryBoardEntry[] = open.map((injury) => {
      const player = playersById.get(injury.playerId);
      return {
        injury,
        player: player
          ? {
            playerId: player.playerId,
            name: player.name,
            currentWrestler: player.currentWrestler,
            ...(player.imageUrl !== undefined && { imageUrl: player.imageUrl }),
            ...(player.divisionId !== undefined && { divisionId: player.divisionId }),
            ...(typeof player.stamina === 'number' && { stamina: player.stamina }),
          }
          : null,
        pastReturnDate: Date.parse(injury.returnsAt) <= now,
        impact: injuryImpact(injury.playerId, injury.returnsAt, scheduled, championships),
      };
    });
    return success(entries);
  } catch (err) {
    console.error('Error listing injuries:', err);
    return serverError('Failed to list injuries');
  }
};
