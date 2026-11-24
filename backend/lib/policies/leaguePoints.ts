/**
 * League points policy (STR-01).
 *
 * Pure, side-effect-free math that turns a list of completed matches into a
 * ranked league table. No I/O: the caller decides which matches to pass (for
 * example only matches since a player joined a division) and, optionally, how
 * to tell whether a player held a title at a given moment.
 *
 * Replay:
 *   Matches are replayed in result order (`completedAt ?? date`, then
 *   `matchId` so ties are stable), keeping running points per player.
 *   - Result points: a win is POINTS_WIN, a loss POINTS_LOSS, and on a draw
 *     every participant gets POINTS_DRAW. A 4-way win is still POINTS_WIN.
 *   - Quality win: each winner gets QUALITY_WIN_BONUS (at most once per match)
 *     if any loser had strictly more running points than that winner *before*
 *     this match, or `isChampionAt(loser, resultTime)` is true. On a team win
 *     every member of the winning side is judged on their own.
 *   - Streak: consecutive wins (a draw or a loss resets it, the same as
 *     `streakFromResults`). A win that brings the streak to a multiple of
 *     STREAK_BONUS_EVERY adds STREAK_BONUS. There is no loss penalty.
 *
 * Opponents: when `teams` is given, a player's opponents are everyone on the
 * other teams. Without it, a decided match with several winners is read as
 * two sides (winners vs losers); anything else is every man for himself.
 *
 * Ranking: see `compareLeagueRows`.
 */
import { matchWinners } from '../matchResult';
import { matchResultTime } from '../matchTime';

export const POINTS_WIN = 3;
export const POINTS_DRAW = 1;
export const POINTS_LOSS = 0;
export const QUALITY_WIN_BONUS = 1;
export const STREAK_BONUS = 1;
export const STREAK_BONUS_EVERY = 3;

/** Decimal places kept on `sos` and `winPct`. */
const RATIO_DECIMALS = 3;

export interface LeagueMatchInput {
  matchId: string;
  /** The date the match was booked for. */
  date: string;
  /** When the result was recorded. Orders the replay when present. */
  completedAt?: string;
  participants: string[];
  /** On a draw this holds every participant (see `matchWinners`). */
  winners: string[];
  losers: string[];
  isDraw?: boolean;
  teams?: string[][];
}

export interface LeaguePointsOptions {
  /** Whether `playerId` held a title at the ISO time `at`. */
  isChampionAt?: (playerId: string, at: string) => boolean;
  /** Players who get a row even if they have no matches in the input. */
  playerIds?: readonly string[];
}

/** One match a player took part in, kept for head-to-head tiebreaks. */
export interface LeagueHeadToHeadEntry {
  matchId: string;
  /** Result points only (no bonuses) the player earned in this match. */
  points: number;
  opponentIds: readonly string[];
}

export interface LeagueRow {
  playerId: string;
  /** Display name; used as the last tiebreak. Falls back to `playerId`. */
  name?: string;
  points: number;
  basePoints: number;
  qualityWins: number;
  streakBonuses: number;
  wins: number;
  losses: number;
  draws: number;
  matchesPlayed: number;
  winPct: number;
  /** Mean final points-per-match of every opponent faced (with repeats). */
  sos: number;
  headToHead: readonly LeagueHeadToHeadEntry[];
}

export type RankedLeagueRow<T extends LeagueRow = LeagueRow> = T & { rank: number };

interface PlayerTally {
  points: number;
  basePoints: number;
  qualityWins: number;
  streakBonuses: number;
  wins: number;
  losses: number;
  draws: number;
  winStreak: number;
  opponentIds: string[];
  headToHead: LeagueHeadToHeadEntry[];
}

function emptyTally(): PlayerTally {
  return {
    points: 0,
    basePoints: 0,
    qualityWins: 0,
    streakBonuses: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    winStreak: 0,
    opponentIds: [],
    headToHead: [],
  };
}

/** Final points per match. Only called for opponents, who have played. */
function pointsPerMatch(tally: PlayerTally): number {
  return tally.points / (tally.wins + tally.losses + tally.draws);
}

function roundRatio(value: number): number {
  const factor = 10 ** RATIO_DECIMALS;
  return Math.round(value * factor) / factor;
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** Replay order: result time, then matchId. */
function compareMatchOrder(left: LeagueMatchInput, right: LeagueMatchInput): number {
  return (
    compareText(matchResultTime(left), matchResultTime(right)) ||
    compareText(left.matchId, right.matchId)
  );
}

/** Split a match's players into sides; players on the same side are partners. */
function matchSides(match: LeagueMatchInput, players: readonly string[]): string[][] {
  if (match.teams && match.teams.length > 0) {
    return match.teams;
  }
  const winners = matchWinners(match);
  if (winners.length > 1) {
    return [winners, match.losers];
  }
  return players.map((playerId) => [playerId]);
}

function opponentsOf(playerId: string, sides: readonly string[][], players: readonly string[]): string[] {
  const ownSide = sides.find((side) => side.includes(playerId)) ?? [playerId];
  return players.filter((other) => other !== playerId && !ownSide.includes(other));
}

/**
 * Replay the matches and build one unranked row per player.
 * Matches that are neither a draw nor have a winner are skipped.
 */
export function computeLeagueTable(
  matches: readonly LeagueMatchInput[],
  options: LeaguePointsOptions = {},
): LeagueRow[] {
  const tallies = new Map<string, PlayerTally>();
  const tallyFor = (playerId: string): PlayerTally => {
    let tally = tallies.get(playerId);
    if (!tally) {
      tally = emptyTally();
      tallies.set(playerId, tally);
    }
    return tally;
  };
  for (const playerId of options.playerIds ?? []) {
    tallyFor(playerId);
  }

  const ordered = [...matches].sort(compareMatchOrder);
  for (const match of ordered) {
    const winners = matchWinners(match);
    const isDraw = match.isDraw === true;
    if (!isDraw && winners.length === 0) continue;

    const losers = isDraw ? [] : match.losers.filter((playerId) => !winners.includes(playerId));
    const players = isDraw
      ? [...new Set([...match.participants, ...match.winners])]
      : [...new Set([...winners, ...losers])];
    const sides = matchSides(match, players);
    const resultTime = matchResultTime(match);

    // Judge quality wins on the standings *before* this match.
    const loserIsChampion = losers.some(
      (loserId) => options.isChampionAt?.(loserId, resultTime) === true,
    );
    const qualityWinners = new Set(
      winners.filter((winnerId) => {
        const ownPoints = tallyFor(winnerId).points;
        return loserIsChampion || losers.some((loserId) => tallyFor(loserId).points > ownPoints);
      }),
    );

    for (const playerId of players) {
      const tally = tallyFor(playerId);
      const opponentIds = opponentsOf(playerId, sides, players);
      let resultPoints: number;

      if (isDraw) {
        resultPoints = POINTS_DRAW;
        tally.draws += 1;
        tally.winStreak = 0;
      } else if (winners.includes(playerId)) {
        resultPoints = POINTS_WIN;
        tally.wins += 1;
        tally.winStreak += 1;
        if (qualityWinners.has(playerId)) {
          tally.qualityWins += 1;
          tally.points += QUALITY_WIN_BONUS;
        }
        if (tally.winStreak % STREAK_BONUS_EVERY === 0) {
          tally.streakBonuses += 1;
          tally.points += STREAK_BONUS;
        }
      } else {
        resultPoints = POINTS_LOSS;
        tally.losses += 1;
        tally.winStreak = 0;
      }

      tally.basePoints += resultPoints;
      tally.points += resultPoints;
      tally.opponentIds.push(...opponentIds);
      tally.headToHead.push({ matchId: match.matchId, points: resultPoints, opponentIds });
    }
  }

  return [...tallies].map(([playerId, tally]) => {
    const matchesPlayed = tally.wins + tally.losses + tally.draws;
    const opponentTotal = tally.opponentIds.reduce(
      (sum, opponentId) => sum + pointsPerMatch(tallyFor(opponentId)),
      0,
    );
    return {
      playerId,
      points: tally.points,
      basePoints: tally.basePoints,
      qualityWins: tally.qualityWins,
      streakBonuses: tally.streakBonuses,
      wins: tally.wins,
      losses: tally.losses,
      draws: tally.draws,
      matchesPlayed,
      winPct: matchesPlayed === 0 ? 0 : roundRatio(tally.wins / matchesPlayed),
      sos: tally.opponentIds.length === 0 ? 0 : roundRatio(opponentTotal / tally.opponentIds.length),
      headToHead: tally.headToHead,
    };
  });
}

/**
 * Head-to-head points of each member of `group`, counting only matches in
 * which they faced at least one other member of the group.
 */
export function headToHeadWithinGroup(group: readonly LeagueRow[]): Map<string, number> {
  const memberIds = new Set(group.map((row) => row.playerId));
  const totals = new Map<string, number>();
  for (const row of group) {
    const total = row.headToHead
      .filter((entry) => entry.opponentIds.some((opponentId) => memberIds.has(opponentId)))
      .reduce((sum, entry) => sum + entry.points, 0);
    totals.set(row.playerId, total);
  }
  return totals;
}

/** Steps 1-3 of the order: played, points desc, sos desc. */
function compareBeforeHeadToHead(left: LeagueRow, right: LeagueRow): number {
  const leftUnplayed = left.matchesPlayed === 0 ? 1 : 0;
  const rightUnplayed = right.matchesPlayed === 0 ? 1 : 0;
  return leftUnplayed - rightUnplayed || right.points - left.points || right.sos - left.sos;
}

/**
 * Compare two rows, ignoring the name. Returns 0 when every tiebreaker ties,
 * which is when the rows share a rank.
 *
 * Order:
 *   1. players with 0 matches after everyone who has played
 *   2. points desc
 *   3. strength of schedule (`sos`) desc
 *   4. head-to-head points within the tied group desc (`h2h`, from
 *      `headToHeadWithinGroup`; a missing entry counts as 0)
 *   5. win % desc
 *   6. wins desc
 */
function compareOnMerit(
  left: LeagueRow,
  right: LeagueRow,
  h2h: ReadonlyMap<string, number>,
): number {
  return (
    compareBeforeHeadToHead(left, right) ||
    (h2h.get(right.playerId) ?? 0) - (h2h.get(left.playerId) ?? 0) ||
    right.winPct - left.winPct ||
    right.wins - left.wins
  );
}

/**
 * League table order: 0-match players last, then points desc, sos desc,
 * head-to-head points within the tied group desc, win % desc, wins desc, and
 * finally name asc (`name ?? playerId`) so the order is always total.
 *
 * `h2h` holds head-to-head points for the group tied on points and sos; pass
 * an empty map when comparing rows outside such a group.
 */
export function compareLeagueRows(
  left: LeagueRow,
  right: LeagueRow,
  h2h: ReadonlyMap<string, number> = new Map(),
): number {
  return (
    compareOnMerit(left, right, h2h) ||
    compareText(left.name ?? left.playerId, right.name ?? right.playerId)
  );
}

/**
 * Sort rows with `compareLeagueRows` and assign `rank` (1-based). Head-to-head
 * is worked out once per group of rows tied on played/points/sos. Rows that
 * only the name separates share a rank (standard competition ranking:
 * 1, 2, 2, 4).
 */
export function rankLeagueTable<T extends LeagueRow>(rows: readonly T[]): RankedLeagueRow<T>[] {
  const preliminary = [...rows].sort(compareBeforeHeadToHead);

  // Head-to-head for each run of rows tied on played/points/sos.
  const h2h = new Map<string, number>();
  let groupStart = 0;
  for (let index = 1; index <= preliminary.length; index += 1) {
    const sameGroup =
      index < preliminary.length &&
      compareBeforeHeadToHead(preliminary[groupStart], preliminary[index]) === 0;
    if (sameGroup) continue;
    for (const [playerId, total] of headToHeadWithinGroup(preliminary.slice(groupStart, index))) {
      h2h.set(playerId, total);
    }
    groupStart = index;
  }

  const sorted = [...rows].sort((left, right) => compareLeagueRows(left, right, h2h));
  const ranked: RankedLeagueRow<T>[] = [];
  sorted.forEach((row, index) => {
    const previous = ranked[index - 1];
    const rank =
      previous !== undefined && compareOnMerit(previous, row, h2h) === 0 ? previous.rank : index + 1;
    ranked.push({ ...row, rank });
  });
  return ranked;
}
