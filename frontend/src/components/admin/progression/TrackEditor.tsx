import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import type { Division } from '../../../types';
import type {
  ProgressionGoalDirection,
  ProgressionKind,
  ProgressionMetric,
  ProgressionTrack,
  ProgressionWindowMode,
} from '../../../types/progression';
import { ApiError, progressionApi } from '../../../services/api';
import Button from '../../ui/Button';
import AdminFormModal from '../AdminFormModal';
import SearchableSelect from '../SearchableSelect';
import type { SearchableSelectOption } from '../SearchableSelect';
import {
  GOAL_DIRECTIONS,
  MAX_GOALS_PER_TRACK,
  PROGRESSION_KINDS,
  PROGRESSION_METRICS,
  WINDOW_MODES,
  draftToInput,
  emptyGoalDraft,
  emptyTrackDraft,
  hasDraftErrors,
  metricParam,
  trackToDraft,
  validateTrackDraft,
} from './trackDraft';
import type { GoalDraft, TrackDraft, TrackDraftErrors } from './trackDraft';

export interface TrackEditorProps {
  open: boolean;
  /** The track being edited, or null to create one. */
  track: ProgressionTrack | null;
  divisions: Division[];
  /** Players on the track's board, for the "recomputes N players" note. */
  candidateCount?: number;
  onClose: () => void;
  onSaved: (track: ProgressionTrack, created: boolean) => void;
}

const NO_ERRORS: TrackDraftErrors = { goalErrors: {} };

/** Create or edit a progression track: divisions, window, active flag and the goal list. */
export default function TrackEditor({ open, track, divisions, candidateCount, onClose, onSaved }: TrackEditorProps) {
  const { t } = useTranslation();
  const baseId = useId();
  const [draft, setDraft] = useState<TrackDraft>(() => (track ? trackToDraft(track) : emptyTrackDraft()));
  const [errors, setErrors] = useState<TrackDraftErrors>(NO_ERRORS);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Each open starts from the track as saved.
  useEffect(() => {
    if (!open) return;
    setDraft(track ? trackToDraft(track) : emptyTrackDraft());
    setErrors(NO_ERRORS);
    setServerError(null);
  }, [open, track]);

  const update = (patch: Partial<TrackDraft>) => setDraft((previous) => ({ ...previous, ...patch }));
  const updateGoal = (key: string, patch: Partial<GoalDraft>) => setDraft((previous) => ({
    ...previous,
    goals: previous.goals.map((goal) => (goal.key === key ? { ...goal, ...patch } : goal)),
  }));
  const removeGoal = (key: string) => setDraft((previous) => ({
    ...previous,
    goals: previous.goals.filter((goal) => goal.key !== key),
  }));
  const addGoal = () => setDraft((previous) => ({ ...previous, goals: [...previous.goals, emptyGoalDraft()] }));

  const divisionOptions: SearchableSelectOption[] = divisions.map((division) => ({
    value: division.divisionId,
    label: division.name,
  }));
  // A call-up moves a Young Boy up to the main roster, never into another developmental division.
  const toDivisionOptions: SearchableSelectOption[] = divisions.map((division) => {
    const blocked = draft.kind === 'callup' && division.isDevelopmental === true;
    return {
      value: division.divisionId,
      label: division.name,
      disabled: blocked,
      hint: blocked ? t('progression.admin.editor.developmentalHint') : undefined,
    };
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateTrackDraft(draft, divisions);
    setErrors(found);
    if (hasDraftErrors(found)) return;

    setSaving(true);
    setServerError(null);
    try {
      const input = draftToInput(draft);
      const saved = track
        ? await progressionApi.updateTrack(track.trackId, { ...input, toDivisionId: input.toDivisionId ?? null })
        : await progressionApi.createTrack(input);
      onSaved(saved, track === null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof ApiError && err.status === 409) {
        setServerError(t('progression.admin.editor.errors.conflict', { message }));
      } else if (err instanceof ApiError && err.status === 400) {
        setServerError(t('progression.admin.editor.errors.invalid', { message }));
      } else {
        setServerError(message);
      }
    } finally {
      setSaving(false);
    }
  };

  const fieldId = (name: string) => `${baseId}-${name}`;
  const fromDivisionName = divisions.find((division) => division.divisionId === draft.fromDivisionId)?.name;

  return (
    <AdminFormModal
      open={open}
      onClose={onClose}
      title={track ? t('progression.admin.editor.editTitle', { name: track.name }) : t('progression.admin.editor.createTitle')}
      size="lg"
      className="am-sheet mp-editor"
      submitLabel={track ? t('progression.admin.editor.save') : t('progression.admin.editor.create')}
      onSubmit={handleSubmit}
      busy={saving}
      error={serverError}
    >
      <div className="ac-form__row">
        <div className="ac-field">
          <label className="ac-field__label" htmlFor={fieldId('name')}>{t('progression.admin.editor.name')}</label>
          <input
            id={fieldId('name')}
            type="text"
            value={draft.name}
            maxLength={120}
            onChange={(event) => update({ name: event.target.value })}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? fieldId('name-error') : undefined}
          />
          {errors.name && <span id={fieldId('name-error')} className="mp-field-error">{t(errors.name)}</span>}
        </div>
        <div className="ac-field">
          <label className="ac-field__label" htmlFor={fieldId('kind')}>{t('progression.admin.editor.kind')}</label>
          <select
            id={fieldId('kind')}
            value={draft.kind}
            onChange={(event) => update({ kind: event.target.value as ProgressionKind })}
          >
            {PROGRESSION_KINDS.map((kind) => (
              <option key={kind} value={kind}>{t(`progression.admin.kinds.${kind}`)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="ac-form__row">
        <div className="ac-field">
          <label className="ac-field__label" htmlFor={fieldId('from')}>{t('progression.admin.editor.fromDivision')}</label>
          <SearchableSelect
            id={fieldId('from')}
            options={divisionOptions}
            value={draft.fromDivisionId}
            onChange={(value) => update({ fromDivisionId: value })}
            placeholder={t('progression.admin.editor.pickDivision')}
            errorId={errors.fromDivisionId ? fieldId('from-error') : undefined}
          />
          {errors.fromDivisionId && (
            <span id={fieldId('from-error')} className="mp-field-error">{t(errors.fromDivisionId)}</span>
          )}
        </div>
        <div className="ac-field">
          <label className="ac-field__label" htmlFor={fieldId('to')}>{t('progression.admin.editor.toDivision')}</label>
          <SearchableSelect
            id={fieldId('to')}
            options={toDivisionOptions}
            value={draft.toDivisionId}
            onChange={(value) => update({ toDivisionId: value })}
            placeholder={t('progression.admin.editor.toDivisionNone')}
            errorId={errors.toDivisionId ? fieldId('to-error') : undefined}
          />
          {errors.toDivisionId && (
            <span id={fieldId('to-error')} className="mp-field-error">{t(errors.toDivisionId)}</span>
          )}
        </div>
      </div>

      <div className="ac-form__row">
        <div className="ac-field">
          <label className="ac-field__label" htmlFor={fieldId('window')}>{t('progression.admin.editor.windowMode')}</label>
          <select
            id={fieldId('window')}
            value={draft.windowMode}
            onChange={(event) => update({ windowMode: event.target.value as ProgressionWindowMode })}
          >
            {WINDOW_MODES.map((mode) => (
              <option key={mode} value={mode}>{t(`progression.admin.windowModes.${mode}`)}</option>
            ))}
          </select>
        </div>
        <div className="ac-field mp-editor__active">
          <label className="ac-check am-toggle-row">
            <input
              type="checkbox"
              className="am-toggle"
              checked={draft.isActive}
              onChange={(event) => update({ isActive: event.target.checked })}
            />
            {t('progression.admin.editor.active')}
          </label>
        </div>
      </div>

      <fieldset className="mp-goals">
        <legend className="ac-field__label">{t('progression.admin.editor.goals')}</legend>
        {errors.goals && <span className="mp-field-error" role="alert">{t(errors.goals)}</span>}
        {draft.goals.map((goal, index) => {
          const goalErrors = errors.goalErrors[goal.key] ?? {};
          const param = metricParam(goal.metric);
          const goalId = (name: string) => fieldId(`goal-${goal.key}-${name}`);
          return (
            <div key={goal.key} className="mp-goal" data-testid="goal-row">
              <div className="mp-goal__header">
                <span className="mp-goal__title">{t('progression.admin.editor.goalNumber', { number: index + 1 })}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 aria-hidden="true" size={16} />}
                  onClick={() => removeGoal(goal.key)}
                  aria-label={t('progression.admin.editor.removeGoal', { number: index + 1 })}
                />
              </div>
              <div className="mp-goal__fields">
                <div className="ac-field">
                  <label className="ac-field__label" htmlFor={goalId('metric')}>{t('progression.admin.editor.metric')}</label>
                  <select
                    id={goalId('metric')}
                    value={goal.metric}
                    onChange={(event) => updateGoal(goal.key, { metric: event.target.value as ProgressionMetric, param: '' })}
                  >
                    {PROGRESSION_METRICS.map((metric) => (
                      <option key={metric} value={metric}>{t(`progression.metrics.${metric}`)}</option>
                    ))}
                  </select>
                </div>
                <div className="ac-field">
                  <label className="ac-field__label" htmlFor={goalId('direction')}>{t('progression.admin.editor.direction')}</label>
                  <select
                    id={goalId('direction')}
                    value={goal.direction}
                    onChange={(event) => updateGoal(goal.key, { direction: event.target.value as ProgressionGoalDirection })}
                  >
                    {GOAL_DIRECTIONS.map((direction) => (
                      <option key={direction} value={direction}>{t(`progression.admin.directions.${direction}`)}</option>
                    ))}
                  </select>
                </div>
                <div className="ac-field">
                  <label className="ac-field__label" htmlFor={goalId('threshold')}>{t('progression.admin.editor.threshold')}</label>
                  <input
                    id={goalId('threshold')}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={goal.threshold}
                    onChange={(event) => updateGoal(goal.key, { threshold: event.target.value })}
                    aria-invalid={goalErrors.threshold ? true : undefined}
                  />
                  {goalErrors.threshold && <span className="mp-field-error">{t(goalErrors.threshold)}</span>}
                </div>
                <div className="ac-field">
                  <label className="ac-field__label" htmlFor={goalId('weight')}>{t('progression.admin.editor.weight')}</label>
                  <input
                    id={goalId('weight')}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={goal.weight}
                    onChange={(event) => updateGoal(goal.key, { weight: event.target.value })}
                    aria-invalid={goalErrors.weight ? true : undefined}
                  />
                  {goalErrors.weight && <span className="mp-field-error">{t(goalErrors.weight)}</span>}
                </div>
                {param && (
                  <div className="ac-field">
                    <label className="ac-field__label" htmlFor={goalId('param')}>{t(`progression.admin.editor.${param}`)}</label>
                    <input
                      id={goalId('param')}
                      type="number"
                      inputMode="numeric"
                      min="1"
                      step="1"
                      value={goal.param}
                      placeholder="1"
                      onChange={(event) => updateGoal(goal.key, { param: event.target.value })}
                      aria-invalid={goalErrors.param ? true : undefined}
                    />
                    {goalErrors.param && <span className="mp-field-error">{t(goalErrors.param)}</span>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div className="ac-actions">
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus aria-hidden="true" size={16} />}
            onClick={addGoal}
            disabled={draft.goals.length >= MAX_GOALS_PER_TRACK}
          >
            {t('progression.admin.editor.addGoal')}
          </Button>
        </div>
      </fieldset>

      {track && (
        <p className="ac-field__hint">
          {candidateCount !== undefined
            ? t('progression.admin.editor.recomputeNote', { count: candidateCount, division: fromDivisionName ?? '' })
            : t('progression.admin.editor.recomputeNoteUnknown', { division: fromDivisionName ?? '' })}
        </p>
      )}
    </AdminFormModal>
  );
}
