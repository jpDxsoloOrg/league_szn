import { championIdsOf } from '../disciplineGates';
import { getRepositories } from '../repositories';
import type { ChampionshipHistoryEntry } from '../repositories/types';

/** Answers "did this player hold any title at this moment?". */
export type IsChampionAt = (playerId: string, at: string) => boolean;

/** One reign as a half-open interval of epoch milliseconds: [start, end). */
interface ReignWindow {
  start: number;
  end: number;
}

/** The reign fields the index reads. */
export type TitleReignRecord = Pick<ChampionshipHistoryEntry, 'champion' | 'wonDate' | 'lostDate'>;

function toEpochMs(value: string | undefined): number {
  return value ? Date.parse(value) : Number.NaN;
}

/**
 * Indexes championship reigns, singles and tag, by holder.
 *
 * A reign covers `[wonDate, lostDate)`; an open reign (no lostDate) runs on
 * forever. Every member of a tag reign counts as a champion.
 *
 * Same-day rule: a moment counts as before a title change only when it is
 * strictly earlier than the new reign's `wonDate`. A match dated exactly at
 * `wonDate` belongs to the new champion's reign. Because `wonDate` is the time
 * the result was recorded, the title match itself (and any date-only match on
 * that day, which parses to midnight UTC) sits before the change: the loser
 * was the champion going in, so beating them earns the bonus.
 *
 * Reigns with an unreadable `wonDate` are skipped; an unreadable `lostDate`
 * is treated as an open reign. An unreadable `at` is never a champion.
 */
export function buildTitleReignIndex(history: ReadonlyArray<TitleReignRecord>): IsChampionAt {
  const reignsByPlayer = new Map<string, ReignWindow[]>();

  for (const reign of history) {
    const start = toEpochMs(reign.wonDate);
    if (Number.isNaN(start)) continue;
    const lostAt = toEpochMs(reign.lostDate);
    const end = Number.isNaN(lostAt) ? Number.POSITIVE_INFINITY : lostAt;

    for (const playerId of championIdsOf(reign.champion)) {
      const windows = reignsByPlayer.get(playerId) ?? [];
      windows.push({ start, end });
      reignsByPlayer.set(playerId, windows);
    }
  }

  return (playerId: string, at: string): boolean => {
    const windows = reignsByPlayer.get(playerId);
    if (!windows) return false;
    const atMs = toEpochMs(at);
    if (Number.isNaN(atMs)) return false;
    return windows.some((window) => atMs >= window.start && atMs < window.end);
  };
}

/** Reads every championship reign in one call and indexes it. */
export async function loadTitleReignIndex(): Promise<IsChampionAt> {
  const history = await getRepositories().competition.championships.listAllHistory();
  return buildTitleReignIndex(history);
}
