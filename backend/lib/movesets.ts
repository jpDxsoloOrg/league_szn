import type { Player, WrestlerMove } from './repositories/types';
import { MOVE_LEVEL_MAX, MOVE_LEVEL_MIN } from './policies/buildRules';

/** Max signatures and max finishers a player can store (each list). */
export const MAX_MOVES = 5;
export const MAX_MOVE_NAME_LENGTH = 60;
export const MAX_BIO_LENGTH = 500;

type ParseResult<T> = { value: T } | { error: string };

/** Single-line text: drop control characters, collapse runs of whitespace. */
function normalizeName(text: string): string {
  return text.replace(/[\p{Cc}]/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** Multi-line text: keep newlines, drop other control characters, trim. */
function normalizeBio(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[^\P{Cc}\n]/gu, '')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

/**
 * Validates a signatures/finishers list from a request body.
 *
 * Rows whose `gameName` is blank are dropped so the stored array is always
 * compact — the edit form always submits five rows, most of them empty.
 * `customName` is kept as typed (trimmed); blank is allowed and means "call
 * it by the in-game name".
 *
 * BLD-03: `level` is optional, a whole number from MOVE_LEVEL_MIN to
 * MOVE_LEVEL_MAX. Level 1 (and no level) is stored without the field, so a
 * move costs nothing until it is upgraded.
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
    const { gameName, customName, level } = entry as Record<string, unknown>;
    if (gameName !== undefined && typeof gameName !== 'string') {
      return { error: `${field}.gameName must be a string` };
    }
    if (customName !== undefined && typeof customName !== 'string') {
      return { error: `${field}.customName must be a string` };
    }
    const trimmedGame = normalizeName(gameName ?? '');
    const trimmedCustom = normalizeName(customName ?? '');
    if (trimmedGame.length > MAX_MOVE_NAME_LENGTH || trimmedCustom.length > MAX_MOVE_NAME_LENGTH) {
      return { error: `${field} names must be ${MAX_MOVE_NAME_LENGTH} characters or less` };
    }
    if (
      level !== undefined &&
      level !== null &&
      (typeof level !== 'number' ||
        !Number.isInteger(level) ||
        level < MOVE_LEVEL_MIN ||
        level > MOVE_LEVEL_MAX)
    ) {
      return { error: `${field}.level must be a whole number from ${MOVE_LEVEL_MIN} to ${MOVE_LEVEL_MAX}` };
    }
    if (!trimmedGame) continue;
    const move: WrestlerMove = { gameName: trimmedGame, customName: trimmedCustom };
    if (typeof level === 'number' && level > MOVE_LEVEL_MIN) move.level = level;
    moves.push(move);
  }
  return { value: moves };
}

/**
 * BLD-03: give each move in `next` the level of the move with the same
 * `gameName` in `previous`, so editing the moveset keeps the upgrades on moves
 * that stay. New moves start at level 1. Any level sent with the edit is
 * ignored: levels are bought through the build, which checks the budget.
 */
export function carryOverMoveLevels(
  next: readonly WrestlerMove[],
  previous: readonly WrestlerMove[] | undefined,
): WrestlerMove[] {
  const levelByGameName = new Map<string, number>();
  for (const move of previous ?? []) {
    if (move.level !== undefined && move.level > MOVE_LEVEL_MIN && !levelByGameName.has(move.gameName)) {
      levelByGameName.set(move.gameName, move.level);
    }
  }
  return next.map(({ level: _sentLevel, ...move }) => {
    const kept = levelByGameName.get(move.gameName);
    return kept === undefined ? move : { ...move, level: kept };
  });
}

/** Validates a bio. Empty string is valid and clears the bio. */
export function parseBio(value: unknown): ParseResult<string> {
  if (typeof value !== 'string') {
    return { error: 'Field bio must be a string' };
  }
  const trimmed = normalizeBio(value);
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
