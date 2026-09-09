import type {
  CommentaryHeadToHead,
  CommentaryMatch,
  CommentaryParticipant,
  WinLossDraw,
} from '../types/event';

export interface TeamGroup {
  index: number;
  members: CommentaryParticipant[];
  /** True for the catch-all group of players who aren't on any team. */
  unlabelled: boolean;
}

/**
 * Group participants by `teams`. A player listed on two teams stays on the
 * first; anyone on no team is shown in an unlabelled trailing group.
 */
export function groupByTeam(match: CommentaryMatch): TeamGroup[] | null {
  if (!match.teams || match.teams.length < 2) return null;
  const byId = new Map(match.participants.map((p) => [p.playerId, p]));
  const placed = new Set<string>();
  const groups: TeamGroup[] = match.teams.map((team, index) => {
    const members: CommentaryParticipant[] = [];
    for (const id of team) {
      const p = byId.get(id);
      if (!p || placed.has(id)) continue;
      placed.add(id);
      members.push(p);
    }
    return { index, members, unlabelled: false };
  });
  const leftovers = match.participants.filter((p) => !placed.has(p.playerId));
  if (leftovers.length > 0) groups.push({ index: groups.length, members: leftovers, unlabelled: true });
  return groups.filter((g) => g.members.length > 0);
}

/** The match a commentator most likely wants: the first one still to happen. */
export function defaultMatchIndex(matches: CommentaryMatch[]): number {
  const next = matches.findIndex((m) => m.status !== 'completed' && m.status !== 'cancelled');
  return next === -1 ? Math.max(0, matches.length - 1) : next;
}

export function formatRecord(record: WinLossDraw): string {
  return `${record.wins}-${record.losses}-${record.draws}`;
}

export interface OrientedRecord {
  wins: number;
  losses: number;
  draws: number;
  entry: CommentaryHeadToHead;
}

/** Record of `rowId` against `colId`, oriented from the row wrestler's side. */
export function recordBetween(
  headToHead: CommentaryHeadToHead[],
  rowId: string,
  colId: string,
): OrientedRecord | null {
  for (const h of headToHead) {
    if (h.player1Id === rowId && h.player2Id === colId) {
      return { wins: h.player1Wins, losses: h.player2Wins, draws: h.draws, entry: h };
    }
    if (h.player1Id === colId && h.player2Id === rowId) {
      return { wins: h.player2Wins, losses: h.player1Wins, draws: h.draws, entry: h };
    }
  }
  return null;
}
