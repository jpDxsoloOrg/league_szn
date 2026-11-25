/**
 * The injury booking gate (INJ-06). While a player is injured they cannot be
 * put in a new match, entered in a tournament, claim a slot or take part in a
 * challenge. Staff can book them anyway by sending `allowInjured: true` on a
 * staff-only route: the refusal then comes back as a warning and the match
 * (or tournament) records who was overridden, by whom and when.
 *
 * Player-facing routes never accept the override. With the `injuries`
 * feature flag off there is no gate at all.
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getAuthContext, hasRole } from '../auth';
import { getRepositories } from '../repositories';
import type { InjuryOverride, Player } from '../repositories/types';
import { refused, type RefusalExtra } from '../response';
import { activeInjury } from './index';

export type InjuryGatePlayer = Pick<Player, 'playerId' | 'name' | 'currentInjury'>;

/** One injured player a GM booked anyway, returned beside the saved record. */
export interface InjuryWarning {
  code: 'PLAYER_INJURED';
  playerId: string;
  name: string;
  returnsAt: string;
  message: string;
}

/** The GM using the override, or null when it does not apply. */
export interface InjuryOverrideActor {
  by: string;
}

export type InjuryGateOutcome =
  | { refusal: APIGatewayProxyResult }
  | { refusal: null; warnings: InjuryWarning[]; overrides: InjuryOverride[] };

const PASS: InjuryGateOutcome = { refusal: null, warnings: [], overrides: [] };

/** The `injuries` feature flag (INJ-01, default off). */
async function injuriesFeatureOn(): Promise<boolean> {
  return (await getRepositories().user.siteConfig.getFeatures()).injuries === true;
}

/** An override as the public sees it: who was booked and when, not which GM did it. */
export type PublicInjuryOverride = Omit<InjuryOverride, 'by'>;

/**
 * A match or tournament row with the GM's Cognito sub (`injuryOverrides[].by`)
 * taken out, for anyone who is not staff. Rows without overrides come back
 * unchanged.
 */
export function withoutInjuryOverrideActors<Row extends object>(row: Row): Row {
  const overrides = (row as { injuryOverrides?: unknown }).injuryOverrides;
  if (!Array.isArray(overrides)) return row;
  const publicOverrides: PublicInjuryOverride[] = (overrides as InjuryOverride[])
    .map(({ playerId, at }) => ({ playerId, at }));
  return { ...row, injuryOverrides: publicOverrides } as Row;
}

/** `returnsAt` as a calendar date for messages. The API also returns the full value. */
const returnDate = (returnsAt: string): string => returnsAt.slice(0, 10);

function injuryMessage(player: InjuryGatePlayer, returnsAt: string, self: boolean): string {
  if (self) return `You are injured until ${returnDate(returnsAt)}`;
  return `${player.name || 'This player'} is injured until ${returnDate(returnsAt)}`;
}

/**
 * 409 PLAYER_INJURED while the player's injury has not reached `returnsAt`,
 * else null. `self` words it for a caller acting for themselves. Does not
 * read the feature flag: use `checkInjuryGate` in handlers.
 */
export function injuryRefusal(
  player: InjuryGatePlayer,
  now: Date | string,
  options: { self?: boolean } = {},
): APIGatewayProxyResult | null {
  const injury = activeInjury(player, now);
  if (!injury) return null;
  const extra: RefusalExtra = { playerId: player.playerId, returnsAt: injury.returnsAt };
  return refused(409, 'PLAYER_INJURED', injuryMessage(player, injury.returnsAt, options.self === true), extra);
}

/**
 * The override a staff route was asked for: the caller's sub when the body
 * sets `allowInjured: true` and the caller is staff, else null. Player-facing
 * routes never call this.
 */
export function staffInjuryOverride(
  event: APIGatewayProxyEvent,
  allowInjured: unknown,
): InjuryOverrideActor | null {
  if (allowInjured !== true) return null;
  const auth = getAuthContext(event);
  if (!hasRole(auth, 'Moderator')) return null;
  return { by: auth.sub || auth.username || 'staff' };
}

/**
 * Checks the players being added. Ids that found no row are skipped.
 *
 * - Nobody injured, or the `injuries` flag off: passes with no warnings.
 * - Someone injured, no override: the first one's 409.
 * - Someone injured, staff override: passes with a warning and an override
 *   record for each injured player.
 *
 * `self` words the refusal for a caller acting for themselves (only used
 * when the first injured player is `selfPlayerId`).
 */
export async function checkInjuryGate(
  players: ReadonlyArray<InjuryGatePlayer | null | undefined>,
  options: { override?: InjuryOverrideActor | null; now?: Date; selfPlayerId?: string } = {},
): Promise<InjuryGateOutcome> {
  const now = options.now ?? new Date();
  const injured = players.flatMap((player) => {
    const injury = player ? activeInjury(player, now) : null;
    return player && injury ? [{ player, returnsAt: injury.returnsAt }] : [];
  });
  if (injured.length === 0) return PASS;

  // Read only when someone is injured, so most bookings cost no extra read.
  if (!(await injuriesFeatureOn())) return PASS;

  if (!options.override) {
    const { player, returnsAt } = injured[0];
    const self = player.playerId === options.selfPlayerId;
    const extra: RefusalExtra = { playerId: player.playerId, returnsAt };
    return { refusal: refused(409, 'PLAYER_INJURED', injuryMessage(player, returnsAt, self), extra) };
  }

  const at = now.toISOString();
  const { by } = options.override;
  const warnings: InjuryWarning[] = injured.map(({ player, returnsAt }) => ({
    code: 'PLAYER_INJURED',
    playerId: player.playerId,
    name: player.name,
    returnsAt,
    message: injuryMessage(player, returnsAt, false),
  }));
  const overrides: InjuryOverride[] = injured.map(({ player }) => ({ playerId: player.playerId, by, at }));
  return { refusal: null, warnings, overrides };
}
