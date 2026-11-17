/**
 * DMV-09: a wrestler's division history. Merges executed progression moves
 * (call-ups, promotions, relegations) with approved division transfers into
 * one list, oldest first.
 */

import type { Division, ProgressionEvent, ProgressionKind, TransferRequest } from '../repositories';

export type DivisionMoveKind = ProgressionKind | 'transfer';

export interface DivisionHistoryEntry {
  /** The progression eventId, or the transfer requestId. */
  id: string;
  kind: DivisionMoveKind;
  fromDivisionId: string;
  /** null when the division has since been deleted. */
  fromDivisionName: string | null;
  toDivisionId: string;
  toDivisionName: string | null;
  /** When the player joined `toDivisionId`. */
  movedAt: string;
}

/**
 * Build the history. Only `executed` events with a target and `approved`
 * transfers count; an approved transfer's `updatedAt` is its review time,
 * when the player moved. Sorted by `movedAt`, then id, so ties are stable.
 */
export function mergeDivisionHistory(
  events: readonly ProgressionEvent[],
  transfers: readonly TransferRequest[],
  divisions: readonly Pick<Division, 'divisionId' | 'name'>[],
): DivisionHistoryEntry[] {
  const nameOf = new Map(divisions.map((division) => [division.divisionId, division.name]));
  const entry = (
    id: string,
    kind: DivisionMoveKind,
    fromDivisionId: string,
    toDivisionId: string,
    movedAt: string,
  ): DivisionHistoryEntry => ({
    id,
    kind,
    fromDivisionId,
    fromDivisionName: nameOf.get(fromDivisionId) ?? null,
    toDivisionId,
    toDivisionName: nameOf.get(toDivisionId) ?? null,
    movedAt,
  });

  const entries: DivisionHistoryEntry[] = [];
  for (const event of events) {
    if (event.type !== 'executed' || !event.toDivisionId) continue;
    entries.push(entry(event.eventId, event.kind, event.fromDivisionId, event.toDivisionId, event.createdAt));
  }
  for (const transfer of transfers) {
    if (transfer.status !== 'approved') continue;
    entries.push(entry(
      transfer.requestId,
      'transfer',
      transfer.fromDivisionId,
      transfer.toDivisionId,
      transfer.updatedAt || transfer.createdAt,
    ));
  }

  return entries.sort((a, b) => a.movedAt.localeCompare(b.movedAt) || a.id.localeCompare(b.id));
}
