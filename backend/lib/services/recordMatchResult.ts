/**
 * Records a match result (BLD-09). Every path that settles a match goes
 * through here: the hand-entered result (`PUT /matches/{id}/result`) and the
 * official sim (BLD-10).
 *
 * Order of work, unchanged from the original handler:
 *   1. validate the result against the match, its players and its season
 *   2. one transaction: match + all-time records + season standings, plus
 *      stamina drain and injury rolls while the `injuries` flag is on (INJ-04)
 *   3. match pay (ECO-05), then the sim boost refund for manual results (ECO-08)
 *   4. championship, tournament, event auto-complete, group stats,
 *      contender rankings, progression recompute
 *
 * Validation failures throw a `RecordMatchResultError` subclass; the caller
 * maps it to a response. Anything else is unexpected and propagates.
 */
import { getRepositories } from '../repositories';
import type { Match, Championship } from '../repositories';
import { isConcurrentWriteError } from '../repositories/errors';
import { invokeAsync } from '../asyncLambda';
import { triggerProgressionRecompute } from '../progression/trigger';
import { RESULT_NEEDS_CHAMPION_MESSAGE, championIsOnASide } from '../challengeTitle';
import { updateGroupStats } from '../../functions/matches/updateGroupStats';
import { resolveChampionTagTeamId } from '../tagTeams/championTagTeam';
import { settleMatchPay } from '../economy/matchPay';
import { refundSimBoosts } from '../economy/refundSimBoosts';
// INJ-04
import {
  loadMatchConditionPlan,
  matchConditionFields,
  notifyInjuredPlayers,
  stageMatchCondition,
} from '../injuries/applyMatchCondition';
import { notifyStaffOfInjuries } from '../injuries/notifyStaff'; // INJ-07

/**
 * Who settled the match. Only a `manual` result refunds bought sim boosts:
 * a simulated result uses them instead.
 */
export type MatchResultSource = 'manual' | 'sim';

export interface RecordMatchResultInput {
  matchId: string;
  /** Winners, or every participant when `isDraw` is true. */
  winners: string[];
  /** Ignored (stored as empty) for a draw. */
  losers?: string[];
  isDraw?: boolean;
  /**
   * Extra attributes stamped on the match in the same transaction as the
   * result (e.g. the sim's `resultSource` and `simulation`). They cannot
   * override the result fields (winners, losers, status, completedAt, isDraw).
   */
  extraMatchFields?: Record<string, unknown>;
}

export interface RecordMatchResultContext {
  source: MatchResultSource;
}

export interface RecordMatchResultOutcome {
  /** The match as it stands after the result, including any extra fields. */
  match: Match & Record<string, unknown>;
}

export type RecordMatchResultErrorKind = 'badRequest' | 'notFound' | 'conflict';

export abstract class RecordMatchResultError extends Error {
  abstract readonly kind: RecordMatchResultErrorKind;
}

export class RecordMatchResultBadRequestError extends RecordMatchResultError {
  readonly kind = 'badRequest' as const;
  constructor(message: string) {
    super(message);
    this.name = 'RecordMatchResultBadRequestError';
  }
}

export class RecordMatchResultNotFoundError extends RecordMatchResultError {
  readonly kind = 'notFound' as const;
  constructor(message: string) {
    super(message);
    this.name = 'RecordMatchResultNotFoundError';
  }
}

export class RecordMatchResultConflictError extends RecordMatchResultError {
  readonly kind = 'conflict' as const;
  constructor(message: string) {
    super(message);
    this.name = 'RecordMatchResultConflictError';
  }
}

export async function recordMatchResult(
  input: RecordMatchResultInput,
  context: RecordMatchResultContext,
): Promise<RecordMatchResultOutcome> {
  const { matchId } = input;
  if (!matchId) {
    throw new RecordMatchResultBadRequestError('Match ID is required');
  }

  // As in the original handler, validation treats any truthy isDraw as a draw
  // (JSON bodies are untyped) while the recorded outcome needs a strict true.
  const isDraw = input.isDraw === true;
  const winners = input.winners;
  let losers: string[];

  if (input.isDraw) {
    if (!winners || winners.length === 0) {
      throw new RecordMatchResultBadRequestError('Draw participants are required (send as winners)');
    }
    losers = [];
  } else {
    if (!winners || !input.losers || winners.length === 0 || input.losers.length === 0) {
      throw new RecordMatchResultBadRequestError('Winners and losers are required');
    }
    losers = input.losers;

    const overlap = winners.filter((winnerId) => losers.includes(winnerId));
    if (overlap.length > 0) {
      throw new RecordMatchResultBadRequestError('A player cannot be both a winner and loser in the same match');
    }
  }

  const {
    competition: { matches, tournaments, championships },
    roster: { players },
    season: { seasons },
    runInTransaction,
  } = getRepositories();

  const match = await matches.findByIdWithDate(matchId);
  if (!match) {
    throw new RecordMatchResultNotFoundError('Match not found');
  }

  if (match.status === 'completed') {
    throw new RecordMatchResultBadRequestError('Match has already been completed');
  }

  if (match.status === 'open-signups') {
    throw new RecordMatchResultConflictError('Cannot record result on a match with open signups — fill all slots first');
  }

  const allParticipants = isDraw ? [...winners] : [...winners, ...losers];

  if (new Set(allParticipants).size !== allParticipants.length) {
    throw new RecordMatchResultBadRequestError('A player can only appear once in a match result');
  }

  const matchParticipants = match.participants || [];
  if (allParticipants.some((playerId) => !matchParticipants.includes(playerId))) {
    throw new RecordMatchResultBadRequestError('Winners and losers must be participants in this match');
  }

  const resultPlayers = await Promise.all(allParticipants.map((playerId) => players.findById(playerId)));
  if (resultPlayers.some((player) => !player)) {
    throw new RecordMatchResultConflictError('A player in this result no longer exists. Update the match participants first.');
  }

  if (match.seasonId) {
    const season = await seasons.findById(match.seasonId);
    if (!season) {
      throw new RecordMatchResultConflictError('This match belongs to a season that no longer exists. Update the match season first.');
    }
    if (season.status !== 'active') {
      throw new RecordMatchResultConflictError(`Season "${season.name}" has ended, so its standings are final. Update the match season first.`);
    }
  }

  // The title can change hands after a challenge is booked, and the result
  // crowns whoever wins. As at booking, staff-booked title matches are not
  // held to this, and a draw leaves the title where it is.
  if (!isDraw && match.isChampionship && match.championshipId && match.challengeId) {
    const championship = await championships.findById(match.championshipId);
    const sides = match.teams?.length ? match.teams : [matchParticipants];
    if (championship && !championIsOnASide(championship, sides)) {
      throw new RecordMatchResultConflictError(RESULT_NEEDS_CHAMPION_MESSAGE);
    }
  }

  if (isDraw && match.tournamentId) {
    const tournament = await tournaments.findById(match.tournamentId);
    if (tournament?.type === 'single-elimination') {
      throw new RecordMatchResultBadRequestError('Single-elimination tournament matches cannot end in a draw');
    }
  }

  // ── Core transaction: match + player standings + season standings ──
  // completedAt is written once: the notCompleted guard below rejects a
  // re-record, so a stored completion time is never overwritten.
  const completedAt = new Date().toISOString();
  const resultFields: Record<string, unknown> = {
    winners,
    losers,
    status: 'completed',
    completedAt,
  };
  if (isDraw) resultFields.isDraw = true;

  // INJ-04: every participant drains and rolls for injury, in the same
  // transaction. Draws and DQs count the same. A sim result drains by the
  // category the sim used.
  const simulation = input.extraMatchFields?.simulation as { category?: unknown } | undefined;
  const conditionPlan = await loadMatchConditionPlan(match, { now: completedAt, category: simulation?.category });
  if (conditionPlan) Object.assign(resultFields, matchConditionFields(conditionPlan));

  // Extra fields first so they can never override the result itself.
  const matchPatch: Record<string, unknown> = { ...input.extraMatchFields, ...resultFields };

  try {
    await runInTransaction(async (tx) => {
      // 1. Update match with results
      tx.updateMatch(matchId, match.date, matchPatch, { kind: 'notCompleted' });

      // 2. Update player standings (all-time)
      for (const playerId of winners) {
        tx.incrementPlayerRecord(playerId, isDraw ? { draws: 1 } : { wins: 1 });
      }
      if (!isDraw) {
        for (const playerId of losers) {
          tx.incrementPlayerRecord(playerId, { losses: 1 });
        }
      }

      // 3. Update season standings if match belongs to a season
      if (match.seasonId) {
        for (const playerId of winners) {
          tx.incrementStanding(match.seasonId, playerId, isDraw ? { draws: 1 } : { wins: 1 });
        }
        if (!isDraw) {
          for (const playerId of losers) {
            tx.incrementStanding(match.seasonId, playerId, { losses: 1 });
          }
        }
      }

      // Stamina drain and new injuries (INJ-04)
      if (conditionPlan) stageMatchCondition(tx, conditionPlan);
    });
  } catch (transactError: unknown) {
    if (isConcurrentWriteError(transactError)) {
      throw new RecordMatchResultConflictError('Match result could not be recorded due to a concurrent update. Please try again.');
    }
    throw transactError;
  }

  // INJ-04: tell each newly injured player. Never fails the result.
  if (conditionPlan) await notifyInjuredPlayers(conditionPlan, match);

  // INJ-07: tell staff who is out and which bookings and titles that affects.
  if (conditionPlan && conditionPlan.injured.length > 0) {
    await notifyStaffOfInjuries(
      conditionPlan.injured.map(({ player, injury }) => ({ player, returnsAt: injury.returnsAt })),
      { timeZone: conditionPlan.timezone },
    );
  }

  // ── Match pay (ECO-05) ─────────────────────────────────────────────
  // Its own unit of work right after the result: a ledger posting cannot
  // share a transaction with the player-record writes above. Idempotent,
  // so a failure here never fails the result. See lib/economy/matchPay.ts.
  // Paid for every result, manual or simulated.
  try {
    await settleMatchPay(matchId);
  } catch (err) {
    console.error(`Match pay failed for ${matchId}:`, err);
  }

  // ── ECO-08: sim interference on a hand-recorded match is refunded ──
  // A manual result never used the bought boosts. A simulated result does,
  // so it keeps them. Refunds are idempotent; a failure is logged.
  if (context.source === 'manual' && match.simBoosts?.length) {
    try {
      await refundSimBoosts(match, 'manualResult');
    } catch (err) {
      console.warn('Sim boost refund failed:', err);
    }
  }

  // ── Championship handling (separate from core transaction) ─────────
  if (match.isChampionship && match.championshipId) {
    await handleChampionshipResult(match, winners, isDraw);
  }

  // ── Tournament progression ─────────────────────────────────────────
  if (match.tournamentId) {
    await handleTournamentProgression(match, winners, losers, isDraw, allParticipants);
  }

  // ── Auto-complete event ────────────────────────────────────────────
  try {
    await autoCompleteEvent(matchId);
  } catch (err) {
    console.warn('Event auto-complete failed:', err);
  }

  // ── Side effects ───────────────────────────────────────────────────
  try {
    await updateGroupStats({
      winners,
      losers,
      isDraw,
      participants: allParticipants,
      teams: match.teams,
    });
  } catch (err) {
    console.warn('Group stats update failed:', err);
  }

  try {
    await invokeAsync('contenders', { source: 'recordResult' });
  } catch (err) {
    console.warn('Failed to invoke calculateRankings async:', err);
  }

  // Every participant: matchesCompeted counts players in neither winners nor losers too.
  await triggerProgressionRecompute(matchParticipants, 'recordResult');

  return {
    match: {
      ...match,
      ...input.extraMatchFields,
      winners,
      losers,
      status: 'completed' as const,
      completedAt,
      ...(isDraw && { isDraw: true }),
      ...(conditionPlan && matchConditionFields(conditionPlan)),
    },
  };
}

// ── Championship handling ──────────────────────────────────────────────

async function handleChampionshipResult(
  match: Match & { date: string },
  winners: string[],
  isDraw: boolean,
): Promise<void> {
  if (isDraw) return; // Draws don't affect championships

  const { competition: { championships, contenders, matches: matchesRepo }, runInTransaction } = getRepositories();
  const championshipId = match.championshipId!;

  const championship = await championships.findById(championshipId);
  if (!championship) return;

  const newChampion = winners.length === 1 ? winners[0] : winners;
  const oldChampion = championship.currentChampion;

  const isTitleDefense = oldChampion != null && (
    (typeof oldChampion === 'string' && typeof newChampion === 'string' && oldChampion === newChampion) ||
    (Array.isArray(oldChampion) && Array.isArray(newChampion) &&
      oldChampion.length === newChampion.length &&
      JSON.stringify([...oldChampion].sort()) === JSON.stringify([...newChampion].sort()))
  );

  // Store isTitleDefense flag on match for downstream consumers (season awards, UI).
  // This is a standalone update, not part of any transaction. It stays
  // unguarded: the match is already completed by the time it runs.
  const matchForUpdate = await matchesRepo.findByIdWithDate(match.matchId);
  if (matchForUpdate) {
    // Use a simple UoW for this single update
    await runInTransaction(async (tx) => {
      tx.updateMatch(match.matchId, match.date, { isTitleDefense });
    });
  }

  if (isTitleDefense) {
    // Title defense: increment defenses on the current reign
    const currentReign = await championships.findCurrentReign(championshipId);
    if (currentReign) {
      await championships.incrementDefenses(championshipId, currentReign.wonDate);
    }
  } else {
    // Title change: new champion crowned
    await handleTitleChange(championship, newChampion, match.matchId, oldChampion);

    // Auto-remove contender overrides for new champion(s)
    const championIds: string[] = Array.isArray(newChampion) ? newChampion : [newChampion];
    for (const champId of championIds) {
      try {
        const existingOverride = await contenders.findOverride(championshipId, champId);
        if (existingOverride && existingOverride.active) {
          await contenders.deactivateOverride(championshipId, champId, 'auto-removed: player became champion');
        }
      } catch (err) {
        console.warn(`Failed to auto-remove contender override for player ${champId}:`, err);
      }
    }
  }
}

async function handleTitleChange(
  championship: Championship,
  newChampion: string | string[],
  matchId: string,
  oldChampion: string | string[] | undefined,
): Promise<void> {
  const { competition: { championships }, runInTransaction } = getRepositories();
  const championshipId = championship.championshipId;

  // Find current reign to close it
  const currentReign = oldChampion ? await championships.findCurrentReign(championshipId) : null;

  const wonDate = new Date().toISOString();

  // Tag titles: record which registered team won (TTC-10). A random pairing
  // resolves to null and the reign carries no tagTeamId.
  let tagTeamId: string | null = null;
  if (championship.type === 'tag' && Array.isArray(newChampion)) {
    try {
      tagTeamId = await resolveChampionTagTeamId(newChampion, wonDate);
    } catch (err) {
      console.warn(`Failed to resolve tag team for championship ${championshipId}:`, err);
    }
  }
  const championshipPatch: Record<string, unknown> = { currentChampion: newChampion };
  if (tagTeamId) {
    championshipPatch.currentTagTeamId = tagTeamId;
  } else if (championship.currentTagTeamId) {
    // The title left a team for a non-team holder: null removes the field.
    championshipPatch.currentTagTeamId = null;
  }

  await runInTransaction(async (tx) => {
    // Update championship current champion
    tx.updateChampionship(championshipId, championshipPatch);

    // Close old reign if exists
    if (currentReign) {
      const reignStartDate = new Date(currentReign.wonDate);
      const lostDate = new Date();
      const daysHeld = Math.floor((lostDate.getTime() - reignStartDate.getTime()) / (1000 * 60 * 60 * 24));
      tx.closeReign(championshipId, currentReign.wonDate, lostDate.toISOString(), daysHeld);
    }

    // Create new reign
    tx.startReign({
      championshipId,
      wonDate,
      champion: newChampion,
      ...(tagTeamId ? { tagTeamId } : {}),
      matchId,
      defenses: 0,
      updatedAt: wonDate,
    });
  });
}

// ── Tournament progression ─────────────────────────────────────────────

type CompletedRoundRobinMatch = Pick<Match, 'participants' | 'winners' | 'isDraw'>;

/**
 * Round-robin winner: most points, then most wins, then most wins in matches
 * between the players still tied. A tie that survives all three goes to the
 * lowest playerId, so the outcome never depends on the order results arrived.
 */
function pickRoundRobinWinner(
  standings: Record<string, { wins: number; points: number }>,
  completedMatches: CompletedRoundRobinMatch[],
): string {
  const keepHighest = (playerIds: string[], score: (playerId: string) => number): string[] => {
    const best = Math.max(...playerIds.map(score));
    return playerIds.filter((playerId) => score(playerId) === best);
  };

  const byPoints = keepHighest(Object.keys(standings), (playerId) => standings[playerId].points);
  const tied = keepHighest(byPoints, (playerId) => standings[playerId].wins);

  const headToHeadWins = new Map<string, number>();
  for (const completed of completedMatches) {
    if (completed.isDraw) continue;
    const tiedInMatch = completed.participants.filter((playerId) => tied.includes(playerId));
    if (tiedInMatch.length < 2) continue;
    for (const playerId of completed.winners || []) {
      if (tiedInMatch.includes(playerId)) {
        headToHeadWins.set(playerId, (headToHeadWins.get(playerId) || 0) + 1);
      }
    }
  }

  return keepHighest(tied, (playerId) => headToHeadWins.get(playerId) || 0).sort()[0];
}

async function handleTournamentProgression(
  match: Match,
  winners: string[],
  losers: string[],
  isDraw: boolean,
  allParticipants: string[],
): Promise<void> {
  const { competition: { tournaments, matches } } = getRepositories();
  const tournamentId = match.tournamentId!;

  const tournament = await tournaments.findById(tournamentId);
  if (!tournament) return;

  if (tournament.type === 'round-robin') {
    const standings = (tournament.standings as Record<string, { wins: number; losses: number; draws: number; points: number }>) || {};

    for (const playerId of allParticipants) {
      if (!standings[playerId]) {
        standings[playerId] = { wins: 0, losses: 0, draws: 0, points: 0 };
      }
    }

    if (isDraw) {
      for (const playerId of winners) {
        standings[playerId].draws += 1;
        standings[playerId].points += 1;
      }
    } else {
      for (const playerId of winners) {
        standings[playerId].wins += 1;
        standings[playerId].points += 2;
      }
      for (const playerId of losers) {
        standings[playerId].losses += 1;
      }
    }

    // Check if round-robin is complete
    const participants = (tournament.participants || []) as string[];
    const expectedTotalMatches = (participants.length * (participants.length - 1)) / 2;

    // The tournament index is eventually consistent and may not show the
    // result committed moments ago, so this match is merged in explicitly.
    const tournamentMatches = await matches.listByTournament(tournamentId);
    const completedMatches: CompletedRoundRobinMatch[] = [
      ...tournamentMatches.filter((m) => m.status === 'completed' && m.matchId !== match.matchId),
      { ...match, winners, isDraw },
    ];

    const isComplete = completedMatches.length >= expectedTotalMatches;

    if (isComplete) {
      const winner = pickRoundRobinWinner(standings, completedMatches);
      await tournaments.update(tournamentId, { standings, winner, status: 'completed' } as Partial<typeof tournament>);
    } else {
      const newStatus = tournament.status === 'upcoming' ? 'in-progress' : tournament.status;
      await tournaments.update(tournamentId, { standings, status: newStatus } as Partial<typeof tournament>);
    }
  }

  if (tournament.type === 'single-elimination' && tournament.brackets) {
    const brackets = tournament.brackets as {
      rounds: Array<{
        matches: Array<{
          participant1?: string;
          participant2?: string;
          winner?: string;
          matchId?: string;
        }>;
      }>;
    };
    const winner = winners[0];
    const matchParticipants = match.participants;

    let foundRoundIndex = -1;
    let foundMatchIndex = -1;

    for (let roundIndex = 0; roundIndex < brackets.rounds.length; roundIndex++) {
      const round = brackets.rounds[roundIndex];
      if (!round?.matches) continue;
      for (let matchIndex = 0; matchIndex < round.matches.length; matchIndex++) {
        const bracketMatch = round.matches[matchIndex];
        if (!bracketMatch) continue;
        if (
          bracketMatch.participant1 &&
          bracketMatch.participant2 &&
          matchParticipants.includes(bracketMatch.participant1) &&
          matchParticipants.includes(bracketMatch.participant2) &&
          !bracketMatch.winner
        ) {
          foundRoundIndex = roundIndex;
          foundMatchIndex = matchIndex;
          break;
        }
      }
      if (foundRoundIndex !== -1) break;
    }

    if (foundRoundIndex !== -1 && foundMatchIndex !== -1) {
      const foundMatch = brackets.rounds[foundRoundIndex]?.matches?.[foundMatchIndex];
      if (!foundMatch) {
        console.warn(`Corrupted bracket data: round ${foundRoundIndex} match ${foundMatchIndex} is null`);
        return;
      }

      foundMatch.winner = winner;
      foundMatch.matchId = match.matchId;

      const isLastRound = foundRoundIndex === brackets.rounds.length - 1;

      if (isLastRound) {
        await tournaments.update(tournamentId, { brackets, winner, status: 'completed' } as Partial<typeof tournament>);
      } else {
        const nextRoundIndex = foundRoundIndex + 1;
        const nextMatchIndex = Math.floor(foundMatchIndex / 2);
        const isFirstOfPair = foundMatchIndex % 2 === 0;

        const nextMatch = brackets.rounds[nextRoundIndex]?.matches?.[nextMatchIndex];
        if (nextMatch) {
          if (isFirstOfPair) {
            nextMatch.participant1 = winner;
          } else {
            nextMatch.participant2 = winner;
          }
        }

        const newStatus = tournament.status === 'upcoming' ? 'in-progress' : tournament.status;
        await tournaments.update(tournamentId, { brackets, status: newStatus } as Partial<typeof tournament>);
      }
    }
  }
}

// ── Auto-complete event ────────────────────────────────────────────────

async function autoCompleteEvent(matchId: string): Promise<void> {
  const { leagueOps: { events }, competition: { matches } } = getRepositories();

  // Find events that are upcoming or in-progress
  const allEvents = await events.list();
  const activeEvents = allEvents.filter(
    (e) => e.status === 'upcoming' || e.status === 'in-progress',
  );

  for (const eventItem of activeEvents) {
    const matchCards = eventItem.matchCards || [];
    const matchIds = matchCards.map((c) => c.matchId).filter(Boolean);

    if (!matchIds.includes(matchId)) continue;
    if (matchIds.length === 0) continue;

    // Check if ALL matches are completed
    let allCompleted = true;
    for (const mId of matchIds) {
      const m = await matches.findById(mId);
      // A card whose match is gone must not hold the event open for good.
      if (m && m.status !== 'completed') {
        allCompleted = false;
        break;
      }
    }

    if (allCompleted) {
      await events.update(eventItem.eventId, { status: 'completed' });
      console.log(`Event ${eventItem.eventId} auto-completed: all ${matchIds.length} matches finished`);
    } else if (eventItem.status === 'upcoming') {
      await events.update(eventItem.eventId, { status: 'in-progress' });
      console.log(`Event ${eventItem.eventId} marked as in-progress`);
    }

    break; // A match should only belong to one event
  }
}
