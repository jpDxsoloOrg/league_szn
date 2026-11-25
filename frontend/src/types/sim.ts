import type { SimCategory } from '../constants/simCategories';

/**
 * Match sim shapes (BLD-08, BLD-10, BLD-14). Mirror `SimulateResponse` in
 * backend/functions/matches/simulateMatch.ts and `MatchSimulation` in
 * backend/lib/repositories/types.ts.
 */

/** How a completed match was decided. */
export type MatchResultSource = 'manual' | 'simulation';

/** One play-by-play line: an i18n key (`sim.beats.*`) and its params. */
export interface SimBeat {
  key: string;
  params: Record<string, string>;
}

/** A side's win chance. Staff only: never in public payloads. */
export interface SimSideOdds {
  sideId: string;
  playerIds: string[];
  /** Percent, one decimal place. */
  pct: number;
}

export type SimFormWindow =
  | { kind: 'season'; seasonId: string }
  | { kind: 'recent'; matchLimit: number };

/** POST /simulate body: a scheduled match, or ad-hoc sides. */
export type SimulatePreviewRequest =
  | { matchId: string; seed?: number }
  | { sides: string[][]; stipulationId?: string; matchTypeId?: string; seed?: number };

/** POST /simulate response (GM preview, nothing is written). */
export interface SimulatePreviewResponse {
  seed: number;
  category: SimCategory;
  /** In side order. */
  probabilities: SimSideOdds[];
  winnerSideId: string;
  playByPlay: SimBeat[];
  /** Players fighting in their specialty. */
  specialtyHits: string[];
  matchId?: string;
  scaledPlayerIds: string[];
  formWindow: SimFormWindow;
  inputsDigest: string;
  rulesVersion: number;
}

/**
 * The official sim stored on a completed match. Everyone gets the story;
 * `probabilities` and the audit fields only come back for staff.
 */
export interface StoredMatchSimulation {
  seed: number;
  category: SimCategory;
  rulesVersion: number;
  winnerSideId: string;
  playByPlay: SimBeat[];
  specialtyHits: string[];
  simulatedAt: string;
  /** Staff only. */
  probabilities?: SimSideOdds[];
}

/** POST /matches/{matchId}/simulate response. */
export interface SimulateOfficialResponse {
  message: string;
  match: { matchId: string; resultSource?: MatchResultSource; simulation?: StoredMatchSimulation };
  /** The full sim, odds included. */
  simulation: SimulatePreviewResponse;
}
