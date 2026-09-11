import { getRepositories } from './repositories';
import type { Division, DivisionLadderRules, DivisionMovement, Match, Player } from './repositories';
import { computeLadderStreak, evaluateLadderMove } from './divisionLadder';
import { createNotification } from './notifications';

export interface ApplyDivisionLadderInput {
  matchId: string;
  winners: string[];
  losers: string[];
}

/**
 * IO wrapper around the pure ladder helpers. Called from recordResult after
 * the completed match has been persisted so `listCompleted()` includes it.
 *
 * For every distinct player on the match: compute the streak since their
 * last division change, evaluate a move, and on a move update the player,
 * write a movement row, and notify the player's user. Never throws — a
 * ladder failure must not fail result recording.
 */
export async function applyDivisionLadder(
  input: ApplyDivisionLadderInput,
): Promise<DivisionMovement[]> {
  const movements: DivisionMovement[] = [];

  try {
    const { user, leagueOps, competition } = getRepositories();

    const rules = await user.siteConfig.getDivisionLadderRules();
    if (!rules.enabled) return movements;

    const playerIds = Array.from(new Set([...input.winners, ...input.losers]));
    if (playerIds.length === 0) return movements;

    const [divisions, completedMatches]: [Division[], Match[]] = await Promise.all([
      leagueOps.divisions.list(),
      competition.matches.listCompleted(),
    ]);

    for (const playerId of playerIds) {
      try {
        const movement = await applyForPlayer({
          playerId,
          matchId: input.matchId,
          rules,
          divisions,
          completedMatches,
        });
        if (movement) movements.push(movement);
      } catch (playerError: unknown) {
        console.error(`Division ladder failed for player ${playerId}:`, playerError);
      }
    }
  } catch (error: unknown) {
    console.error('Division ladder failed:', error);
  }

  return movements;
}

interface ApplyForPlayerInput {
  playerId: string;
  matchId: string;
  rules: DivisionLadderRules;
  divisions: Division[];
  completedMatches: Match[];
}

async function applyForPlayer(input: ApplyForPlayerInput): Promise<DivisionMovement | null> {
  const { roster, leagueOps } = getRepositories();
  const { playerId, matchId, rules, divisions, completedMatches } = input;

  const player: Player | null = await roster.players.findById(playerId);
  if (!player) return null;

  const streak = computeLadderStreak(playerId, completedMatches, player.divisionChangedAt);
  const move = evaluateLadderMove({ player, streak, rules, divisions });
  if (!move) return null;

  const now = new Date().toISOString();

  await roster.players.update(playerId, {
    divisionId: move.toDivisionId,
    divisionChangedAt: now,
  });

  const movement = await leagueOps.divisionMovements.create({
    playerId,
    fromDivisionId: move.fromDivisionId,
    toDivisionId: move.toDivisionId,
    direction: move.direction,
    trigger: 'streak',
    matchId,
    streakCount: streak.count,
    movedAt: now,
  });

  if (player.userId) {
    const target = divisions.find((division) => division.divisionId === move.toDivisionId);
    const divisionName = target?.name ?? 'a new division';
    const message =
      move.direction === 'promoted'
        ? `You've been promoted to ${divisionName} after a ${streak.count}-match win streak.`
        : `You've been demoted to ${divisionName} after a ${streak.count}-match losing streak.`;

    await createNotification({
      userId: player.userId,
      type: move.direction === 'promoted' ? 'division_promoted' : 'division_demoted',
      message,
      sourceId: movement.movementId,
      sourceType: 'division',
    });
  }

  return movement;
}
