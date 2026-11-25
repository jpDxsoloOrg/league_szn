/**
 * Weekly payroll and season contract endings (ECO-06).
 *
 * Payroll: once per league week (Sunday 00:00 league time, see `leagueWeek.ts`)
 * every active contract with `weeklySalary > 0` posts one `salary` entry with
 * the key `salary#{weekKey}#{contractId}`, so a retried or concurrent run never
 * pays twice. A contract is paid for a week when it was already active at the
 * moment the week started. A contract that starts mid-week therefore gets its
 * full salary on its first Sunday (no prorating), and one that ends mid-week
 * gets nothing for that part week.
 *
 * The run is recorded per week in site config (`weeklyJob#payroll`) only once
 * every contract was handled, so a failure is retried on the next hourly tick.
 * A week whose first tick finds the `economy` flag off is recorded as skipped:
 * turning the flag on later in the week never back-pays that week.
 *
 * Season contracts end with their season: `endSeasonContracts` moves every
 * active `season` contract of that season to `completed` (`seasonEnded`),
 * clears the player's `activeContractId` and tells the player. The season
 * update calls it; payroll also ends any it finds whose season is already
 * completed (instead of paying them), in case that call failed.
 */
import {
  ConcurrencyError,
  DuplicatePostingError,
  getRepositories,
  type Contract,
} from '../repositories';
import { createNotification } from '../notifications';
import { leagueWeekOf, type LeagueWeek } from '../leagueWeek';

export const PAYROLL_JOB = 'payroll';

export const SEASON_CONTRACT_ENDED_MESSAGE = "Your season contract ended with the season. You're now a free agent.";

export const salaryKey = (weekKey: string, contractId: string): string => `salary#${weekKey}#${contractId}`;

/** Whether a contract is owed salary for the week that started at `weekStart`. */
export function isOwedSalary(
  contract: Pick<Contract, 'status' | 'weeklySalary' | 'startedAt'>,
  weekStart: Date,
): boolean {
  if (contract.status !== 'active' || contract.weeklySalary <= 0 || !contract.startedAt) return false;
  return Date.parse(contract.startedAt) <= weekStart.getTime();
}

// ─── Season end ────────────────────────────────────────────────────────

export interface EndSeasonContractsResult {
  ended: string[];
  failed: number;
}

/** End one active season contract. Returns false when it was no longer active. */
async function endSeasonContract(contract: Contract, nowIso: string): Promise<boolean> {
  const repos = getRepositories();
  try {
    await repos.runInTransaction(async (tx) => {
      tx.updateContract(contract.contractId, {
        status: 'completed',
        endedAt: nowIso,
        endReason: 'seasonEnded',
      }, 'active');
      tx.clearPlayerActiveContract(contract.playerId, contract.contractId);
    });
  } catch (err) {
    if (!(err instanceof ConcurrencyError)) throw err;
    // Either the contract already left `active`, or the player's pointer no
    // longer names it. Retry the contract on its own in the second case.
    const current = await repos.contracts.findById(contract.contractId);
    if (!current || current.status !== 'active') return false;
    try {
      await repos.contracts.update(contract.contractId, {
        status: 'completed',
        endedAt: nowIso,
        endReason: 'seasonEnded',
      }, 'active');
    } catch (retryErr) {
      if (retryErr instanceof ConcurrencyError) return false;
      throw retryErr;
    }
  }

  const player = await repos.roster.players.findById(contract.playerId);
  if (player?.userId) {
    try {
      await createNotification({
        userId: player.userId,
        type: 'contract_completed',
        message: SEASON_CONTRACT_ENDED_MESSAGE,
        sourceId: contract.contractId,
        sourceType: 'contract',
      });
    } catch (err) {
      console.warn(`Failed to notify ${contract.playerId} that contract ${contract.contractId} ended:`, err);
    }
  }
  return true;
}

/**
 * Complete every active season contract tied to `seasonId`. Contracts of other
 * seasons and other types are left alone. Runs whatever the economy flag says:
 * it is contract lifecycle, not money.
 */
export async function endSeasonContracts(seasonId: string, now: Date = new Date()): Promise<EndSeasonContractsResult> {
  const { contracts } = getRepositories();
  const active = await contracts.list({ status: 'active', type: 'season', seasonId });
  const result: EndSeasonContractsResult = { ended: [], failed: 0 };
  const nowIso = now.toISOString();
  for (const contract of active) {
    try {
      if (await endSeasonContract(contract, nowIso)) result.ended.push(contract.contractId);
    } catch (err) {
      result.failed++;
      console.error(`Failed to end season contract ${contract.contractId}:`, err);
    }
  }
  return result;
}

// ─── Payroll ───────────────────────────────────────────────────────────

export type PayrollStatus = 'paid' | 'alreadyRun' | 'economyOff' | 'incomplete';

export interface PayrollResult {
  status: PayrollStatus;
  weekKey: string;
  /** Contracts paid by this run. */
  paid: string[];
  /** Contracts this week's salary was already posted for. */
  alreadyPaid: string[];
  /** Season contracts ended because their season is over. */
  ended: string[];
  failed: number;
}

/**
 * Pay this league week's salaries, if not done yet. Safe to call every hour
 * and from several runs at once.
 */
export async function runPayroll(now: Date = new Date(), week: LeagueWeek = leagueWeekOf(now)): Promise<PayrollResult> {
  const repos = getRepositories();
  const { siteConfig } = repos.user;
  const result: PayrollResult = {
    status: 'paid',
    weekKey: week.weekKey,
    paid: [],
    alreadyPaid: [],
    ended: [],
    failed: 0,
  };

  // `>=`, not `===`: a GM moving the league time zone west (INJ-01) can put
  // "now" back in a week that has already been paid. Week keys sort as dates.
  const lastWeek = await siteConfig.getWeeklyJobWeek(PAYROLL_JOB);
  if (lastWeek !== null && lastWeek >= week.weekKey) {
    return { ...result, status: 'alreadyRun' };
  }

  const features = await siteConfig.getFeatures();
  if (!features.economy) {
    await siteConfig.markWeeklyJobWeek(PAYROLL_JOB, week.weekKey);
    return { ...result, status: 'economyOff' };
  }

  const active = await repos.contracts.list({ status: 'active' });
  const completedSeasons = new Set(
    (await repos.season.seasons.list())
      .filter((season) => season.status === 'completed')
      .map((season) => season.seasonId),
  );
  const nowIso = now.toISOString();

  for (const contract of active) {
    try {
      if (contract.type === 'season' && contract.seasonId && completedSeasons.has(contract.seasonId)) {
        if (await endSeasonContract(contract, nowIso)) result.ended.push(contract.contractId);
        continue;
      }
      if (!isOwedSalary(contract, week.weekStart)) continue;

      await repos.runInTransaction(async (tx) => {
        tx.postLedgerEntry({
          playerId: contract.playerId,
          kind: 'salary',
          amount: contract.weeklySalary,
          idempotencyKey: salaryKey(week.weekKey, contract.contractId),
          ref: { type: 'contract', id: contract.contractId },
          note: `Weekly salary, week of ${week.weekKey}`,
        });
      });
      result.paid.push(contract.contractId);
    } catch (err) {
      if (err instanceof DuplicatePostingError) {
        result.alreadyPaid.push(contract.contractId);
        continue;
      }
      result.failed++;
      console.error(`Payroll failed for contract ${contract.contractId} (week ${week.weekKey}):`, err);
    }
  }

  if (result.failed > 0) return { ...result, status: 'incomplete' };
  await siteConfig.markWeeklyJobWeek(PAYROLL_JOB, week.weekKey);
  return result;
}
