import type { Division } from '../../../types';
import type {
  CreateProgressionTrackInput,
  ProgressionGoalDirection,
  ProgressionGoalInput,
  ProgressionKind,
  ProgressionMetric,
  ProgressionTrack,
  ProgressionWindowMode,
} from '../../../types/progression';

/** Mirror the limits in backend/functions/progression/trackInput.ts. */
export const MAX_TRACK_NAME_LENGTH = 100;
export const MAX_GOALS_PER_TRACK = 20;

export const PROGRESSION_KINDS: ProgressionKind[] = ['callup', 'promotion', 'relegation'];
export const WINDOW_MODES: ProgressionWindowMode[] = ['sinceJoinedDivision', 'season', 'allTime'];
export const GOAL_DIRECTIONS: ProgressionGoalDirection[] = ['atLeast', 'atMost'];
export const PROGRESSION_METRICS: ProgressionMetric[] = [
  'matchesCompeted',
  'wins',
  'winPct',
  'avgStarRating',
  'promosCut',
  'promosWithReactions',
  'totalPromoReactions',
  'matchOfTheNight',
  'challengesIssued',
  'currentWinStreak',
];

/** The goal param a metric takes, if any. */
export function metricParam(metric: ProgressionMetric): 'minRatedMatches' | 'minReactions' | null {
  if (metric === 'avgStarRating') return 'minRatedMatches';
  if (metric === 'promosWithReactions') return 'minReactions';
  return null;
}

/** A goal as typed into the form: numbers stay strings until save. */
export interface GoalDraft {
  /** Stable React key; also the goalId for goals that already exist. */
  key: string;
  goalId?: string;
  metric: ProgressionMetric;
  threshold: string;
  weight: string;
  direction: ProgressionGoalDirection;
  /** The value of the metric's param (minRatedMatches or minReactions). */
  param: string;
  labelKey?: string;
}

export interface TrackDraft {
  name: string;
  kind: ProgressionKind;
  fromDivisionId: string;
  toDivisionId: string;
  windowMode: ProgressionWindowMode;
  isActive: boolean;
  goals: GoalDraft[];
}

export interface GoalDraftErrors {
  threshold?: string;
  weight?: string;
  param?: string;
}

/** Values are i18n keys. */
export interface TrackDraftErrors {
  name?: string;
  fromDivisionId?: string;
  toDivisionId?: string;
  goals?: string;
  goalErrors: Record<string, GoalDraftErrors>;
}

let draftKeySeed = 0;
function nextDraftKey(): string {
  draftKeySeed += 1;
  return `new-goal-${draftKeySeed}`;
}

export function emptyGoalDraft(): GoalDraft {
  return { key: nextDraftKey(), metric: 'matchesCompeted', threshold: '', weight: '1', direction: 'atLeast', param: '' };
}

export function emptyTrackDraft(): TrackDraft {
  return {
    name: '',
    kind: 'callup',
    fromDivisionId: '',
    toDivisionId: '',
    windowMode: 'sinceJoinedDivision',
    isActive: true,
    goals: [emptyGoalDraft()],
  };
}

export function trackToDraft(track: ProgressionTrack): TrackDraft {
  return {
    name: track.name,
    kind: track.kind,
    fromDivisionId: track.fromDivisionId,
    toDivisionId: track.toDivisionId ?? '',
    windowMode: track.windowMode,
    isActive: track.isActive,
    goals: track.goals.map((goal) => {
      const param = metricParam(goal.metric);
      const paramValue = param ? goal.params?.[param] : undefined;
      return {
        key: goal.goalId,
        goalId: goal.goalId,
        metric: goal.metric,
        threshold: String(goal.threshold),
        weight: String(goal.weight),
        direction: goal.direction ?? 'atLeast',
        param: paramValue === undefined ? '' : String(paramValue),
        labelKey: goal.labelKey,
      };
    }),
  };
}

function isPositiveNumber(value: string): boolean {
  if (value.trim() === '') return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function isPositiveInteger(value: string): boolean {
  return isPositiveNumber(value) && Number.isInteger(Number(value));
}

/** Client-side checks matching the API's 400s, plus the call-up target rule. */
export function validateTrackDraft(draft: TrackDraft, divisions: Division[]): TrackDraftErrors {
  const errors: TrackDraftErrors = { goalErrors: {} };
  const name = draft.name.trim();
  if (!name) errors.name = 'progression.admin.editor.errors.nameRequired';
  else if (name.length > MAX_TRACK_NAME_LENGTH) errors.name = 'progression.admin.editor.errors.nameTooLong';

  if (!draft.fromDivisionId) errors.fromDivisionId = 'progression.admin.editor.errors.fromRequired';

  if (draft.toDivisionId) {
    const target = divisions.find((division) => division.divisionId === draft.toDivisionId);
    if (draft.toDivisionId === draft.fromDivisionId) {
      errors.toDivisionId = 'progression.admin.editor.errors.toSameAsFrom';
    } else if (draft.kind === 'callup' && target?.isDevelopmental) {
      errors.toDivisionId = 'progression.admin.editor.errors.toDevelopmental';
    }
  }

  if (draft.goals.length === 0) errors.goals = 'progression.admin.editor.errors.goalsRequired';
  else if (draft.goals.length > MAX_GOALS_PER_TRACK) errors.goals = 'progression.admin.editor.errors.goalsTooMany';

  for (const goal of draft.goals) {
    const goalErrors: GoalDraftErrors = {};
    if (!isPositiveNumber(goal.threshold)) goalErrors.threshold = 'progression.admin.editor.errors.thresholdInvalid';
    if (!isPositiveNumber(goal.weight)) goalErrors.weight = 'progression.admin.editor.errors.weightInvalid';
    if (metricParam(goal.metric) && goal.param.trim() !== '' && !isPositiveInteger(goal.param)) {
      goalErrors.param = 'progression.admin.editor.errors.paramInvalid';
    }
    if (Object.keys(goalErrors).length > 0) errors.goalErrors[goal.key] = goalErrors;
  }
  return errors;
}

export function hasDraftErrors(errors: TrackDraftErrors): boolean {
  return Boolean(errors.name || errors.fromDivisionId || errors.toDivisionId || errors.goals)
    || Object.keys(errors.goalErrors).length > 0;
}

function goalDraftToInput(goal: GoalDraft): ProgressionGoalInput {
  const input: ProgressionGoalInput = {
    metric: goal.metric,
    threshold: Number(goal.threshold),
    weight: Number(goal.weight),
    direction: goal.direction,
  };
  if (goal.goalId) input.goalId = goal.goalId;
  if (goal.labelKey) input.labelKey = goal.labelKey;
  const param = metricParam(goal.metric);
  if (param && goal.param.trim() !== '') input.params = { [param]: Number(goal.param) };
  return input;
}

/** The create body. An update sends the same fields, with `toDivisionId: null` to clear it. */
export function draftToInput(draft: TrackDraft): CreateProgressionTrackInput {
  const input: CreateProgressionTrackInput = {
    kind: draft.kind,
    name: draft.name.trim(),
    fromDivisionId: draft.fromDivisionId,
    goals: draft.goals.map(goalDraftToInput),
    windowMode: draft.windowMode,
    isActive: draft.isActive,
  };
  if (draft.toDivisionId) input.toDivisionId = draft.toDivisionId;
  return input;
}
