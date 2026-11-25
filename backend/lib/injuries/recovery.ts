/**
 * Weekly Sunday recovery (INJ-05), a weekly job (ECO-06, `weeklyJobs.ts`).
 *
 * Once per league week (Sunday 00:00 league time, see `leagueWeek.ts`):
 * - every player's stamina recovers (`recover` in `lib/policies/fatigue.ts`:
 *   full, or +N capped);
 * - every open injury whose `returnsAt` has passed ends with
 *   `endedReason: 'recovered'`, the player's `currentInjury` is cleared and
 *   the player is told they are cleared to compete.
 *
 * Recovery is not idempotent (+N twice is wrong), so the week is claimed in
 * site config (`weeklyJob#recovery`) BEFORE any work: the conditional write
 * lets exactly one run win. A player whose write keeps failing is logged and
 * left for the GMs; the week is not retried. A week whose first tick finds the
 * `injuries` flag off is recorded as skipped, like payroll with `economy`.
 *
 * Each player is one unit of work (stamina and injury end together), guarded
 * on the stamina and injury it read, and retried on a fresh read if a match
 * result or a GM edit got there first.
 */
import { ConcurrencyError, getRepositories, type Injury, type Player } from '../repositories';
import { createNotification } from '../notifications';
import { leagueWeekOf, type LeagueWeek } from '../leagueWeek';
import { recover } from '../policies/fatigue';
import type { InjuryTunables } from '../policies/fatigueDefaults';
import { currentStamina } from './index';

export const RECOVERY_JOB = 'recovery';

export const CLEARED_TO_COMPETE_MESSAGE = "You're cleared to compete.";

const MAX_ATTEMPTS = 3;

export type RecoveryStatus = 'recovered' | 'alreadyRun' | 'injuriesOff' | 'incomplete';

export interface RecoveryResult {
  status: RecoveryStatus;
  weekKey: string;
  /** Players whose stamina went up. */
  staminaRecovered: number;
  /** Injury ids ended by this run. */
  injuriesEnded: string[];
  /** Players (or injuries of deleted players) that could not be written. */
  failed: number;
}

type PlayerOutcome = { staminaRecovered: boolean; ended: Injury[] };

const isDue = (returnsAt: string, now: Date): boolean => Date.parse(returnsAt) <= now.getTime();

/** Recover one player and end their due injuries, retrying on a fresh read after a race. */
async function recoverPlayer(
  initial: Player,
  initialDueRows: Injury[],
  now: Date,
  tunables: InjuryTunables,
): Promise<PlayerOutcome> {
  const repos = getRepositories();
  const nowIso = now.toISOString();
  let player: Player | null = initial;
  let dueRows = initialDueRows;

  for (let attempt = 1; ; attempt++) {
    if (!player) return { staminaRecovered: false, ended: [] };
    const stamina = currentStamina(player, tunables.maxStamina);
    const nextStamina = recover(stamina, tunables);
    const staminaChanges = nextStamina !== stamina;
    const clearsInjury = player.currentInjury !== undefined && isDue(player.currentInjury.returnsAt, now);
    if (!staminaChanges && !clearsInjury && dueRows.length === 0) {
      return { staminaRecovered: false, ended: [] };
    }

    const subject: Player = player;
    const rows = dueRows;
    try {
      await repos.runInTransaction(async (tx) => {
        if (staminaChanges || clearsInjury) {
          tx.updatePlayerCondition(
            subject.playerId,
            {
              ...(staminaChanges && { stamina: nextStamina }),
              ...(clearsInjury && { currentInjury: null }),
            },
            { stamina: subject.stamina ?? null, currentInjuryId: subject.currentInjury?.injuryId ?? null },
          );
        }
        for (const row of rows) {
          tx.updateInjury(row.playerId, row.startedAt, { endedAt: nowIso, endedReason: 'recovered' });
        }
      });
      return { staminaRecovered: staminaChanges && nextStamina > stamina, ended: rows };
    } catch (err) {
      if (!(err instanceof ConcurrencyError) || attempt >= MAX_ATTEMPTS) throw err;
      // A result drained stamina, or a GM healed or moved the injury: read again.
      player = await repos.roster.players.findById(subject.playerId);
      dueRows = (await repos.injuries.listByPlayer(subject.playerId))
        .filter((row) => row.endedAt === undefined && isDue(row.returnsAt, now));
    }
  }
}

/** End one due injury of a player who is no longer on the roster (no player row to touch). */
async function endOrphanInjury(row: Injury, now: Date): Promise<boolean> {
  try {
    await getRepositories().runInTransaction(async (tx) => {
      tx.updateInjury(row.playerId, row.startedAt, { endedAt: now.toISOString(), endedReason: 'recovered' });
    });
    return true;
  } catch (err) {
    if (err instanceof ConcurrencyError) return false; // already ended
    throw err;
  }
}

async function notifyCleared(player: Player, injury: Injury): Promise<void> {
  if (!player.userId) return;
  try {
    await createNotification({
      userId: player.userId,
      type: 'injury_recovered',
      message: CLEARED_TO_COMPETE_MESSAGE,
      sourceId: injury.injuryId,
      sourceType: 'injury',
    });
  } catch (err) {
    console.warn(`Failed to tell ${player.playerId} they are cleared to compete:`, err);
  }
}

/**
 * Run this league week's recovery, if no run has claimed it yet. Safe to call
 * every hour and from several runs at once; at most one recovers.
 */
export async function runRecovery(now: Date = new Date(), week: LeagueWeek = leagueWeekOf(now)): Promise<RecoveryResult> {
  const repos = getRepositories();
  const { siteConfig } = repos.user;
  const result: RecoveryResult = {
    status: 'recovered',
    weekKey: week.weekKey,
    staminaRecovered: 0,
    injuriesEnded: [],
    failed: 0,
  };

  // `>=`, not `===`, as in payroll: moving the league time zone west can put
  // "now" back in a week that has already recovered. Week keys sort as dates.
  const lastWeek = await siteConfig.getWeeklyJobWeek(RECOVERY_JOB);
  if (lastWeek !== null && lastWeek >= week.weekKey) {
    return { ...result, status: 'alreadyRun' };
  }

  const features = await siteConfig.getFeatures();
  if (!features.injuries) {
    await siteConfig.markWeeklyJobWeek(RECOVERY_JOB, week.weekKey);
    return { ...result, status: 'injuriesOff' };
  }

  // Claim before working: only the run whose conditional write lands goes on.
  if (!(await siteConfig.markWeeklyJobWeek(RECOVERY_JOB, week.weekKey))) {
    return { ...result, status: 'alreadyRun' };
  }

  const tunables = await siteConfig.getInjuryTunables();
  const [players, openInjuries] = await Promise.all([repos.roster.players.list(), repos.injuries.listOpen()]);

  const dueByPlayer = new Map<string, Injury[]>();
  for (const row of openInjuries) {
    if (!isDue(row.returnsAt, now)) continue;
    dueByPlayer.set(row.playerId, [...(dueByPlayer.get(row.playerId) ?? []), row]);
  }

  for (const player of players) {
    const dueRows = dueByPlayer.get(player.playerId) ?? [];
    dueByPlayer.delete(player.playerId);
    try {
      const outcome = await recoverPlayer(player, dueRows, now, tunables);
      if (outcome.staminaRecovered) result.staminaRecovered++;
      for (const row of outcome.ended) {
        result.injuriesEnded.push(row.injuryId);
        await notifyCleared(player, row);
      }
    } catch (err) {
      result.failed++;
      console.error(`Recovery failed for player ${player.playerId} (week ${week.weekKey}):`, err);
    }
  }

  // Due injuries of players no longer on the roster: close the rows only.
  for (const rows of dueByPlayer.values()) {
    for (const row of rows) {
      try {
        if (await endOrphanInjury(row, now)) result.injuriesEnded.push(row.injuryId);
      } catch (err) {
        result.failed++;
        console.error(`Recovery failed to end injury ${row.injuryId} (week ${week.weekKey}):`, err);
      }
    }
  }

  return result.failed > 0 ? { ...result, status: 'incomplete' } : result;
}
