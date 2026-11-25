import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { ApiError } from '../../services/api/apiClient';
import {
  buildsApi,
  type BuildCoreStat,
  type BuildRules,
  type BuildSimCategory,
  type BuildStyleId,
  type LeveledBuildMove,
  type PlayerBuildView,
} from '../../services/api/builds.api';
import { displayMoveName } from '../../utils/movesets';
import { buildCost, maxAffordableStat, nextStatPointCost, type BuildCostInput } from '../../utils/buildCost';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Skeleton from '../ui/Skeleton';
import './BuildEditor.css';

export interface BuildEditorProps {
  playerId: string;
  /** Called with the saved build after a successful save. */
  onSaved: (view: PlayerBuildView) => void;
  onCancel: () => void;
}

/** One error from the 400 body of `PUT /players/me/build`. */
interface ServerBuildError {
  code: string;
  field: string;
  message: string;
  details?: Record<string, unknown>;
}

interface BuildDraft {
  style: BuildStyleId;
  specialty?: BuildSimCategory;
  stats: Record<BuildCoreStat, number>;
  signatureLevels: number[];
  finisherLevels: number[];
}

type MoveKind = 'signatures' | 'finishers';

function draftFromView(view: PlayerBuildView, rules: BuildRules): BuildDraft {
  const levelOf = (move: LeveledBuildMove) => move.level ?? rules.moves.minLevel;
  return {
    style: view.build.style,
    specialty: view.build.specialty,
    stats: { ...view.build.stats },
    signatureLevels: view.moves.signatures.map(levelOf),
    finisherLevels: view.moves.finishers.map(levelOf),
  };
}

/** The default build: allRounder, no specialty, every stat at base, every move at level 1. */
function defaultDraft(view: PlayerBuildView, rules: BuildRules): BuildDraft {
  const stats = {} as Record<BuildCoreStat, number>;
  for (const stat of rules.stats.coreStats) stats[stat] = rules.stats.base;
  return {
    style: 'allRounder',
    stats,
    signatureLevels: view.moves.signatures.map(() => rules.moves.minLevel),
    finisherLevels: view.moves.finishers.map(() => rules.moves.minLevel),
  };
}

function isServerBuildError(value: unknown): value is ServerBuildError {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record['code'] === 'string' && typeof record['message'] === 'string';
}

function serverErrorsFrom(err: unknown): ServerBuildError[] {
  if (!(err instanceof ApiError) || err.status !== 400) return [];
  const errors = err.details['errors'];
  return Array.isArray(errors) ? errors.filter(isServerBuildError) : [];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface StatNumberInputProps {
  id: string;
  min: number;
  max: number;
  value: number;
  onCommit: (value: number) => void;
}

/**
 * Number box for a stat. Typing is free; the value is applied (and clamped to
 * the range and the budget) on blur or Enter, so a half-typed number is never
 * snapped back mid-keystroke.
 */
function StatNumberInput({ id, min, max, value, onCommit }: StatNumberInputProps) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text !== null && text.trim() !== '') onCommit(Number(text));
    setText(null);
  };
  return (
    <input
      id={id}
      type="number"
      className="build-editor__number"
      min={min}
      max={max}
      value={text ?? String(value)}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        }
      }}
    />
  );
}

/**
 * The wrestler's build editor (BLD-12): pick a style and a specialty it
 * allows, spend build points on the four stats and on move levels, and save
 * through `PUT /players/me/build`. Every number comes from `GET /builds/rules`;
 * the live cost mirrors the backend, which still checks everything on save.
 */
export default function BuildEditor({ playerId, onSaved, onCancel }: BuildEditorProps) {
  const { t } = useTranslation();
  const [rules, setRules] = useState<BuildRules | null>(null);
  const [view, setView] = useState<PlayerBuildView | null>(null);
  const [draft, setDraft] = useState<BuildDraft | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [clearedSpecialty, setClearedSpecialty] = useState<{ category: BuildSimCategory; style: BuildStyleId } | null>(null);
  const [serverErrors, setServerErrors] = useState<ServerBuildError[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const [loadedRules, loadedView] = await Promise.all([
          buildsApi.getRules(controller.signal),
          buildsApi.getPlayerBuild(playerId, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setRules(loadedRules);
        setView(loadedView);
        setDraft(draftFromView(loadedView, loadedRules));
      } catch {
        if (!controller.signal.aborted) setLoadFailed(true);
      }
    };
    void load();
    return () => controller.abort();
  }, [playerId]);

  if (loadFailed) {
    return (
      <p className="me-alert me-alert--error" role="alert">{t('builds.editor.loadFailed')}</p>
    );
  }
  if (!rules || !view || !draft) {
    return <Skeleton variant="block" count={3} />;
  }

  const costInput: BuildCostInput = {
    stats: draft.stats,
    signatureLevels: draft.signatureLevels,
    finisherLevels: draft.finisherLevels,
  };
  const spent = buildCost(costInput, rules);
  const budget = view.budget.budget;
  const remaining = budget - spent;
  const overBudget = remaining < 0;
  const allowedForStyle = rules.styleSpecialties[draft.style] ?? [];
  const styleName = (id: BuildStyleId) => t(`builds.styles.${id}`);
  const categoryName = (id: BuildSimCategory) => t(`simCategories.${id}`);
  const fieldErrors = (field: string) => serverErrors.filter((error) => error.field === field);

  const updateDraft = (changes: Partial<BuildDraft>) => {
    setDraft({ ...draft, ...changes });
    setServerErrors([]);
    setSaveError(null);
  };

  const chooseStyle = (style: BuildStyleId) => {
    const allowed = rules.styleSpecialties[style] ?? [];
    if (draft.specialty && !allowed.includes(draft.specialty)) {
      setClearedSpecialty({ category: draft.specialty, style });
      updateDraft({ style, specialty: undefined });
      return;
    }
    setClearedSpecialty(null);
    updateDraft({ style });
  };

  const chooseSpecialty = (specialty: BuildSimCategory | undefined) => {
    setClearedSpecialty(null);
    updateDraft({ specialty });
  };

  const setStat = (stat: BuildCoreStat, requested: number) => {
    if (!Number.isFinite(requested)) return;
    const current = draft.stats[stat];
    const wanted = clamp(Math.floor(requested), rules.stats.base, rules.stats.cap);
    // Lowering is always allowed; raising stops at what the budget covers.
    const value = wanted <= current ? wanted : Math.min(wanted, maxAffordableStat(costInput, stat, budget, rules));
    if (value !== current) updateDraft({ stats: { ...draft.stats, [stat]: value } });
  };

  const levelCost = (kind: MoveKind) =>
    kind === 'signatures' ? rules.moves.signatureLevelCost : rules.moves.finisherLevelCost;

  const setLevel = (kind: MoveKind, index: number, level: number) => {
    const key = kind === 'signatures' ? 'signatureLevels' : 'finisherLevels';
    const levels = [...draft[key]];
    levels[index] = clamp(level, rules.moves.minLevel, rules.moves.maxLevel);
    updateDraft({ [key]: levels });
  };

  const reset = () => {
    setClearedSpecialty(null);
    // Spelled out so the merge drops the current specialty.
    updateDraft({ ...defaultDraft(view, rules), specialty: undefined });
  };

  const save = async () => {
    setSaving(true);
    setServerErrors([]);
    setSaveError(null);
    try {
      const saved = await buildsApi.updateMyBuild({
        style: draft.style,
        specialty: draft.specialty,
        stats: draft.stats,
        moveLevels: { signatures: draft.signatureLevels, finishers: draft.finisherLevels },
      });
      onSaved(saved);
    } catch (err) {
      const errors = serverErrorsFrom(err);
      if (errors.length > 0) setServerErrors(errors);
      else setSaveError(err instanceof Error && err.message ? err.message : t('builds.editor.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const errorText = (error: ServerBuildError) =>
    t(`builds.editor.errors.${error.code}`, { ...(error.details ?? {}), defaultValue: error.message });

  const renderFieldErrors = (field: string) =>
    fieldErrors(field).map((error) => (
      <p key={`${error.code}-${error.field}`} className="build-editor__field-error" role="alert">
        {errorText(error)}
      </p>
    ));

  const renderMoves = (kind: MoveKind, moves: LeveledBuildMove[], levels: number[]) => {
    if (moves.length === 0) return null;
    const cost = levelCost(kind);
    return (
      <div className="build-editor__move-group">
        <h4 className="build-editor__move-title">
          {t(kind === 'signatures' ? 'builds.card.signatureLevels' : 'builds.card.finisherLevels')}
          <span className="build-editor__muted">{t('builds.editor.levelCost', { count: cost })}</span>
        </h4>
        <ul className="build-editor__moves">
          {moves.map((move, index) => {
            const level = levels[index] ?? rules.moves.minLevel;
            const name = displayMoveName(move);
            const canRaise = level < rules.moves.maxLevel && remaining >= cost;
            return (
              <li key={`${move.gameName}-${index}`} className="build-editor__move" data-testid={`move-${kind}-${index}`}>
                <span className="build-editor__move-name">{name}</span>
                <span className="build-editor__stepper">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Minus size={14} aria-hidden="true" />}
                    aria-label={t('builds.editor.lowerLevel', { move: name })}
                    disabled={level <= rules.moves.minLevel}
                    onClick={() => setLevel(kind, index, level - 1)}
                  />
                  <span className="build-editor__level" aria-live="polite">
                    {t('builds.moveLevel', { level })}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Plus size={14} aria-hidden="true" />}
                    aria-label={t('builds.editor.raiseLevel', { move: name })}
                    disabled={!canRaise}
                    onClick={() => setLevel(kind, index, level + 1)}
                  />
                </span>
              </li>
            );
          })}
        </ul>
        {renderFieldErrors(`moveLevels.${kind}`)}
      </div>
    );
  };

  const hasMoves = view.moves.signatures.length > 0 || view.moves.finishers.length > 0;
  const unplacedErrors = serverErrors.filter(
    (error) =>
      error.field !== 'specialty' &&
      error.field !== 'stats' &&
      !error.field.startsWith('stats.') &&
      !error.field.startsWith('moveLevels.'),
  );

  return (
    <section className="profile-section build-editor" aria-labelledby="build-editor-title" data-testid="build-editor">
      <h2 className="profile-section__title" id="build-editor-title">{t('builds.editor.title')}</h2>
      <Card>
        <div className={`build-editor__budget${overBudget ? ' build-editor__budget--over' : ''}`} data-testid="build-budget">
          <dl className="build-editor__budget-figures">
            <div>
              <dt>{t('builds.editor.spent')}</dt>
              <dd data-testid="build-spent">{spent}</dd>
            </div>
            <div>
              <dt>{t('builds.editor.budget')}</dt>
              <dd data-testid="build-budget-total">{budget}</dd>
            </div>
            <div>
              <dt>{t('builds.editor.remaining')}</dt>
              <dd data-testid="build-remaining">{remaining}</dd>
            </div>
          </dl>
          <progress
            className="build-editor__meter"
            value={Math.min(spent, budget)}
            max={Math.max(budget, 1)}
            aria-label={t('builds.editor.meterLabel', { spent, budget })}
          />
          {overBudget && (
            <p className="build-editor__over" role="alert" data-testid="build-over-budget">
              <strong>{t('builds.editor.overBudget', { count: -remaining })}</strong>{' '}
              {t('builds.editor.overBudgetHint')}
            </p>
          )}
        </div>

        <fieldset className="build-editor__fieldset">
          <legend className="build-editor__legend">{t('builds.editor.style')}</legend>
          <div className="build-editor__styles">
            {rules.styles.map((style) => {
              const bonuses = rules.stats.coreStats
                .filter((stat) => (style.statBonuses[stat] ?? 0) > 0)
                .map((stat) => t('builds.editor.statBonus', { bonus: style.statBonuses[stat], stat: t(`builds.stats.${stat}`) }))
                .join(', ');
              const selected = draft.style === style.id;
              return (
                <label
                  key={style.id}
                  className={`build-editor__style${selected ? ' build-editor__style--selected' : ''}`}
                  data-testid={`style-option-${style.id}`}
                >
                  <input
                    type="radio"
                    name="build-style"
                    value={style.id}
                    checked={selected}
                    onChange={() => chooseStyle(style.id)}
                  />
                  <span className="build-editor__style-name">{styleName(style.id)}</span>
                  <span className="build-editor__muted">{bonuses}</span>
                  {style.beats || style.beatenBy ? (
                    <>
                      {style.beats && (
                        <span className="build-editor__edge build-editor__edge--strong">
                          {t('builds.editor.strongAgainst', { style: styleName(style.beats) })}
                        </span>
                      )}
                      {style.beatenBy && (
                        <span className="build-editor__edge build-editor__edge--weak">
                          {t('builds.editor.weakAgainst', { style: styleName(style.beatenBy) })}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="build-editor__edge">{t('builds.editor.noEdge')}</span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="build-editor__fieldset">
          <legend className="build-editor__legend">{t('builds.editor.specialty')}</legend>
          <p className="me-hint">{t('builds.editor.specialtyHint')}</p>
          {clearedSpecialty && (
            <p className="me-alert me-alert--warn" role="status" data-testid="specialty-cleared">
              {t('builds.editor.specialtyCleared', {
                category: categoryName(clearedSpecialty.category),
                style: styleName(clearedSpecialty.style),
              })}
            </p>
          )}
          <div className="build-editor__specialties">
            <label className="build-editor__specialty" data-testid="specialty-option-none">
              <input
                type="radio"
                name="build-specialty"
                value=""
                checked={!draft.specialty}
                onChange={() => chooseSpecialty(undefined)}
              />
              <span className="build-editor__style-name">{t('builds.editor.noSpecialty')}</span>
            </label>
            {rules.specialtyCategories.map((category) => {
              const allowed = allowedForStyle.includes(category);
              const optionClass = `build-editor__specialty${allowed ? '' : ' build-editor__specialty--disabled'}`;
              return (
                <label key={category} className={optionClass} data-testid={`specialty-option-${category}`}>
                  <input
                    type="radio"
                    name="build-specialty"
                    value={category}
                    checked={draft.specialty === category}
                    disabled={!allowed}
                    onChange={() => chooseSpecialty(category)}
                  />
                  <span className="build-editor__style-name">{categoryName(category)}</span>
                  <span className="build-editor__muted">{t(`simCategories.examples.${category}`)}</span>
                  {!allowed && (
                    <span className="build-editor__reason">
                      {t('builds.editor.specialtyNotAllowed', { style: styleName(draft.style), category: categoryName(category) })}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
          {renderFieldErrors('specialty')}
        </fieldset>

        <fieldset className="build-editor__fieldset">
          <legend className="build-editor__legend">{t('builds.editor.stats')}</legend>
          <p className="me-hint">{t('builds.editor.statsHint', { base: rules.stats.base, cap: rules.stats.cap })}</p>
          <ul className="build-editor__stats">
            {rules.stats.coreStats.map((stat) => {
              const value = draft.stats[stat];
              const nextCost = nextStatPointCost(value, rules);
              const label = t(`builds.stats.${stat}`);
              const inputId = `build-stat-${stat}`;
              return (
                <li key={stat} className="build-editor__stat" data-testid={`stat-row-${stat}`}>
                  <label htmlFor={inputId} className="build-editor__stat-label">{label}</label>
                  <input
                    type="range"
                    className="build-editor__slider"
                    min={rules.stats.base}
                    max={rules.stats.cap}
                    value={value}
                    aria-label={t('builds.editor.statSlider', { stat: label })}
                    onChange={(event) => setStat(stat, Number(event.target.value))}
                  />
                  <StatNumberInput
                    id={inputId}
                    min={rules.stats.base}
                    max={rules.stats.cap}
                    value={value}
                    onCommit={(next) => setStat(stat, next)}
                  />
                  <span className="build-editor__muted build-editor__next" data-testid={`stat-next-${stat}`}>
                    {nextCost === null
                      ? t('builds.editor.statMaxed')
                      : t('builds.editor.nextPoint', { count: nextCost })}
                  </span>
                  {renderFieldErrors(`stats.${stat}`)}
                </li>
              );
            })}
          </ul>
          {renderFieldErrors('stats')}
        </fieldset>

        <fieldset className="build-editor__fieldset">
          <legend className="build-editor__legend">{t('builds.editor.moves')}</legend>
          {hasMoves ? (
            <div className="build-editor__move-groups">
              {renderMoves('signatures', view.moves.signatures, draft.signatureLevels)}
              {renderMoves('finishers', view.moves.finishers, draft.finisherLevels)}
            </div>
          ) : (
            <p className="me-hint">{t('builds.editor.noMoves')}</p>
          )}
        </fieldset>

        {unplacedErrors.length > 0 && (
          <div className="me-alert me-alert--error" role="alert" data-testid="build-errors">
            <ul className="build-editor__error-list">
              {unplacedErrors.map((error) => (
                <li key={`${error.code}-${error.field}`}>{errorText(error)}</li>
              ))}
            </ul>
          </div>
        )}
        {saveError && <p className="me-alert me-alert--error" role="alert">{saveError}</p>}

        <div className="build-editor__actions">
          <Button variant="ghost" icon={<RotateCcw size={16} aria-hidden="true" />} onClick={reset} disabled={saving}>
            {t('builds.editor.reset')}
          </Button>
          <span className="build-editor__actions-end">
            <Button variant="secondary" onClick={onCancel} disabled={saving}>{t('common.cancel')}</Button>
            <Button onClick={() => void save()} loading={saving} disabled={saving || overBudget}>
              {t('builds.editor.save')}
            </Button>
          </span>
        </div>
      </Card>
    </section>
  );
}
