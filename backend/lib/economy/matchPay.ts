/**
 * Match pay (ECO-05): what a recorded result pays, and how a revert takes it back.
 *
 * For each participant of a completed match (no-shows excluded):
 * - an active contract pays its `perMatchPay`          key `match#{matchId}#pay#{playerId}`
 * - a winner gets the contract's `winBonus`, or the
 *   settings' `freeAgentWinBonus` without a contract   key `match#{matchId}#win#{playerId}`
 *   (draws pay no bonus)
 * - the match counts against the active contract (`afterMatch`); a tryout or
 *   match contract that reaches its total moves to `completed`, the player's
 *   `activeContractId` is cleared and the player is told they are a free agent.
 *
 * Where the writes go: NOT in the result transaction. `tx.postLedgerEntry`
 * refuses a unit of work that also writes the player's row, and recordResult's
 * transaction increments every participant's record. So pay is settled in its
 * own unit of work right after the result commits:
 *   1. ledger postings + contract counts + `match.paySettlement` in one
 *      transaction (≤ 100 items, so one atomic DynamoDB transaction; a very
 *      large match is split into player groups, each atomic on its own);
 *   2. then, per completed contract, `clearPlayerActiveContract` (a player-row
 *      write, so it cannot share step 1 with that player's postings).
 * `match.paySettlement.players` lists who was settled, and each group's write
 * is guarded on the match's `updatedAt`, so a retry or a concurrent call never
 * pays or counts twice. The ledger keys are a second line of defence.
 * Contract counts are guarded on the stored `matchesPlayed`, so two results
 * for the same player never count over each other.
 *
 * Only while the `economy` feature flag is on. A revert reverses whatever was
 * settled, whatever the flag says now.
 *
 * Kept free of HTTP so the result service / sim (BLD-09) can call it too.
 */
import {
  ConcurrencyError,
  DuplicatePostingError,
  getRepositories,
  type Contract,
  type ContractPatch,
  type ContractStatus,
  type Match,
  type MatchPaySettlement,
  type MatchPaySettlementPlayer,
  type Player,
  type PostLedgerEntryInput,
  type UnitOfWork,
} from '../repositories';
import { createNotification } from '../notifications';
import { afterMatch } from '../policies/contracts';
import type { EconomySettings } from '../policies/economyDefaults';

export const CONTRACT_COMPLETED_MESSAGE = "Your contract has ended. You're now a free agent.";

export const matchPayKey = (matchId: string, playerId: string): string => `match#${matchId}#pay#${playerId}`;
export const matchWinBonusKey = (matchId: string, playerId: string): string => `match#${matchId}#win#${playerId}`;
export const matchPayReversalKey = (originalKey: string): string => `${originalKey}#reversal`;

/** DynamoDB allows 100 items per transaction; one is kept for the match row. */
const GROUP_ITEM_BUDGET = 99;
/** Reads are eventually consistent; a stale read fails a guard and is retried. */
const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 150;

const matchRef = (matchId: string) => ({ type: 'match', id: matchId });

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ─── Pure planning ────────────────────────────────────────────────────

export interface PlayerPayInput {
  matchId: string;
  playerId: string;
  isWinner: boolean;
  isDraw: boolean;
  /** The player's active contract, or undefined for a free agent. */
  contract?: Pick<Contract, 'contractId' | 'type' | 'status' | 'matchesPlayed' | 'matchesTotal' | 'perMatchPay' | 'winBonus'>;
  settings: Pick<EconomySettings, 'freeAgentWinBonus'>;
}

export interface PlayerPayPlan {
  playerId: string;
  postings: PostLedgerEntryInput[];
  /** Present when the match counts against an active contract. */
  contractCount?: {
    contractId: string;
    expectedMatchesPlayed: number;
    matchesPlayed: number;
    completed: boolean;
  };
}

/** What one participant is owed for one match. Zero amounts post nothing. */
export function planPlayerPay(input: PlayerPayInput): PlayerPayPlan {
  const { matchId, playerId, isWinner, isDraw, contract, settings } = input;
  const postings: PostLedgerEntryInput[] = [];
  const ref = matchRef(matchId);

  if (contract && contract.perMatchPay > 0) {
    postings.push({
      playerId,
      kind: 'perMatchPay',
      amount: contract.perMatchPay,
      idempotencyKey: matchPayKey(matchId, playerId),
      ref,
    });
  }

  const winBonus = isWinner && !isDraw
    ? (contract ? contract.winBonus : settings.freeAgentWinBonus)
    : 0;
  if (winBonus > 0) {
    postings.push({
      playerId,
      kind: 'winBonus',
      amount: winBonus,
      idempotencyKey: matchWinBonusKey(matchId, playerId),
      ref,
    });
  }

  if (!contract) return { playerId, postings };
  const counted = afterMatch(contract);
  return {
    playerId,
    postings,
    contractCount: {
      contractId: contract.contractId,
      expectedMatchesPlayed: contract.matchesPlayed ?? 0,
      matchesPlayed: counted.matchesPlayed,
      completed: counted.completed,
    },
  };
}

/** Transaction items a plan stages: 2 per posting, 1 balance, 1 contract. */
function itemCount(plan: { postings: PostLedgerEntryInput[]; contractUpdate: boolean }): number {
  const ledgerItems = plan.postings.length > 0 ? plan.postings.length * 2 + 1 : 0;
  return ledgerItems + (plan.contractUpdate ? 1 : 0);
}

/** The leading plans that fit one transaction (always at least one). */
function takeGroup<T extends { postings: PostLedgerEntryInput[]; contractUpdate: boolean }>(plans: T[]): T[] {
  const group: T[] = [];
  let items = 0;
  for (const plan of plans) {
    const size = itemCount(plan);
    if (group.length > 0 && items + size > GROUP_ITEM_BUDGET) break;
    group.push(plan);
    items += size;
  }
  return group;
}

/** Participants the match pays: everyone on the card or in the result, minus active no-shows. */
export function payableParticipants(match: Pick<Match, 'participants' | 'winners' | 'losers'>): string[] {
  const everyone = new Set([...(match.participants ?? []), ...(match.winners ?? []), ...(match.losers ?? [])]);
  const noShows = activeNoShowIds(match);
  return [...everyone].filter((playerId) => !noShows.has(playerId));
}

/**
 * Players with an active no-show mark (ECO-07 `match.noShows`, undone marks
 * carry `undoneAt`). Read structurally so this works with or without that field.
 */
function activeNoShowIds(match: object): Set<string> {
  const marks: unknown = (match as { noShows?: unknown }).noShows;
  const ids = new Set<string>();
  if (!Array.isArray(marks)) return ids;
  for (const mark of marks as unknown[]) {
    if (typeof mark !== 'object' || mark === null) continue;
    const { playerId, undoneAt } = mark as { playerId?: unknown; undoneAt?: unknown };
    if (typeof playerId === 'string' && !undoneAt) ids.add(playerId);
  }
  return ids;
}

// ─── Settling a result ────────────────────────────────────────────────

export type MatchPayStatus = 'settled' | 'economyOff' | 'notFound' | 'notCompleted';

export interface MatchPayOutcome {
  status: MatchPayStatus;
  /** Players settled by this call (already-settled players are left out). */
  settledPlayerIds: string[];
  /** Contracts this call completed. */
  completedContractIds: string[];
}

interface LoadedPlan extends PlayerPayPlan {
  contractUpdate: boolean;
  player: Player | null;
  /** `activeContractId` points at a contract that is no longer active. */
  staleContractId?: string;
}

async function loadPlayerPlan(
  match: Match,
  playerId: string,
  settings: EconomySettings,
): Promise<LoadedPlan> {
  const { roster: { players }, contracts } = getRepositories();
  const player = await players.findById(playerId);
  if (!player) return { playerId, postings: [], contractUpdate: false, player: null };

  let contract: Contract | undefined;
  let staleContractId: string | undefined;
  if (player.activeContractId) {
    const found = await contracts.findById(player.activeContractId);
    if (found && found.status === 'active' && found.playerId === playerId) contract = found;
    else staleContractId = player.activeContractId;
  }

  const plan = planPlayerPay({
    matchId: match.matchId,
    playerId,
    isWinner: (match.winners ?? []).includes(playerId),
    isDraw: match.isDraw === true,
    contract,
    settings,
  });
  return { ...plan, contractUpdate: plan.contractCount !== undefined, player, staleContractId };
}

function stageSettlement(tx: UnitOfWork, group: LoadedPlan[], nowIso: string): void {
  for (const plan of group) {
    for (const posting of plan.postings) tx.postLedgerEntry(posting);
    const count = plan.contractCount;
    if (!count) continue;
    const patch: ContractPatch = { matchesPlayed: count.matchesPlayed };
    if (count.completed) {
      patch.status = 'completed';
      patch.endedAt = nowIso;
      patch.endReason = 'matchesCompleted';
    }
    tx.updateContract(count.contractId, patch, 'active', count.expectedMatchesPlayed);
  }
}

/**
 * Pay every participant of a completed match and count it against their
 * contracts. Safe to call again: players already in `match.paySettlement`
 * are skipped. Throws only when the store keeps refusing the write.
 */
export async function settleMatchPay(matchId: string): Promise<MatchPayOutcome> {
  const repos = getRepositories();
  const outcome: MatchPayOutcome = { status: 'settled', settledPlayerIds: [], completedContractIds: [] };

  const features = await repos.user.siteConfig.getFeatures();
  if (!features.economy) return { ...outcome, status: 'economyOff' };
  const settings = await repos.user.siteConfig.getEconomySettings();

  const staleContracts = new Map<string, string>();
  let failures = 0;
  for (;;) {
    const match = await repos.competition.matches.findByIdWithDate(matchId);
    if (!match) return { ...outcome, status: 'notFound' };
    if (match.status !== 'completed') {
      // The result may have committed moments ago and this read be stale.
      if (++failures >= MAX_ATTEMPTS) return { ...outcome, status: 'notCompleted' };
      await wait(RETRY_DELAY_MS * failures);
      continue;
    }

    const settled = match.paySettlement?.players ?? {};
    const pending = payableParticipants(match).filter((playerId) => !settled[playerId]);
    if (pending.length === 0) break;

    const plans = await Promise.all(pending.map((playerId) => loadPlayerPlan(match, playerId, settings)));
    const group = takeGroup(plans);
    const nowIso = new Date().toISOString();
    const nextSettlement: MatchPaySettlement = {
      settledAt: match.paySettlement?.settledAt ?? nowIso,
      players: { ...settled },
    };
    for (const plan of group) {
      const record: MatchPaySettlementPlayer = {};
      if (plan.contractCount) record.contractId = plan.contractCount.contractId;
      if (plan.contractCount?.completed) record.completedContract = true;
      nextSettlement.players[plan.playerId] = record;
    }

    try {
      await repos.runInTransaction(async (tx) => {
        stageSettlement(tx, group, nowIso);
        tx.updateMatch(matchId, match.date, { paySettlement: nextSettlement }, {
          kind: 'unchangedSince',
          updatedAt: match.updatedAt,
        });
      });
    } catch (err) {
      if (err instanceof ConcurrencyError && ++failures < MAX_ATTEMPTS) {
        await wait(RETRY_DELAY_MS * failures);
        continue;
      }
      if (err instanceof DuplicatePostingError) {
        // Ledger says paid but the match does not list the player: never pay twice.
        console.error(`Match pay for ${matchId} found an existing posting ${err.idempotencyKey}; stopping`);
        return outcome;
      }
      throw err;
    }

    for (const plan of group) {
      outcome.settledPlayerIds.push(plan.playerId);
      if (plan.staleContractId) staleContracts.set(plan.playerId, plan.staleContractId);
      if (plan.contractCount?.completed && plan.player) {
        outcome.completedContractIds.push(plan.contractCount.contractId);
        await finishCompletedContract(plan.player, plan.contractCount.contractId);
      }
    }
  }

  // A completed contract whose clear did not land earlier: free the player now.
  for (const [playerId, contractId] of staleContracts) {
    await clearActiveContract(playerId, contractId);
  }
  return outcome;
}

async function clearActiveContract(playerId: string, contractId: string): Promise<void> {
  try {
    await getRepositories().runInTransaction(async (tx) => {
      tx.clearPlayerActiveContract(playerId, contractId);
    });
  } catch (err) {
    // Already cleared (or replaced) by someone else: nothing left to do.
    if (!(err instanceof ConcurrencyError)) throw err;
  }
}

async function finishCompletedContract(player: Player, contractId: string): Promise<void> {
  await clearActiveContract(player.playerId, contractId);
  if (!player.userId) return;
  await createNotification({
    userId: player.userId,
    type: 'contract_completed',
    message: CONTRACT_COMPLETED_MESSAGE,
    sourceId: contractId,
    sourceType: 'contract',
  });
}

// ─── Reverting a result ───────────────────────────────────────────────

interface ReversalPlan {
  playerId: string;
  postings: PostLedgerEntryInput[];
  contractUpdate: boolean;
  contractStep?: {
    contractId: string;
    patch: ContractPatch;
    expectedStatus: ContractStatus;
    expectedMatchesPlayed: number;
    /** The match had completed this contract; it is active again after the revert. */
    reopen: boolean;
  };
}

export interface MatchPayReversalOutcome {
  reversedPlayerIds: string[];
  reopenedContractIds: string[];
}

async function loadReversalPlan(
  matchId: string,
  playerId: string,
  record: MatchPaySettlementPlayer,
): Promise<ReversalPlan> {
  const { roster: { players }, contracts, ledger } = getRepositories();
  const player = await players.findById(playerId);
  const plan: ReversalPlan = { playerId, postings: [], contractUpdate: false };
  // A deleted player has no balance to correct.
  if (!player) return plan;

  for (const key of [matchPayKey(matchId, playerId), matchWinBonusKey(matchId, playerId)]) {
    const entry = await ledger.getByIdempotencyKey(key);
    if (!entry) continue;
    plan.postings.push({
      playerId,
      kind: 'reversal',
      amount: -entry.amount,
      idempotencyKey: matchPayReversalKey(key),
      ref: matchRef(matchId),
      note: `Reverses ${entry.kind} for a reverted match result`,
    });
  }

  if (!record.contractId) return plan;
  const contract = await contracts.findById(record.contractId);
  if (!contract || (contract.matchesPlayed ?? 0) <= 0) return plan;
  const matchesPlayed = contract.matchesPlayed - 1;

  if (contract.status === 'active') {
    plan.contractStep = {
      contractId: contract.contractId,
      patch: { matchesPlayed },
      expectedStatus: 'active',
      expectedMatchesPlayed: contract.matchesPlayed,
      reopen: false,
    };
  } else if (
    contract.status === 'completed'
    && record.completedContract
    && contract.endReason === 'matchesCompleted'
  ) {
    // canTransition refuses completed → active on purpose; only undoing the
    // match that completed it may reopen a contract, and only while the
    // player has not signed another one since.
    const reopen = !player.activeContractId;
    plan.contractStep = {
      contractId: contract.contractId,
      patch: reopen ? { matchesPlayed, status: 'active', endedAt: null, endReason: null } : { matchesPlayed },
      expectedStatus: 'completed',
      expectedMatchesPlayed: contract.matchesPlayed,
      reopen,
    };
  }
  plan.contractUpdate = plan.contractStep !== undefined;
  return plan;
}

/**
 * Undo a match's pay before its result is reverted: a `reversal` entry for
 * every pay and bonus posting, and the contract count rolled back (reopening a
 * contract this match completed). Safe to call again: reversed players are
 * stamped on `match.paySettlement`. Does nothing for a match never settled.
 */
export async function reverseMatchPay(matchId: string): Promise<MatchPayReversalOutcome> {
  const repos = getRepositories();
  const outcome: MatchPayReversalOutcome = { reversedPlayerIds: [], reopenedContractIds: [] };

  let failures = 0;
  for (;;) {
    const match = await repos.competition.matches.findByIdWithDate(matchId);
    const settlement = match?.paySettlement;
    if (!match || !settlement) return outcome;

    const pending = Object.entries(settlement.players).filter(([, record]) => !record.reversedAt);
    if (pending.length === 0) return outcome;

    const plans = await Promise.all(
      pending.map(([playerId, record]) => loadReversalPlan(matchId, playerId, record)),
    );
    const group = takeGroup(plans);
    const nowIso = new Date().toISOString();
    const nextSettlement: MatchPaySettlement = { ...settlement, players: { ...settlement.players } };
    for (const plan of group) {
      nextSettlement.players[plan.playerId] = { ...settlement.players[plan.playerId], reversedAt: nowIso };
    }

    try {
      await repos.runInTransaction(async (tx) => {
        for (const plan of group) {
          for (const posting of plan.postings) tx.postLedgerEntry(posting);
          const step = plan.contractStep;
          if (step) tx.updateContract(step.contractId, step.patch, step.expectedStatus, step.expectedMatchesPlayed);
        }
        tx.updateMatch(matchId, match.date, { paySettlement: nextSettlement }, {
          kind: 'unchangedSince',
          updatedAt: match.updatedAt,
        });
      });
    } catch (err) {
      if (err instanceof ConcurrencyError && ++failures < MAX_ATTEMPTS) {
        await wait(RETRY_DELAY_MS * failures);
        continue;
      }
      throw err;
    }

    for (const plan of group) {
      outcome.reversedPlayerIds.push(plan.playerId);
      const step = plan.contractStep;
      if (step?.reopen && await reattachContract(plan.playerId, step.contractId, nowIso)) {
        outcome.reopenedContractIds.push(step.contractId);
      }
    }
  }
}

/**
 * Point the player back at a reopened contract. If they signed another one in
 * the meantime, the reopened contract goes back to completed instead.
 */
async function reattachContract(playerId: string, contractId: string, nowIso: string): Promise<boolean> {
  const repos = getRepositories();
  try {
    await repos.runInTransaction(async (tx) => {
      tx.setPlayerActiveContract(playerId, contractId);
    });
    return true;
  } catch (err) {
    if (!(err instanceof ConcurrencyError)) throw err;
    console.warn(`Could not reattach contract ${contractId} to player ${playerId}; leaving it completed`);
    try {
      await repos.contracts.update(contractId, {
        status: 'completed',
        endedAt: nowIso,
        endReason: 'matchesCompleted',
      }, 'active');
    } catch (restoreErr) {
      if (!(restoreErr instanceof ConcurrencyError)) throw restoreErr;
    }
    return false;
  }
}
