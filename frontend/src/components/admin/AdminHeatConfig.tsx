import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { siteConfigApi, type RivalryHeatTunables } from '../../services/api/siteConfig.api';
import './AdminContenderConfig.css';

/**
 * Mirrors `DEFAULT_HEAT_TUNABLES` on the backend. Used as the initial
 * form state until the API responds, and as the "reset" target.
 */
const DEFAULTS: RivalryHeatTunables = {
  pivot: 2.5,
  maxWeight: 5,
  scoreCap: 100,
  motnMultiplier: 1.5,
  promoBase: 3,
  promoReactionStep: 1.4,
  promoBonusCap: 7,
  promoMaxReactionCount: 5,
};

interface FieldSpec {
  key: keyof RivalryHeatTunables;
  labelKey: string;
  labelFallback: string;
  hintKey: string;
  hintFallback: string;
  min: number;
  max: number;
  step: number;
}

const FIELDS: FieldSpec[] = [
  {
    key: 'pivot',
    labelKey: 'admin.heatConfig.pivot',
    labelFallback: 'Match rating pivot',
    hintKey: 'admin.heatConfig.pivotHint',
    hintFallback: 'Ratings above this value push heat positive; below pulls it negative. (0–5)',
    min: 0,
    max: 5,
    step: 0.5,
  },
  {
    key: 'maxWeight',
    labelKey: 'admin.heatConfig.maxWeight',
    labelFallback: 'Max match weight',
    hintKey: 'admin.heatConfig.maxWeightHint',
    hintFallback: 'Cap on how many ratings amplify a single match.',
    min: 1,
    max: 50,
    step: 1,
  },
  {
    key: 'scoreCap',
    labelKey: 'admin.heatConfig.scoreCap',
    labelFallback: 'Heat score cap (±)',
    hintKey: 'admin.heatConfig.scoreCapHint',
    hintFallback: 'Final heat score is clamped to ±this value.',
    min: 10,
    max: 500,
    step: 10,
  },
  {
    key: 'motnMultiplier',
    labelKey: 'admin.heatConfig.motnMultiplier',
    labelFallback: 'Match-of-the-Night multiplier',
    hintKey: 'admin.heatConfig.motnMultiplierHint',
    hintFallback: 'How much a MOTN match\'s contribution is multiplied.',
    min: 1,
    max: 5,
    step: 0.1,
  },
  {
    key: 'promoBase',
    labelKey: 'admin.heatConfig.promoBase',
    labelFallback: 'Promo base bonus',
    hintKey: 'admin.heatConfig.promoBaseHint',
    hintFallback: 'Heat added per call-out or rivalry promo (before reactions).',
    min: 0,
    max: 25,
    step: 0.5,
  },
  {
    key: 'promoReactionStep',
    labelKey: 'admin.heatConfig.promoReactionStep',
    labelFallback: 'Per-reaction step',
    hintKey: 'admin.heatConfig.promoReactionStepHint',
    hintFallback: 'Heat per fire reaction (subtracted per trash).',
    min: 0,
    max: 10,
    step: 0.1,
  },
  {
    key: 'promoBonusCap',
    labelKey: 'admin.heatConfig.promoBonusCap',
    labelFallback: 'Reaction bonus cap (±)',
    hintKey: 'admin.heatConfig.promoBonusCapHint',
    hintFallback: 'Max magnitude of the reaction bonus per promo.',
    min: 0,
    max: 50,
    step: 0.5,
  },
  {
    key: 'promoMaxReactionCount',
    labelKey: 'admin.heatConfig.promoMaxReactionCount',
    labelFallback: 'Reactions counted per type',
    hintKey: 'admin.heatConfig.promoMaxReactionCountHint',
    hintFallback: 'Only the first N fire / trash reactions affect the bonus.',
    min: 1,
    max: 50,
    step: 1,
  },
];

export default function AdminHeatConfig() {
  const { t } = useTranslation();
  const [tunables, setTunables] = useState<RivalryHeatTunables>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    siteConfigApi
      .getHeatTunables(controller.signal)
      .then((res) => setTunables(res.tunables))
      .catch(() => {
        // Fall through to DEFAULTS on load failure; admin can still save.
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const handleChange = (key: keyof RivalryHeatTunables, value: string) => {
    const num = parseFloat(value);
    if (Number.isNaN(num)) return;
    setTunables((prev) => ({ ...prev, [key]: num }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await siteConfigApi.updateHeatTunables(tunables);
      setTunables(res.tunables);
      setMessage({
        type: 'success',
        text: t('admin.heatConfig.savedMessage', 'Rivalry heat tunables saved. New rivalry writes will use these values.'),
      });
      setTimeout(() => setMessage(null), 5000);
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save heat tunables',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setTunables(DEFAULTS);
    setMessage(null);
  };

  if (loading) {
    return (
      <div className="admin-contender-config">
        <h3>{t('admin.heatConfig.title', 'Rivalry Heat Tunables')}</h3>
        <p>{t('common.loading', 'Loading...')}</p>
      </div>
    );
  }

  return (
    <div className="admin-contender-config">
      <h3>{t('admin.heatConfig.title', 'Rivalry Heat Tunables')}</h3>
      <p className="config-subtitle">
        {t(
          'admin.heatConfig.subtitle',
          'Tune the rivalry heat formula. Changes apply on the next rivalry write (match rating, promo create, manual recompute).',
        )}
      </p>

      <div className="config-fields">
        {FIELDS.map((field) => (
          <div className="config-field" key={field.key}>
            <label className="config-label" htmlFor={`heat-${field.key}`}>
              {t(field.labelKey, field.labelFallback)}
            </label>
            <input
              id={`heat-${field.key}`}
              type="number"
              className="config-input"
              value={tunables[field.key]}
              onChange={(e) => handleChange(field.key, e.target.value)}
              min={field.min}
              max={field.max}
              step={field.step}
            />
            <span className="config-hint">{t(field.hintKey, field.hintFallback)}</span>
          </div>
        ))}
      </div>

      <div className="config-actions">
        <button className="btn-recalculate" onClick={handleSave} disabled={saving}>
          {saving
            ? t('common.saving', 'Saving...')
            : t('admin.heatConfig.save', 'Save Heat Tunables')}
        </button>
        <button
          type="button"
          className="btn-recalculate"
          style={{ marginLeft: '0.5rem', background: '#374151' }}
          onClick={handleReset}
          disabled={saving}
        >
          {t('admin.heatConfig.reset', 'Reset to Defaults')}
        </button>
      </div>

      {message && (
        <div
          className={message.type === 'success' ? 'save-success-msg' : 'save-error-msg'}
          style={message.type === 'error' ? { color: '#f87171', marginTop: '0.5rem' } : { marginTop: '0.5rem' }}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
