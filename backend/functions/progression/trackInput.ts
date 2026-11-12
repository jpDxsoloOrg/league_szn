import { v4 as uuidv4 } from 'uuid';
import { ProgressionPolicyError, validateGoal } from '../../lib/policies/progression';
import type {
  ProgressionGoal,
  ProgressionGoalDirection,
  ProgressionGoalParams,
  ProgressionKind,
  ProgressionMetric,
  ProgressionTrack,
  ProgressionWindowMode,
} from '../../lib/repositories/types';

const KINDS: Record<ProgressionKind, true> = { callup: true, promotion: true, relegation: true };

const METRICS: Record<ProgressionMetric, true> = {
  matchesCompeted: true,
  wins: true,
  winPct: true,
  avgStarRating: true,
  promosCut: true,
  promosWithReactions: true,
  totalPromoReactions: true,
  matchOfTheNight: true,
  challengesIssued: true,
  currentWinStreak: true,
};

const WINDOW_MODES: Record<ProgressionWindowMode, true> = {
  allTime: true,
  season: true,
  sinceJoinedDivision: true,
};

const DIRECTIONS: Record<ProgressionGoalDirection, true> = { atLeast: true, atMost: true };

export const MAX_TRACK_NAME_LENGTH = 100;
export const MAX_GOALS_PER_TRACK = 20;
const MAX_ID_LENGTH = 64;
const DEFAULT_WINDOW_MODE: ProgressionWindowMode = 'sinceJoinedDivision';

/** The editable part of a track; ids and timestamps belong to the handler. */
export type TrackFields = Pick<
  ProgressionTrack,
  'kind' | 'name' | 'fromDivisionId' | 'toDivisionId' | 'goals' | 'windowMode' | 'isActive'
>;

export type ParseResult<T> = { value: T; error?: never } | { value?: never; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKey<T extends string>(table: Record<T, true>, value: unknown): value is T {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(table, value);
}

function parsePositiveInteger(value: unknown, label: string): ParseResult<number | undefined> {
  if (value === undefined) return { value: undefined };
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return { error: `${label} must be a positive integer` };
  }
  return { value };
}

function parseParams(value: unknown, label: string): ParseResult<ProgressionGoalParams | undefined> {
  if (value === undefined || value === null) return { value: undefined };
  if (!isRecord(value)) return { error: `${label}.params must be an object` };
  const minRatedMatches = parsePositiveInteger(value.minRatedMatches, `${label}.params.minRatedMatches`);
  if (minRatedMatches.error) return { error: minRatedMatches.error };
  const minReactions = parsePositiveInteger(value.minReactions, `${label}.params.minReactions`);
  if (minReactions.error) return { error: minReactions.error };
  const params: ProgressionGoalParams = {};
  if (minRatedMatches.value !== undefined) params.minRatedMatches = minRatedMatches.value;
  if (minReactions.value !== undefined) params.minReactions = minReactions.value;
  return { value: Object.keys(params).length > 0 ? params : undefined };
}

function parseGoal(value: unknown, index: number): ParseResult<ProgressionGoal> {
  const label = `goals[${index}]`;
  if (!isRecord(value)) return { error: `${label} must be an object` };

  if (!isKey(METRICS, value.metric)) {
    return { error: `${label}.metric must be one of: ${Object.keys(METRICS).join(', ')}` };
  }
  if (typeof value.threshold !== 'number') return { error: `${label}.threshold must be a number` };
  const weight = value.weight === undefined ? 1 : value.weight;
  if (typeof weight !== 'number') return { error: `${label}.weight must be a number` };
  if (value.direction !== undefined && !isKey(DIRECTIONS, value.direction)) {
    return { error: `${label}.direction must be atLeast or atMost` };
  }
  let goalId: string = uuidv4();
  if (value.goalId !== undefined) {
    if (typeof value.goalId !== 'string' || value.goalId.trim() === '' || value.goalId.length > MAX_ID_LENGTH) {
      return { error: `${label}.goalId must be a non-empty string of at most ${MAX_ID_LENGTH} characters` };
    }
    goalId = value.goalId.trim();
  }
  if (value.labelKey !== undefined && (typeof value.labelKey !== 'string' || value.labelKey.trim() === '')) {
    return { error: `${label}.labelKey must be a non-empty string` };
  }
  const params = parseParams(value.params, label);
  if (params.error) return { error: params.error };

  const goal: ProgressionGoal = { goalId, metric: value.metric, threshold: value.threshold, weight };
  if (value.direction !== undefined) goal.direction = value.direction;
  if (params.value) goal.params = params.value;
  if (typeof value.labelKey === 'string') goal.labelKey = value.labelKey.trim();

  try {
    validateGoal(goal);
  } catch (err) {
    if (err instanceof ProgressionPolicyError) return { error: `${label}: ${err.message}` };
    throw err;
  }
  return { value: goal };
}

function parseGoals(value: unknown): ParseResult<ProgressionGoal[]> {
  if (!Array.isArray(value) || value.length === 0) return { error: 'goals must be a non-empty array' };
  if (value.length > MAX_GOALS_PER_TRACK) return { error: `A track can have at most ${MAX_GOALS_PER_TRACK} goals` };
  const goals: ProgressionGoal[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    const parsed = parseGoal(value[index], index);
    if (parsed.error !== undefined) return { error: parsed.error };
    if (seen.has(parsed.value.goalId)) return { error: `Duplicate goalId: ${parsed.value.goalId}` };
    seen.add(parsed.value.goalId);
    goals.push(parsed.value);
  }
  return { value: goals };
}

function parseId(value: unknown, field: string): ParseResult<string> {
  if (typeof value !== 'string' || value.trim() === '' || value.length > MAX_ID_LENGTH * 4) {
    return { error: `${field} must be a non-empty string` };
  }
  return { value: value.trim() };
}

/**
 * Parse a create (no `existing`) or update body into the full set of track
 * fields. On update, omitted fields keep their stored value, `goals`
 * replaces the whole list, and `toDivisionId: null` clears the destination.
 * Division existence and the one-active-track rule are checked by the caller.
 */
export function parseTrackInput(body: unknown, existing?: ProgressionTrack): ParseResult<TrackFields> {
  if (!isRecord(body)) return { error: 'Request body must be an object' };

  const kindValue = body.kind ?? existing?.kind;
  if (!isKey(KINDS, kindValue)) return { error: `kind must be one of: ${Object.keys(KINDS).join(', ')}` };

  const nameValue = body.name ?? existing?.name;
  if (typeof nameValue !== 'string' || nameValue.trim() === '') return { error: 'name is required' };
  if (nameValue.trim().length > MAX_TRACK_NAME_LENGTH) {
    return { error: `name must be at most ${MAX_TRACK_NAME_LENGTH} characters` };
  }

  const from = parseId(body.fromDivisionId ?? existing?.fromDivisionId, 'fromDivisionId');
  if (from.error !== undefined) return { error: from.error };

  let toDivisionId: string | undefined = existing?.toDivisionId;
  if (body.toDivisionId === null) {
    toDivisionId = undefined;
  } else if (body.toDivisionId !== undefined) {
    const to = parseId(body.toDivisionId, 'toDivisionId');
    if (to.error !== undefined) return { error: to.error };
    toDivisionId = to.value;
  }
  if (toDivisionId !== undefined && toDivisionId === from.value) {
    return { error: 'toDivisionId must differ from fromDivisionId' };
  }

  const windowValue = body.windowMode ?? existing?.windowMode ?? DEFAULT_WINDOW_MODE;
  if (!isKey(WINDOW_MODES, windowValue)) {
    return { error: `windowMode must be one of: ${Object.keys(WINDOW_MODES).join(', ')}` };
  }

  const activeValue = body.isActive ?? existing?.isActive ?? true;
  if (typeof activeValue !== 'boolean') return { error: 'isActive must be a boolean' };

  let goals: ProgressionGoal[];
  if (body.goals === undefined && existing) {
    goals = existing.goals;
  } else {
    const parsed = parseGoals(body.goals);
    if (parsed.error !== undefined) return { error: parsed.error };
    goals = parsed.value;
  }

  const fields: TrackFields = {
    kind: kindValue,
    name: nameValue.trim(),
    fromDivisionId: from.value,
    goals,
    windowMode: windowValue,
    isActive: activeValue,
  };
  if (toDivisionId !== undefined) fields.toDivisionId = toDivisionId;
  return { value: fields };
}
