import type { AuthContext } from '../auth';
import { isStaff } from '../optionalCaller';
import { getRepositories } from '../repositories';
import type { SimBoost } from '../repositories/types';

/**
 * Who paid for a sim boost is private (ECO-08). Staff see every boost on a
 * match; a signed-in player sees only their own entry; everyone else sees
 * none, and the `simBoosts` field is left off the match.
 */
export type SimBoostViewer =
  | { kind: 'staff' }
  | { kind: 'player'; playerId: string }
  | { kind: 'public' };

/** The boost a player sees of their own: no internal ledger key. */
export type VisibleSimBoost = Omit<SimBoost, 'purchaseKey'> & { purchaseKey?: string };

const PUBLIC_VIEWER: SimBoostViewer = { kind: 'public' };

/**
 * Work out what the caller may see. Looks up the caller's player only when
 * `needsLookup` is true, so responses without boosts cost no extra read.
 */
export async function resolveSimBoostViewer(
  caller: AuthContext | null,
  needsLookup = true,
): Promise<SimBoostViewer> {
  if (!caller) return PUBLIC_VIEWER;
  if (isStaff(caller)) return { kind: 'staff' };
  if (!caller.sub || !needsLookup) return PUBLIC_VIEWER;
  const player = await getRepositories().roster.players.findByUserId(caller.sub);
  return player ? { kind: 'player', playerId: player.playerId } : PUBLIC_VIEWER;
}

/** A viewer for a caller whose player id is already known. */
export function playerSimBoostViewer(caller: AuthContext, playerId: string | null): SimBoostViewer {
  if (isStaff(caller)) return { kind: 'staff' };
  return playerId ? { kind: 'player', playerId } : PUBLIC_VIEWER;
}

/** True when any of the matches carries sim boosts. */
export function anyMatchHasSimBoosts(matches: ReadonlyArray<{ simBoosts?: unknown }>): boolean {
  return matches.some((match) => Array.isArray(match.simBoosts) && match.simBoosts.length > 0);
}

/** Return the match with `simBoosts` cut down to what the viewer may see. */
export function withVisibleSimBoosts<TMatch extends { simBoosts?: unknown }>(
  match: TMatch,
  viewer: SimBoostViewer,
): Omit<TMatch, 'simBoosts'> & { simBoosts?: VisibleSimBoost[] } {
  const { simBoosts, ...rest } = match;
  if (!Array.isArray(simBoosts)) return rest;
  const boosts = simBoosts as SimBoost[];
  if (viewer.kind === 'staff') return { ...rest, simBoosts: boosts };
  if (viewer.kind === 'public') return rest;
  const own = boosts
    .filter((boost) => boost.playerId === viewer.playerId)
    .map(({ purchaseKey: _purchaseKey, ...boost }) => boost);
  return own.length > 0 ? { ...rest, simBoosts: own } : rest;
}
