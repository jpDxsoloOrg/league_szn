import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSiteConfig } from '../../contexts/SiteConfigContext';
import { isApiError } from '../../services/api/apiClient';
import { injuriesApi } from '../../services/api/injuries.api';
import { SIM_CATEGORIES, SIM_CATEGORY_LABELS, type SimCategory } from '../../constants/simCategories';
import {
  ENDURANCE_BASELINE,
  MAX_CHANCE_BANDS,
  MAX_FORMAT_KEYS,
  type InjurySeverity,
  type InjurySeverityKey,
  type InjuryTunables,
  type InjuryTunablesHistoryEntry,
} from '../../types/injury';
import { matchesUntilExhausted, previewMatch } from '../../utils/fatiguePreview';
import { formatInstant } from '../../utils/dateUtils';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Modal from '../ui/Modal';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import AdminNotice from './AdminNotice';
import SearchableSelect from './SearchableSelect';
import {
  injuryFieldIds,
  isValidTimeZone,
  listTimeZones,
  toInjuryForm,
  toInjuryInput,
  validateInjuryForm,
  type InjuryFieldError,
  type InjuryForm,
  type InjuryFormErrors,
  type InjuryFormProblem,
} from './injuryConfigForm';
import './adminContent.css';
import './AdminInjuryConfig.css';

const PROBLEM_FALLBACKS: Record<InjuryFormProblem, string> = {
  integer: 'Enter a whole number from {{min}} to {{max}}.',
  percent: 'Enter a percentage from 0 to 100.',
  multiplier: 'Enter a number above 0 and at most {{max}}.',
  weight: 'Enter a weight above 0 and at most {{max}}.',
  weeks: 'Enter a whole number of weeks from {{min}} to {{max}}.',
  weeksOrder: 'Max weeks can\'t be less than min weeks.',
  formatKey: 'Give the format a key of 1 to {{max}} characters.',
  formatDuplicate: 'This format is already listed.',
  formatCount: 'There can be at most {{max}} formats.',
  bandsOrder: 'List the bands from the highest minimum stamina to the lowest, with no repeats.',
  bandsLastZero: 'The last band must start at 0 stamina so every stamina level has a chance.',
  bandsCount: 'Add between 1 and {{max}} bands.',
  timezone: 'Pick a time zone from the list.',
};

const FORMAT_FALLBACKS: Record<string, string> = {
  singles: 'Singles',
  tag: 'Tag team',
  multiPerson: 'Multi-person',
  battleRoyal: 'Battle royal',
};

const SEVERITY_FALLBACKS: Record<InjurySeverityKey, string> = {
  minor: 'Minor',
  moderate: 'Moderate',
  major: 'Major',
};

type Message = { tone: 'success' | 'error'; text: string; conflict?: boolean };

interface NumberFieldProps {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** 'any' for decimals such as multipliers and percentages. */
  step?: number | 'any';
  hint?: string;
  error?: string;
  disabled?: boolean;
}

/** A number input. An empty box is NaN until the GM types a value. */
function NumberField({ id, label, value, onChange, min = 0, max, step = 1, hint, error, disabled }: NumberFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="ac-field">
      <label className="ac-field__label" htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode={step === 1 ? 'numeric' : 'decimal'}
        min={min}
        max={max}
        step={step}
        value={Number.isNaN(value) ? '' : value}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value === '' ? Number.NaN : Number(event.target.value))}
      />
      {hint && <p className="ac-field__hint">{hint}</p>}
      {error && <p className="injury-config__error" id={errorId}>{error}</p>}
    </div>
  );
}

/** Stamina and injury tunables (INJ-10): Admins edit, Moderators view. */
export default function AdminInjuryConfig() {
  const { t, i18n } = useTranslation();
  const { isSuperAdmin } = useAuth();
  const { features } = useSiteConfig();
  const canEdit = isSuperAdmin;

  const [saved, setSaved] = useState<InjuryTunables | null>(null);
  const [history, setHistory] = useState<InjuryTunablesHistoryEntry[]>([]);
  const [form, setForm] = useState<InjuryForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [previewCategory, setPreviewCategory] = useState<SimCategory>('standard');
  const [previewFormat, setPreviewFormat] = useState('singles');
  const [previewStamina, setPreviewStamina] = useState(Number.NaN);
  const [previewEndurance, setPreviewEndurance] = useState(ENDURANCE_BASELINE);
  const nextRowId = useRef(0);

  const loadSettings = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const result = await injuriesApi.getConfig(signal);
      if (signal?.aborted) return;
      setSaved(result.settings);
      setHistory(result.history);
      setForm(toInjuryForm(result.settings));
      setPreviewStamina(result.settings.maxStamina);
      setShowErrors(false);
    } catch {
      if (!signal?.aborted) setLoadFailed(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadSettings(controller.signal);
    return () => controller.abort();
  }, [loadSettings]);

  const errors: InjuryFormErrors = useMemo(
    () => (form ? validateInjuryForm(form, isValidTimeZone) : {}),
    [form],
  );
  const timeZoneOptions = useMemo(
    () => listTimeZones(form?.timezone ?? '').map((zone) => ({ value: zone, label: zone.replace(/_/g, ' ') })),
    [form?.timezone],
  );

  const title = t('admin.injuryConfig.title', 'Injury & Stamina Settings');

  if (loading) {
    return (
      <div className="ac-page">
        <PageHeader title={title} />
        <Skeleton variant="block" count={3} />
      </div>
    );
  }

  if (!form || !saved || loadFailed) {
    return (
      <div className="ac-page">
        <PageHeader title={title} />
        <AdminNotice
          tone="error"
          action={<Button variant="secondary" size="sm" onClick={() => void loadSettings()}>{t('admin.injuryConfig.retry', 'Try again')}</Button>}
        >
          {t('admin.injuryConfig.loadFailed', 'Could not load the injury settings.')}
        </AdminNotice>
      </div>
    );
  }

  const hasErrors = Object.keys(errors).length > 0;
  const errorText = (fieldId: string): string | undefined => {
    if (!showErrors) return undefined;
    const fieldError: InjuryFieldError | undefined = errors[fieldId];
    if (!fieldError) return undefined;
    return t(`admin.injuryConfig.problems.${fieldError.problem}`, PROBLEM_FALLBACKS[fieldError.problem], fieldError.values);
  };

  const categoryLabel = (category: SimCategory) => t(`simCategories.${category}`, SIM_CATEGORY_LABELS[category]);
  const formatLabel = (key: string) => {
    const fallback = FORMAT_FALLBACKS[key];
    return fallback ? t(`admin.injuryConfig.formats.names.${key}`, fallback) : key;
  };
  const severityLabel = (key: InjurySeverityKey) => t(`admin.injuryConfig.severities.names.${key}`, SEVERITY_FALLBACKS[key]);
  const formatPercent = (fraction: number) => `${(fraction * 100).toLocaleString(i18n.language, { maximumFractionDigits: 2 })}%`;
  const formatWeeks = (weeks: number) => weeks.toLocaleString(i18n.language, { maximumFractionDigits: 2 });

  const updateForm = (patch: Partial<InjuryForm>) => setForm((current) => (current ? { ...current, ...patch } : current));

  const updateCategoryValue = (field: 'drainByCategory' | 'categoryRisk', category: SimCategory, value: number) => {
    setForm((current) => (current ? { ...current, [field]: { ...current[field], [category]: value } } : current));
  };

  const newRowId = () => {
    nextRowId.current += 1;
    return `new-${nextRowId.current}`;
  };

  const updateFormat = (rowId: string, patch: { key?: string; multiplier?: number }) => {
    setForm((current) => (current
      ? { ...current, formats: current.formats.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)) }
      : current));
  };

  const updateBand = (rowId: string, patch: { minStamina?: number; chancePercent?: number }) => {
    setForm((current) => (current
      ? { ...current, bands: current.bands.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)) }
      : current));
  };

  const updateSeverity = (key: InjurySeverityKey, patch: Partial<InjurySeverity>) => {
    setForm((current) => (current
      ? { ...current, severities: current.severities.map((row) => (row.key === key ? { ...row, ...patch } : row)) }
      : current));
  };

  const handleSaveClick = () => {
    setShowErrors(true);
    if (hasErrors) {
      setMessage({ tone: 'error', text: t('admin.injuryConfig.fixErrors', 'Fix the highlighted settings before saving.') });
      return;
    }
    setMessage(null);
    setConfirming(true);
  };

  const handleConfirmSave = async () => {
    setSaving(true);
    try {
      const result = await injuriesApi.updateConfig(toInjuryInput(form), saved.version);
      const { version, updatedAt, updatedBy } = result.settings;
      setSaved(result.settings);
      setHistory((current) => [{ version, updatedAt, updatedBy }, ...current.filter((entry) => entry.version !== version)]);
      setForm(toInjuryForm(result.settings));
      setShowErrors(false);
      setMessage({ tone: 'success', text: t('admin.injuryConfig.saved', 'Saved as version {{version}}.', { version }) });
    } catch (err) {
      if (isApiError(err, 409)) {
        setMessage({
          tone: 'error',
          conflict: true,
          text: t(
            'admin.injuryConfig.conflict',
            'Someone else saved these settings after you opened the page. Reload to see their version, then make your changes again.',
          ),
        });
      } else {
        setMessage({
          tone: 'error',
          text: err instanceof Error ? err.message : t('admin.injuryConfig.saveFailed', 'Failed to save the injury settings'),
        });
      }
    } finally {
      setSaving(false);
      setConfirming(false);
    }
  };

  const handleDiscard = () => {
    setForm(toInjuryForm(saved));
    setShowErrors(false);
    setMessage(null);
  };

  const handleReload = async () => {
    setMessage(null);
    await loadSettings();
  };

  // The preview and the exhaustion helper read the form as it is now, so a GM
  // sees what a change means before saving. They need a form that would save.
  const liveTunables = hasErrors ? null : toInjuryInput(form);
  const previewFormats = form.formats.map((row) => row.key.trim()).filter((key) => key.length > 0);
  const previewReady = liveTunables !== null
    && Number.isFinite(previewStamina) && previewStamina >= 0
    && Number.isFinite(previewEndurance);
  const preview = previewReady
    ? previewMatch({
      category: previewCategory,
      format: previewFormat,
      endurance: previewEndurance,
      stamina: Math.min(previewStamina, liveTunables.maxStamina),
    }, liveTunables)
    : null;
  const exhaustion = liveTunables ? matchesUntilExhausted(liveTunables) : null;
  const severityWeightTotal = form.severities.reduce((sum, severity) => sum + (Number.isFinite(severity.weight) ? severity.weight : 0), 0);

  return (
    <div className="ac-page injury-config">
      <PageHeader
        title={title}
        subtitle={t(
          'admin.injuryConfig.subtitle',
          'Set how much stamina matches take, how likely injuries are and how long they last. New rolls use the latest saved version.',
        )}
      />

      {!features.injuries && (
        <AdminNotice tone="info">
          {t(
            'admin.injuryConfig.featureOff',
            'Injuries are turned off, so players don\'t see any of this yet. An Admin can turn them on in Feature Management.',
          )}
        </AdminNotice>
      )}
      {!canEdit && (
        <AdminNotice tone="info">
          {t('admin.injuryConfig.readOnly', 'You can view these settings. Only Admins can change them.')}
        </AdminNotice>
      )}
      {message && (
        <AdminNotice
          tone={message.tone}
          onDismiss={() => setMessage(null)}
          action={message.conflict
            ? <Button variant="secondary" size="sm" onClick={() => void handleReload()}>{t('admin.injuryConfig.reload', 'Reload')}</Button>
            : undefined}
        >
          {message.text}
        </AdminNotice>
      )}

      <p className="ac-section__text injury-config__version">
        {saved.version > 0 && saved.updatedAt
          ? t('admin.injuryConfig.version', 'Version {{version}}, saved by {{user}} on {{date}}.', {
            version: saved.version,
            user: saved.updatedBy ?? '?',
            date: formatInstant(saved.updatedAt, i18n.language),
          })
          : t('admin.injuryConfig.notSaved', 'Not saved yet: these are the starting values.')}
      </p>

      <fieldset className="injury-config__fieldset" disabled={!canEdit}>
        <Card className="ac-form">
          <div>
            <h2 className="ac-section__title">{t('admin.injuryConfig.drain.title', 'Stamina drain')}</h2>
            <p className="ac-section__text">
              {t('admin.injuryConfig.drain.description', 'Stamina one singles match takes from each competitor, by sim category, before Endurance.')}
            </p>
          </div>
          <div className="ac-form__row">
            <NumberField
              id={injuryFieldIds.maxStamina}
              label={t('admin.injuryConfig.drain.maxStamina', 'Max stamina')}
              value={form.maxStamina}
              min={1}
              error={errorText(injuryFieldIds.maxStamina)}
              onChange={(value) => updateForm({ maxStamina: value })}
            />
            <NumberField
              id={injuryFieldIds.endurance}
              label={t('admin.injuryConfig.drain.enduranceReduction', 'Endurance reduction (%)')}
              hint={t(
                'admin.injuryConfig.drain.enduranceReductionHint',
                'How much less a wrestler with maxed Endurance loses. 0 turns the Endurance effect off.',
              )}
              value={form.enduranceReductionPercent}
              max={100}
              step="any"
              error={errorText(injuryFieldIds.endurance)}
              onChange={(value) => updateForm({ enduranceReductionPercent: value })}
            />
          </div>
          <fieldset className="injury-config__group">
            <legend className="injury-config__legend">{t('admin.injuryConfig.drain.perCategory', 'Drain per match')}</legend>
            <div className="injury-config__grid">
              {SIM_CATEGORIES.map((category) => (
                <NumberField
                  key={category}
                  id={injuryFieldIds.drain(category)}
                  label={categoryLabel(category)}
                  value={form.drainByCategory[category]}
                  error={errorText(injuryFieldIds.drain(category))}
                  onChange={(value) => updateCategoryValue('drainByCategory', category, value)}
                />
              ))}
            </div>
          </fieldset>
        </Card>

        <Card className="ac-form">
          <div>
            <h2 className="ac-section__title">{t('admin.injuryConfig.formats.title', 'Format multipliers')}</h2>
            <p className="ac-section__text">
              {t('admin.injuryConfig.formats.description', 'Drain is multiplied by this for each match format. A format not listed uses 1.')}
            </p>
          </div>
          {errorText(injuryFieldIds.formats) && <p className="injury-config__error" role="alert">{errorText(injuryFieldIds.formats)}</p>}
          <ul className="injury-config__rows">
            {form.formats.map((row, index) => (
              <li className="injury-config__row" key={row.rowId}>
                <div className="ac-field">
                  <label className="ac-field__label" htmlFor={injuryFieldIds.formatKey(row.rowId)}>
                    {t('admin.injuryConfig.formats.key', 'Format')}
                  </label>
                  <input
                    id={injuryFieldIds.formatKey(row.rowId)}
                    type="text"
                    maxLength={40}
                    value={row.key}
                    aria-invalid={errorText(injuryFieldIds.formatKey(row.rowId)) ? true : undefined}
                    aria-describedby={errorText(injuryFieldIds.formatKey(row.rowId)) ? `${injuryFieldIds.formatKey(row.rowId)}-error` : undefined}
                    onChange={(event) => updateFormat(row.rowId, { key: event.target.value })}
                  />
                  {row.key in FORMAT_FALLBACKS && <p className="ac-field__hint">{formatLabel(row.key)}</p>}
                  {errorText(injuryFieldIds.formatKey(row.rowId)) && (
                    <p className="injury-config__error" id={`${injuryFieldIds.formatKey(row.rowId)}-error`}>
                      {errorText(injuryFieldIds.formatKey(row.rowId))}
                    </p>
                  )}
                </div>
                <NumberField
                  id={injuryFieldIds.formatMultiplier(row.rowId)}
                  label={t('admin.injuryConfig.formats.multiplier', 'Multiplier')}
                  value={row.multiplier}
                  step="any"
                  error={errorText(injuryFieldIds.formatMultiplier(row.rowId))}
                  onChange={(value) => updateFormat(row.rowId, { multiplier: value })}
                />
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="injury-config__remove"
                    icon={<Trash2 aria-hidden="true" size={16} />}
                    aria-label={t('admin.injuryConfig.formats.removeNamed', 'Remove format {{number}}', { number: index + 1 })}
                    onClick={() => updateForm({ formats: form.formats.filter((entry) => entry.rowId !== row.rowId) })}
                  >
                    {t('admin.injuryConfig.remove', 'Remove')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {canEdit && (
            <div className="ac-actions">
              <Button
                variant="secondary"
                icon={<Plus aria-hidden="true" size={16} />}
                disabled={form.formats.length >= MAX_FORMAT_KEYS}
                onClick={() => updateForm({ formats: [...form.formats, { rowId: newRowId(), key: '', multiplier: 1 }] })}
              >
                {t('admin.injuryConfig.formats.add', 'Add format')}
              </Button>
            </div>
          )}
        </Card>

        <Card className="ac-form">
          <div>
            <h2 className="ac-section__title">{t('admin.injuryConfig.bands.title', 'Injury chance by stamina')}</h2>
            <p className="ac-section__text">
              {t(
                'admin.injuryConfig.bands.description',
                'Chance of an injury in a match, by stamina after it. A wrestler uses the first band whose minimum they reach, highest first; the last band starts at 0.',
              )}
            </p>
          </div>
          {errorText(injuryFieldIds.bands) && <p className="injury-config__error" role="alert">{errorText(injuryFieldIds.bands)}</p>}
          <ul className="injury-config__rows">
            {form.bands.map((row, index) => (
              <li className="injury-config__row" key={row.rowId}>
                <NumberField
                  id={injuryFieldIds.bandMin(row.rowId)}
                  label={t('admin.injuryConfig.bands.minStamina', 'Min stamina')}
                  value={row.minStamina}
                  error={errorText(injuryFieldIds.bandMin(row.rowId))}
                  onChange={(value) => updateBand(row.rowId, { minStamina: value })}
                />
                <NumberField
                  id={injuryFieldIds.bandChance(row.rowId)}
                  label={t('admin.injuryConfig.bands.chance', 'Injury chance (%)')}
                  value={row.chancePercent}
                  max={100}
                  step="any"
                  error={errorText(injuryFieldIds.bandChance(row.rowId))}
                  onChange={(value) => updateBand(row.rowId, { chancePercent: value })}
                />
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="injury-config__remove"
                    icon={<Trash2 aria-hidden="true" size={16} />}
                    aria-label={t('admin.injuryConfig.bands.removeNamed', 'Remove band {{number}}', { number: index + 1 })}
                    disabled={form.bands.length <= 1}
                    onClick={() => updateForm({ bands: form.bands.filter((entry) => entry.rowId !== row.rowId) })}
                  >
                    {t('admin.injuryConfig.remove', 'Remove')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {canEdit && (
            <div className="ac-actions">
              <Button
                variant="secondary"
                icon={<Plus aria-hidden="true" size={16} />}
                disabled={form.bands.length >= MAX_CHANCE_BANDS}
                onClick={() => updateForm({ bands: [...form.bands, { rowId: newRowId(), minStamina: 0, chancePercent: 0 }] })}
              >
                {t('admin.injuryConfig.bands.add', 'Add band')}
              </Button>
            </div>
          )}
        </Card>

        <Card className="ac-form">
          <div>
            <h2 className="ac-section__title">{t('admin.injuryConfig.risk.title', 'Category risk')}</h2>
            <p className="ac-section__text">
              {t('admin.injuryConfig.risk.description', 'The band\'s chance is multiplied by this for each sim category, up to 95%.')}
            </p>
          </div>
          <div className="injury-config__grid">
            {SIM_CATEGORIES.map((category) => (
              <NumberField
                key={category}
                id={injuryFieldIds.risk(category)}
                label={categoryLabel(category)}
                value={form.categoryRisk[category]}
                step="any"
                error={errorText(injuryFieldIds.risk(category))}
                onChange={(value) => updateCategoryValue('categoryRisk', category, value)}
              />
            ))}
          </div>
        </Card>

        <Card className="ac-form">
          <div>
            <h2 className="ac-section__title">{t('admin.injuryConfig.severities.title', 'Severity')}</h2>
            <p className="ac-section__text">
              {t(
                'admin.injuryConfig.severities.description',
                'When an injury happens, its severity is picked by weight, then the weeks out are drawn between min and max.',
              )}
            </p>
          </div>
          {form.severities.map((severity) => (
            <fieldset className="injury-config__group" key={severity.key}>
              <legend className="injury-config__legend">
                {severityLabel(severity.key)}
                {severityWeightTotal > 0 && Number.isFinite(severity.weight) && (
                  <span className="injury-config__share">
                    {' '}
                    {t('admin.injuryConfig.severities.share', '({{share}} of injuries)', {
                      share: formatPercent(severity.weight / severityWeightTotal),
                    })}
                  </span>
                )}
              </legend>
              <div className="ac-form__row">
                <NumberField
                  id={injuryFieldIds.severity(severity.key, 'weight')}
                  label={t('admin.injuryConfig.severities.weight', 'Weight')}
                  value={severity.weight}
                  step="any"
                  error={errorText(injuryFieldIds.severity(severity.key, 'weight'))}
                  onChange={(value) => updateSeverity(severity.key, { weight: value })}
                />
                <NumberField
                  id={injuryFieldIds.severity(severity.key, 'minWeeks')}
                  label={t('admin.injuryConfig.severities.minWeeks', 'Min weeks')}
                  value={severity.minWeeks}
                  min={1}
                  error={errorText(injuryFieldIds.severity(severity.key, 'minWeeks'))}
                  onChange={(value) => updateSeverity(severity.key, { minWeeks: value })}
                />
                <NumberField
                  id={injuryFieldIds.severity(severity.key, 'maxWeeks')}
                  label={t('admin.injuryConfig.severities.maxWeeks', 'Max weeks')}
                  value={severity.maxWeeks}
                  min={1}
                  error={errorText(injuryFieldIds.severity(severity.key, 'maxWeeks'))}
                  onChange={(value) => updateSeverity(severity.key, { maxWeeks: value })}
                />
              </div>
            </fieldset>
          ))}
          <NumberField
            id={injuryFieldIds.shift}
            label={t('admin.injuryConfig.severities.shift', 'Low-stamina shift (stamina)')}
            hint={t('admin.injuryConfig.severities.shiftHint', 'Below this stamina, injuries lean towards the worse severities.')}
            value={form.lowStaminaSeverityShift}
            error={errorText(injuryFieldIds.shift)}
            onChange={(value) => updateForm({ lowStaminaSeverityShift: value })}
          />
        </Card>

        <Card className="ac-form">
          <div>
            <h2 className="ac-section__title">{t('admin.injuryConfig.recovery.title', 'Weekly recovery')}</h2>
            <p className="ac-section__text">
              {t('admin.injuryConfig.recovery.description', 'Stamina comes back every Sunday at midnight in the league time zone.')}
            </p>
          </div>
          <fieldset className="ac-choice-group">
            <legend className="ac-field__label">{t('admin.injuryConfig.recovery.mode', 'Each week')}</legend>
            <label className="ac-check">
              <input
                type="radio"
                name="injury-recovery-mode"
                checked={form.recoveryMode === 'full'}
                onChange={() => updateForm({ recoveryMode: 'full' })}
              />
              {t('admin.injuryConfig.recovery.full', 'Back to full')}
            </label>
            <label className="ac-check">
              <input
                type="radio"
                name="injury-recovery-mode"
                checked={form.recoveryMode === 'amount'}
                onChange={() => updateForm({ recoveryMode: 'amount' })}
              />
              {t('admin.injuryConfig.recovery.amount', 'Add a fixed amount')}
            </label>
          </fieldset>
          <div className="ac-form__row">
            {form.recoveryMode === 'amount' && (
              <NumberField
                id={injuryFieldIds.recoveryAmount}
                label={t('admin.injuryConfig.recovery.amountLabel', 'Stamina added each week')}
                value={form.recoveryAmount}
                min={1}
                error={errorText(injuryFieldIds.recoveryAmount)}
                onChange={(value) => updateForm({ recoveryAmount: value })}
              />
            )}
            <div className="ac-field">
              <label className="ac-field__label" htmlFor={injuryFieldIds.timezone}>
                {t('admin.injuryConfig.recovery.timezone', 'League time zone')}
              </label>
              <SearchableSelect
                id={injuryFieldIds.timezone}
                options={timeZoneOptions}
                value={form.timezone}
                onChange={(zone) => updateForm({ timezone: zone })}
                placeholder={t('admin.injuryConfig.recovery.timezoneSearch', 'Search time zones...')}
                disabled={!canEdit}
                errorId={errorText(injuryFieldIds.timezone) ? `${injuryFieldIds.timezone}-error` : undefined}
              />
              <p className="ac-field__hint">
                {t('admin.injuryConfig.recovery.timezoneHint', 'Also sets when the league week starts for payroll and other weekly jobs.')}
              </p>
              {errorText(injuryFieldIds.timezone) && (
                <p className="injury-config__error" id={`${injuryFieldIds.timezone}-error`}>{errorText(injuryFieldIds.timezone)}</p>
              )}
            </div>
          </div>
        </Card>

        <Card className="ac-form">
          <div>
            <h2 className="ac-section__title">{t('admin.injuryConfig.sim.title', 'Match sim penalties')}</h2>
            <p className="ac-section__text">
              {t('admin.injuryConfig.sim.description', 'How tiredness and injuries lower a competitor\'s rating in a simulated match.')}
            </p>
          </div>
          <div className="ac-form__row">
            <NumberField
              id={injuryFieldIds.simFloor}
              label={t('admin.injuryConfig.sim.staminaFloor', 'Rating at 0 stamina (%)')}
              hint={t('admin.injuryConfig.sim.staminaFloorHint', '100% at full stamina, sliding down to this at 0.')}
              value={form.simStaminaFloorPercent}
              max={100}
              step="any"
              error={errorText(injuryFieldIds.simFloor)}
              onChange={(value) => updateForm({ simStaminaFloorPercent: value })}
            />
            <NumberField
              id={injuryFieldIds.injuredPenalty}
              label={t('admin.injuryConfig.sim.injuredPenalty', 'Rating while injured (%)')}
              hint={t('admin.injuryConfig.sim.injuredPenaltyHint', 'Applied on top of the stamina effect when an injured wrestler is booked anyway.')}
              value={form.simInjuredPenaltyPercent}
              max={100}
              step="any"
              error={errorText(injuryFieldIds.injuredPenalty)}
              onChange={(value) => updateForm({ simInjuredPenaltyPercent: value })}
            />
          </div>
        </Card>
      </fieldset>

      <Card className="ac-form">
        <div>
          <h2 className="ac-section__title">{t('admin.injuryConfig.preview.title', 'Preview a match')}</h2>
          <p className="ac-section__text">
            {t('admin.injuryConfig.preview.description', 'Uses the settings on this page, saved or not.')}
          </p>
        </div>
        <div className="ac-form__row">
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="injury-preview-category">{t('admin.injuryConfig.preview.category', 'Sim category')}</label>
            <select
              id="injury-preview-category"
              value={previewCategory}
              onChange={(event) => setPreviewCategory(event.target.value as SimCategory)}
            >
              {SIM_CATEGORIES.map((category) => <option key={category} value={category}>{categoryLabel(category)}</option>)}
            </select>
          </div>
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="injury-preview-format">{t('admin.injuryConfig.preview.format', 'Format')}</label>
            <select id="injury-preview-format" value={previewFormat} onChange={(event) => setPreviewFormat(event.target.value)}>
              {previewFormats.map((key) => <option key={key} value={key}>{formatLabel(key)}</option>)}
              {!previewFormats.includes(previewFormat) && <option value={previewFormat}>{formatLabel(previewFormat)}</option>}
            </select>
          </div>
          <NumberField
            id="injury-preview-stamina"
            label={t('admin.injuryConfig.preview.stamina', 'Starting stamina')}
            value={previewStamina}
            max={Number.isFinite(form.maxStamina) ? form.maxStamina : undefined}
            onChange={setPreviewStamina}
          />
          <NumberField
            id="injury-preview-endurance"
            label={t('admin.injuryConfig.preview.endurance', 'Endurance')}
            value={previewEndurance}
            max={100}
            onChange={setPreviewEndurance}
          />
        </div>
        {preview ? (
          <dl className="injury-config__stats" data-testid="injury-preview">
            <div>
              <dt>{t('admin.injuryConfig.preview.drain', 'Drain')}</dt>
              <dd>{preview.drain}</dd>
            </div>
            <div>
              <dt>{t('admin.injuryConfig.preview.staminaAfter', 'Stamina after')}</dt>
              <dd>{preview.staminaAfter}</dd>
            </div>
            <div className="injury-config__stat-highlight">
              <dt>{t('admin.injuryConfig.preview.chance', 'Injury chance')}</dt>
              <dd>{formatPercent(preview.chance)}</dd>
            </div>
            <div>
              <dt>{t('admin.injuryConfig.preview.averageWeeks', 'Weeks out if injured')}</dt>
              <dd>{formatWeeks(preview.averageWeeks)}</dd>
            </div>
            <div>
              <dt>{t('admin.injuryConfig.preview.expectedWeeks', 'Expected weeks lost')}</dt>
              <dd>{formatWeeks(preview.expectedWeeksLost)}</dd>
            </div>
          </dl>
        ) : (
          <p className="ac-field__hint">
            {t('admin.injuryConfig.preview.incomplete', 'Fix the settings above and fill in every preview box to see the numbers.')}
          </p>
        )}
        {preview?.severityShifted && (
          <p className="ac-field__hint">
            {t('admin.injuryConfig.preview.shifted', 'This stamina is below the low-stamina shift, so an injury is more likely to be a bad one.')}
          </p>
        )}
      </Card>

      <Card className="ac-form">
        <div>
          <h2 className="ac-section__title">{t('admin.injuryConfig.exhaustion.title', 'Matches until exhausted')}</h2>
          <p className="ac-section__text">
            {exhaustion
              ? t(
                'admin.injuryConfig.exhaustion.description',
                'Standard singles matches from full stamina, with Endurance at the base of {{endurance}} ({{drain}} stamina a match) and no rest.',
                { endurance: ENDURANCE_BASELINE, drain: exhaustion.drain },
              )
              : t('admin.injuryConfig.preview.incomplete', 'Fix the settings above and fill in every preview box to see the numbers.')}
          </p>
        </div>
        {exhaustion && (
          <ul className="injury-config__exhaustion" data-testid="injury-exhaustion">
            {exhaustion.steps.map((step) => (
              <li key={step.belowStamina}>
                <span>
                  {step.chance === null
                    ? t('admin.injuryConfig.exhaustion.empty', 'Out of stamina')
                    : t('admin.injuryConfig.exhaustion.band', 'Below {{stamina}} stamina ({{chance}} band)', {
                      stamina: step.belowStamina,
                      chance: formatPercent(step.chance),
                    })}
                </span>
                <strong>
                  {step.matches === null
                    ? t('admin.injuryConfig.exhaustion.never', 'Never')
                    : t('admin.injuryConfig.exhaustion.matches', '{{count}} matches', { count: step.matches })}
                </strong>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="ac-form">
        <h2 className="ac-section__title">{t('admin.injuryConfig.history.title', 'Version history')}</h2>
        {history.length === 0 ? (
          <p className="ac-section__text">{t('admin.injuryConfig.history.empty', 'No saved versions yet.')}</p>
        ) : (
          <ol className="injury-config__history" data-testid="injury-history">
            {history.map((entry) => (
              <li key={entry.version}>
                {t('admin.injuryConfig.history.entry', 'Version {{version}}: {{user}}, {{date}}', {
                  version: entry.version,
                  user: entry.updatedBy ?? '?',
                  date: entry.updatedAt ? formatInstant(entry.updatedAt, i18n.language) : '?',
                })}
              </li>
            ))}
          </ol>
        )}
      </Card>

      {canEdit && (
        <div className="ac-actions">
          <Button onClick={handleSaveClick} loading={saving}>{t('admin.injuryConfig.save', 'Save Injury Settings')}</Button>
          <Button variant="ghost" onClick={handleDiscard} disabled={saving}>{t('admin.injuryConfig.discard', 'Discard changes')}</Button>
        </div>
      )}

      <Modal
        open={confirming}
        onClose={() => { if (!saving) setConfirming(false); }}
        title={t('admin.injuryConfig.confirm.title', 'Save injury settings?')}
        size="sm"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={saving}>{t('common.cancel', 'Cancel')}</Button>
            <Button onClick={() => void handleConfirmSave()} loading={saving}>{t('admin.injuryConfig.confirm.save', 'Save version {{version}}', { version: saved.version + 1 })}</Button>
          </>
        )}
      >
        <p>
          {t(
            'admin.injuryConfig.confirm.message',
            'New rolls will use version {{version}}. Injuries already rolled keep the version they used.',
            { version: saved.version + 1 },
          )}
        </p>
      </Modal>
    </div>
  );
}
