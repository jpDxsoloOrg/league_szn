import type { Player, WrestlerMove } from './repositories/types';

/** Max signatures and max finishers a player can store (each list). */
export const MAX_MOVES = 5;
export const MAX_MOVE_NAME_LENGTH = 60;
export const MAX_BIO_LENGTH = 500;

type ParseResult<T> = { value: T } | { error: string };

/**
 * Validates a signatures/finishers list from a request body.
 *
 * Rows whose `gameName` is blank are dropped so the stored array is always
 * compact — the edit form always submits five rows, most of them empty.
 * `customName` is kept as typed (trimmed); blank is allowed and means "call
 * it by the in-game name".
 */
export function parseMoveList(value: unknown, field: string): ParseResult<WrestlerMove[]> {
  if (!Array.isArray(value)) {
    return { error: `Field ${field} must be an array` };
  }
  if (value.length > MAX_MOVES) {
    return { error: `Field ${field} may contain at most ${MAX_MOVES} moves` };
  }

  const moves: WrestlerMove[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) {
      return { error: `Each ${field} entry must be an object` };
    }
    const { gameName, customName } = entry as Record<string, unknown>;
    if (gameName !== undefined && typeof gameName !== 'string') {
      return { error: `${field}.gameName must be a string` };
    }
    if (customName !== undefined && typeof customName !== 'string') {
      return { error: `${field}.customName must be a string` };
    }
    const trimmedGame = (gameName ?? '').trim();
    const trimmedCustom = (customName ?? '').trim();
    if (trimmedGame.length > MAX_MOVE_NAME_LENGTH || trimmedCustom.length > MAX_MOVE_NAME_LENGTH) {
      return { error: `${field} names must be ${MAX_MOVE_NAME_LENGTH} characters or less` };
    }
    if (!trimmedGame) continue;
    moves.push({ gameName: trimmedGame, customName: trimmedCustom });
  }
  return { value: moves };
}

/** Validates a bio. Empty string is valid and clears the bio. */
export function parseBio(value: unknown): ParseResult<string> {
  if (typeof value !== 'string') {
    return { error: 'Field bio must be a string' };
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_BIO_LENGTH) {
    return { error: `Bio must be ${MAX_BIO_LENGTH} characters or less` };
  }
  return { value: trimmed };
}

function hasNamedMove(moves: WrestlerMove[] | undefined): boolean {
  return (moves ?? []).some((m) => m.gameName.trim().length > 0);
}

/** True when the player has at least one signature AND one finisher. */
export function hasMoveset(player: Pick<Player, 'signatures' | 'finishers'>): boolean {
  return hasNamedMove(player.signatures) && hasNamedMove(player.finishers);
}
