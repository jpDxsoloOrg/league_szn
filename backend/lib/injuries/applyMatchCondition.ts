/**
 * Stamina drain and injury rolls for a recorded result (INJ-04).
 *
 * Every completed match, manual or simulated, goes through
 * `recordMatchResult` (BLD-09), which:
 *   1. loads a plan here before its core transaction (`loadMatchConditionPlan`,
 *      null while the `injuries` flag is off);
 *   2. stages the plan inside that transaction (`stageMatchCondition`): the
 *      condition write merges with the player's record increment, and new
 *      injuries go to the Injuries table, so the records, the drain and the
 *      injury commit or fail together. The match's notCompleted guard stops a
 *      re-record from draining or rolling twice;
 *   3. stores `conditionReport` and `tunablesVersion` on the match row;
 *   4. after commit, tells each newly injured player (`notifyInjuredPlayers`).
 *
 * Deleting a completed match reverts it (`loadMatchConditionRevert` /
 * `stageMatchConditionRevert`, called from deleteMatch's rollback
 * transaction): the stored drain is given back and an injury from that match
 * ends with `endedReason: 'reverted'`, unless a GM already edited it. A revert
 * runs whatever the flag says now. Rolls are seeded with
 * `rollSeed(matchId, playerId, tunables.version)`, so recording the same match
 * again under the same tunables gives the same outcome.
 *
 * Match pay (ECO-05) settles in its own transaction and is not touched here.
 */
import { v4 as uuidv4 } from 'uuid';
import { getRepositories } from '../repositories';
import type { Repositories } from '../repositories/registry';
import type { UnitOfWork } from '../repositories/unitOfWork';
import type {
  Division,
  Match,
  MatchConditionEntry,
  MatchStatus,
  MatchType,
  Player,
  Stipulation,
} from '../repositories/types';
import {
  toCurrentInjury,
  hasGmEdits,
  injuryRowId,
  type Injury,
  type InjuryPatch,
  type PlayerConditionGuard,
  type PlayerConditionPatch,
} from '../repositories/injuries';
import { isSimCategory, type SimCategory } from '../policies/buildRules';
import type { InjuryTunables } from '../policies/fatigueDefaults';
import {
  applyDrain,
  formatKeyForMatch,
  matchDrain,
  returnDate,
  rollInjury,
  rollSeed,
  staminaOf,
} from '../policies/fatigue';
import { resolveSimCategory } from '../sim/category';
import { toPlayerBuildView } from '../builds/playerBuild';
import { activeNoShows } from '../fines';
import { activeInjury } from './index';
import { createNotification } from '../notifications';

/**
 * Injury chance reduction (0..1) for one participant. The result service
 * passes the shop's injury shield here (ECO-10, `injuryShieldReduction`).
 */
export type ChanceReductionFor = (player: Player) => number;

export const noChanceReduction: ChanceReductionFor = () => 0;

/** One player's staged condition change. */
export interface PlayerConditionWrite {
  playerId: string;
  patch: PlayerConditionPatch;
  guard: PlayerConditionGuard;
}

/** An injury row to end in the same unit of work. */
export interface InjuryEnd {
  playerId: string;
  startedAt: string;
  patch: InjuryPatch;
}

export interface MatchConditionPlan {
  tunablesVersion: number;
  category: SimCategory;
  report: MatchConditionEntry[];
  conditionWrites: PlayerConditionWrite[];
  newInjuries: Injury[];
  /** Open rows whose return date has passed, replaced by a new injury. */
  endedInjuries: InjuryEnd[];
  /** Players to notify after commit, with the injury they got. */
  injured: Array<{ player: Player; injury: Injury }>;
  /** ECO-10: players whose roll a chance reduction (injury shield) cut; one shield match is used after commit. */
  shieldedPlayerIds: string[];
  timezone: string;
}

type ConditionMatch = Pick<Match, 'matchId' | 'participants' | 'teams' | 'matchFormat' | 'matchType' | 'noShows'>;

/** Only completed results drain: a cancelled match (or one still open) never does. */
const DRAINING_STATUSES: readonly MatchStatus[] = ['scheduled', 'completed'];

const storedStamina = (player: Pick<Player, 'stamina'>): number | null =>
  typeof player.stamina === 'number' ? player.stamina : null;

const storedInjuryId = (player: Pick<Player, 'currentInjury'>): string | null =>
  player.currentInjury?.injuryId ?? null;

export interface PlanMatchConditionInput {
  match: ConditionMatch;
  /** The participants who drain: existing, not deleted, not marked no-show. */
  players: readonly Player[];
  category: SimCategory;
  tunables: InjuryTunables;
  divisionsById: ReadonlyMap<string, Pick<Division, 'tier' | 'isDevelopmental'>>;
  /** When the result is recorded; injuries start here. */
  now: string;
  /**
   * `injuryRowId`s of finished-but-uncleared injuries (returnsAt passed, the
   * weekly job has not run) whose rows are still open. A new injury ends them.
   */
  openStaleInjuryRows?: ReadonlySet<string>;
  chanceReductionFor?: ChanceReductionFor;
  newInjuryId?: () => string;
}

/** Pure: the drain, roll and writes for every draining participant. */
export function planMatchCondition(input: PlanMatchConditionInput): MatchConditionPlan {
  const { match, tunables, category, now } = input;
  const chanceReductionFor = input.chanceReductionFor ?? noChanceReduction;
  const newInjuryId = input.newInjuryId ?? uuidv4;
  const format = formatKeyForMatch(match, tunables);

  const plan: MatchConditionPlan = {
    tunablesVersion: tunables.version,
    category,
    report: [],
    conditionWrites: [],
    newInjuries: [],
    endedInjuries: [],
    injured: [],
    shieldedPlayerIds: [],
    timezone: tunables.timezone,
  };

  for (const player of input.players) {
    const division = player.divisionId ? input.divisionsById.get(player.divisionId) : undefined;
    const endurance = toPlayerBuildView(player, division).effective.stats.endurance;
    const staminaBefore = staminaOf(player.stamina, tunables);
    const drain = matchDrain({ category, format, endurance }, tunables);
    const staminaAfter = applyDrain(staminaBefore, drain, tunables);
    const chanceReduction = chanceReductionFor(player);
    const roll = rollInjury(
      staminaAfter,
      category,
      rollSeed(match.matchId, player.playerId, tunables.version),
      tunables,
      { chanceReduction },
    );

    const entry: MatchConditionEntry = {
      playerId: player.playerId,
      staminaBefore,
      staminaAfter,
      drain,
      chance: roll.chance,
      roll: roll.roll,
    };
    if (chanceReduction > 0) {
      entry.shielded = true;
      plan.shieldedPlayerIds.push(player.playerId);
    }
    const patch: PlayerConditionPatch = { stamina: staminaAfter };
    const guard: PlayerConditionGuard = {
      stamina: storedStamina(player),
      currentInjuryId: storedInjuryId(player),
    };

    if (roll.injured && roll.severity && roll.weeks !== undefined) {
      if (activeInjury(player, now)) {
        // Already out (e.g. a GM storyline injury): drain, but no second injury.
        entry.alreadyInjured = true;
      } else {
        const injury: Injury = {
          playerId: player.playerId,
          startedAt: now,
          injuryId: newInjuryId(),
          source: 'match',
          severity: roll.severity,
          weeks: roll.weeks,
          returnsAt: returnDate(now, roll.weeks, tunables.timezone).toISOString(),
          matchId: match.matchId,
          changes: [],
        };
        entry.injuryId = injury.injuryId;
        entry.severity = injury.severity;
        entry.weeks = injury.weeks;
        entry.returnsAt = injury.returnsAt;
        patch.currentInjury = toCurrentInjury(injury);
        plan.newInjuries.push(injury);
        plan.injured.push({ player, injury });

        // A finished injury the weekly job has not cleared yet ends now, so
        // the player never has two open rows.
        const stale = player.currentInjury;
        if (stale && input.openStaleInjuryRows?.has(injuryRowId(player.playerId, stale.startedAt))) {
          plan.endedInjuries.push({
            playerId: player.playerId,
            startedAt: stale.startedAt,
            patch: { endedAt: stale.returnsAt, endedReason: 'recovered' },
          });
        }
      }
    }

    plan.report.push(entry);
    plan.conditionWrites.push({ playerId: player.playerId, patch, guard });
  }

  return plan;
}

export interface LoadMatchConditionOptions {
  /** When the result is recorded. */
  now: string;
  /** The sim's category, when a sim settled the match (keeps drain in step with the sim). */
  category?: unknown;
  chanceReductionFor?: ChanceReductionFor;
}

/**
 * Loads everything the plan needs. Null while the `injuries` flag is off, or
 * when the match is not one that drains.
 */
export async function loadMatchConditionPlan(
  match: ConditionMatch & Pick<Match, 'status' | 'stipulationId'>,
  options: LoadMatchConditionOptions,
): Promise<MatchConditionPlan | null> {
  if (!DRAINING_STATUSES.includes(match.status)) return null;

  const repos = getRepositories();
  const features = await repos.user.siteConfig.getFeatures();
  if (!features.injuries) return null;

  const noShowIds = new Set(activeNoShows(match).map((mark) => mark.playerId));
  const participantIds = [...new Set(match.participants ?? [])].filter((playerId) => !noShowIds.has(playerId));

  const [tunables, divisions, category, loadedPlayers] = await Promise.all([
    repos.user.siteConfig.getInjuryTunables(),
    repos.leagueOps.divisions.list(),
    resolveCategory(repos, match, options.category),
    Promise.all(participantIds.map((playerId) => repos.roster.players.findById(playerId))),
  ]);

  const players = loadedPlayers.filter((player): player is Player => player !== null && !player.deletedAt);
  const now = options.now;
  const staleRows = await Promise.all(
    players
      .filter((player) => player.currentInjury && !activeInjury(player, now))
      .map((player) => repos.injuries.get(player.playerId, player.currentInjury!.startedAt)),
  );
  const openStaleInjuryRows = new Set(
    staleRows
      .filter((row): row is Injury => row !== null && row.endedAt === undefined)
      .map((row) => injuryRowId(row.playerId, row.startedAt)),
  );

  return planMatchCondition({
    match,
    players,
    category,
    tunables,
    divisionsById: new Map(divisions.map((division) => [division.divisionId, division])),
    now,
    openStaleInjuryRows,
    chanceReductionFor: options.chanceReductionFor,
  });
}

async function resolveCategory(
  repos: Repositories,
  match: Pick<Match, 'stipulationId' | 'matchFormat' | 'matchType'>,
  simCategory: unknown,
): Promise<SimCategory> {
  if (isSimCategory(simCategory)) return simCategory;
  const [stipulations, matchTypes]: [Stipulation[], MatchType[]] = await Promise.all([
    repos.competition.stipulations.list(),
    repos.competition.matchTypes.list(),
  ]);
  return resolveSimCategory(match, stipulations, matchTypes);
}

/** Stages the plan's writes in the result's unit of work. */
export function stageMatchCondition(tx: UnitOfWork, plan: MatchConditionPlan): void {
  for (const write of plan.conditionWrites) {
    tx.updatePlayerCondition(write.playerId, write.patch, write.guard);
  }
  for (const ended of plan.endedInjuries) {
    tx.updateInjury(ended.playerId, ended.startedAt, ended.patch);
  }
  for (const injury of plan.newInjuries) {
    tx.putInjury(injury);
  }
}

/** The match fields the plan stores with the result. */
export function matchConditionFields(plan: MatchConditionPlan): Pick<Match, 'conditionReport' | 'tunablesVersion'> {
  return { conditionReport: plan.report, tunablesVersion: plan.tunablesVersion };
}

function formatLeagueDay(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}

/** The message an injured player gets. Neutral: no severity, no blame. */
export function injuryNotificationMessage(matchDate: string, returnsAt: string, timezone: string): string {
  return `You were injured in your match on ${formatLeagueDay(matchDate, timezone)}. `
    + `You're out until ${formatLeagueDay(returnsAt, timezone)}.`;
}

/** After commit: tells each newly injured player. Never throws. */
export async function notifyInjuredPlayers(plan: MatchConditionPlan, match: Pick<Match, 'matchId' | 'date'>): Promise<void> {
  for (const { player, injury } of plan.injured) {
    if (!player.userId) continue;
    try {
      await createNotification({
        userId: player.userId,
        type: 'injury_sustained',
        message: injuryNotificationMessage(match.date, injury.returnsAt, plan.timezone),
        sourceId: match.matchId,
        sourceType: 'match',
      });
    } catch (err) {
      console.warn(`Injury notification failed for ${player.playerId}:`, err);
    }
  }
}

/** Strips the staff-only condition fields from a match row for public reads. */
export function withoutConditionReport<Row extends Record<string, unknown>>(row: Row): Row {
  if (row.conditionReport === undefined && row.tunablesVersion === undefined) return row;
  const { conditionReport: _report, tunablesVersion: _version, ...rest } = row;
  return rest as Row;
}

// ─── Revert ─────────────────────────────────────────────────────────

export interface MatchConditionRevertPlan {
  conditionWrites: PlayerConditionWrite[];
  endedInjuries: InjuryEnd[];
}

export interface PlanMatchConditionRevertInput {
  report: readonly MatchConditionEntry[];
  /** Current rows of the report's players (missing or deleted players are skipped). */
  playersById: ReadonlyMap<string, Player>;
  /** The injuries the report created, by injuryId, as stored now. */
  injuriesById: ReadonlyMap<string, Injury>;
  maxStamina: number;
  now: string;
}

/**
 * Pure: give back each stored drain (capped at maxStamina) and end each
 * injury from the match that is still open and no GM has edited.
 */
export function planMatchConditionRevert(input: PlanMatchConditionRevertInput): MatchConditionRevertPlan {
  const plan: MatchConditionRevertPlan = { conditionWrites: [], endedInjuries: [] };

  for (const entry of input.report) {
    const player = input.playersById.get(entry.playerId);
    if (!player || player.deletedAt) continue;

    const patch: PlayerConditionPatch = {};
    if (entry.drain > 0) {
      const stamina = staminaOf(player.stamina, { maxStamina: input.maxStamina });
      patch.stamina = Math.min(input.maxStamina, stamina + entry.drain);
    }

    const injury = entry.injuryId ? input.injuriesById.get(entry.injuryId) : undefined;
    if (injury && injury.endedAt === undefined && !hasGmEdits(injury)) {
      plan.endedInjuries.push({
        playerId: injury.playerId,
        startedAt: injury.startedAt,
        patch: { endedAt: input.now, endedReason: 'reverted' },
      });
      if (player.currentInjury?.injuryId === injury.injuryId) patch.currentInjury = null;
    }

    if (patch.stamina === undefined && patch.currentInjury === undefined) continue;
    plan.conditionWrites.push({
      playerId: player.playerId,
      patch,
      guard: { stamina: storedStamina(player), currentInjuryId: storedInjuryId(player) },
    });
  }

  return plan;
}

/**
 * Loads what undoing a match's condition report needs. Null when the match
 * has no report (recorded with the flag off, or before INJ-04).
 */
export async function loadMatchConditionRevert(
  match: Pick<Match, 'conditionReport'>,
  now: string,
): Promise<MatchConditionRevertPlan | null> {
  const report = match.conditionReport ?? [];
  if (report.length === 0) return null;

  const repos = getRepositories();
  const tunables = await repos.user.siteConfig.getInjuryTunables();
  const players = await Promise.all(report.map((entry) => repos.roster.players.findById(entry.playerId)));
  const injuries = await Promise.all(
    report.map((entry) => (entry.injuryId ? repos.injuries.findByInjuryId(entry.playerId, entry.injuryId) : null)),
  );

  return planMatchConditionRevert({
    report,
    playersById: new Map(players.filter((player): player is Player => player !== null).map((player) => [player.playerId, player])),
    injuriesById: new Map(injuries.filter((row): row is Injury => row !== null).map((row) => [row.injuryId, row])),
    maxStamina: tunables.maxStamina,
    now,
  });
}

/** Stages the revert in the rollback's unit of work. */
export function stageMatchConditionRevert(tx: UnitOfWork, plan: MatchConditionRevertPlan): void {
  for (const write of plan.conditionWrites) {
    tx.updatePlayerCondition(write.playerId, write.patch, write.guard);
  }
  for (const ended of plan.endedInjuries) {
    tx.updateInjury(ended.playerId, ended.startedAt, ended.patch);
  }
}
