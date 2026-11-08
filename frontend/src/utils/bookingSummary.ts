import type { PlayerBookingInfo } from '../types';

export type BookingInfoMap = Map<string, PlayerBookingInfo>;

/**
 * Drop every row's season record but keep last-booked and streak. Used when a
 * refetch for another season fails: the old records belong to the wrong
 * season, while the rest of the row is still true.
 */
export function withoutSeasonRecords(info: ReadonlyMap<string, PlayerBookingInfo>): BookingInfoMap {
  const stripped: BookingInfoMap = new Map();
  for (const [playerId, row] of info) {
    const { seasonRecord: _seasonRecord, ...rest } = row;
    stripped.set(playerId, rest);
  }
  return stripped;
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}
