import { MAX_MOVES, type WrestlerMove } from '../types';

export const EMPTY_MOVE: WrestlerMove = { gameName: '', customName: '' };

/** Always returns exactly MAX_MOVES rows so the editor can render fixed slots. */
export function padMoves(moves: WrestlerMove[] | undefined): WrestlerMove[] {
  const out = (moves ?? []).slice(0, MAX_MOVES).map((m) => ({ ...m }));
  while (out.length < MAX_MOVES) out.push({ ...EMPTY_MOVE });
  return out;
}

/** Drops rows with a blank in-game name and trims the rest — what we send to the API. */
export function compactMoves(moves: WrestlerMove[]): WrestlerMove[] {
  return moves
    .map((m) => ({ gameName: m.gameName.trim(), customName: m.customName.trim() }))
    .filter((m) => m.gameName.length > 0);
}

/** The name commentary should use: the custom name, else the in-game name. */
export function displayMoveName(move: WrestlerMove): string {
  return move.customName.trim() || move.gameName;
}

export function movesEqual(a: WrestlerMove[] | undefined, b: WrestlerMove[] | undefined): boolean {
  const ca = compactMoves(a ?? []);
  const cb = compactMoves(b ?? []);
  if (ca.length !== cb.length) return false;
  return ca.every((m, i) => {
    const other = cb[i];
    return other !== undefined && m.gameName === other.gameName && m.customName === other.customName;
  });
}
