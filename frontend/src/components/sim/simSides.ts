import type { MatchResultSource, SideTagTeam, SimSideOdds, StoredMatchSimulation } from '../../types';

/** True when the match was settled by the official sim and carries its story. */
export function isSimulatedMatch(match: {
  resultSource?: MatchResultSource;
  simulation?: StoredMatchSimulation;
}): match is { resultSource: 'simulation'; simulation: StoredMatchSimulation } {
  return match.resultSource === 'simulation' && !!match.simulation;
}

/** One side as the sim panels show it. */
export interface SimPanelSide {
  sideId: string;
  /** The tag team name when the side was billed as one, else the members' names. */
  label: string;
  members: { playerId: string; name: string }[];
  /** Win chance in percent. Only set for staff. */
  pct?: number;
}

/** Side id the backend gives the side at `index` (`side-1`, `side-2`, ...). */
export function defaultSideId(index: number): string {
  return `side-${index + 1}`;
}

/**
 * The sides the sim ran for a match, in the backend's order: `teams` when the
 * match has two or more, otherwise one side per participant. Mirrors
 * `simSidesFromMatch` in backend/lib/sim/loadSimInputs.ts.
 */
export function matchSimSides(match: { participants: string[]; teams?: string[][] }): string[][] {
  if (match.teams && match.teams.length >= 2) return match.teams.map((team) => [...team]);
  return match.participants.map((playerId) => [playerId]);
}

interface BuildSimSidesOptions {
  /** Player ids per side, in side order. */
  sides: string[][];
  nameOf: (playerId: string) => string;
  /** Tag team per side, aligned with `sides` (TTB-01). */
  sideTagTeams?: (SideTagTeam | null)[];
  /** Odds from the sim, matched to sides by id, else by position. */
  odds?: SimSideOdds[];
}

/** Labels, members and (when known) odds for each side. */
export function buildSimSides({ sides, nameOf, sideTagTeams, odds }: BuildSimSidesOptions): SimPanelSide[] {
  return sides.map((playerIds, index) => {
    const sideId = odds?.[index]?.sideId ?? defaultSideId(index);
    const members = playerIds.map((playerId) => ({ playerId, name: nameOf(playerId) }));
    const teamName = sideTagTeams?.[index]?.name;
    const sideOdds = odds?.find((entry) => entry.sideId === sideId);
    return {
      sideId,
      label: teamName ?? members.map((member) => member.name).join(' & '),
      members,
      ...(sideOdds ? { pct: sideOdds.pct } : {}),
    };
  });
}

/** Sides straight from a preview's odds (ad-hoc sides have no match to read). */
export function sidesFromOdds(odds: SimSideOdds[], nameOf: (playerId: string) => string): SimPanelSide[] {
  return buildSimSides({ sides: odds.map((entry) => entry.playerIds), nameOf, odds });
}
