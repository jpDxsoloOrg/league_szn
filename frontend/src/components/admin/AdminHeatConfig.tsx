import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { siteConfigApi, type RivalryHeatTunables } from '../../services/api/siteConfig.api';
import Button from '../ui/Button';
import Card from '../ui/Card';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import AdminNotice from './AdminNotice';
import './adminContent.css';

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
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const result = await siteConfigApi.getHeatTunables(controller.signal);
        setTunables(result.tunables);
      } catch {
        // The defaults stay on screen and can still be saved, so say so.
        if (!controller.signal.aborted) setLoadFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, []);

  const handleChange = (key: keyof RivalryHeatTunables, value: string) => {
    const parsed = parseFloat(value);
    if (Number.isNaN(parsed)) return;
    setTunables((previous) => ({ ...previous, [key]: parsed }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await siteConfigApi.updateHeatTunables(tunables);
      setTunables(result.tunables);
      setLoadFailed(false);
      setMessage({
        type: 'success',
        text: t('admin.heatConfig.savedMessage', 'Rivalry heat tunables saved. New rivalry writes will use these values.'),
      });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : t('adminContent.heat.saveFailed', 'Failed to save heat tunables'),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setTunables(DEFAULTS);
    setMessage(null);
  };

  const title = t('admin.heatConfig.title', 'Rivalry Heat Tunables');

  if (loading) {
    return (
      <div className="ac-page">
        <PageHeader title={title} />
        <Skeleton variant="block" count={3} />
      </div>
    );
  }

  return (
    <div className="ac-page">
      <PageHeader
        title={title}
        subtitle={t(
          'admin.heatConfig.subtitle',
          'Tune the rivalry heat formula. Changes apply on the next rivalry write (match rating, promo create, manual recompute).',
        )}
      />

      {loadFailed && (
        <AdminNotice tone="error">
          {t('adminContent.heat.loadFailed', 'Could not load the saved values. The defaults are shown below.')}
        </AdminNotice>
      )}
      {message && <AdminNotice tone={message.type}>{message.text}</AdminNotice>}

      <Card className="ac-form">
        <div className="ac-form__row">
          {FIELDS.map((field) => (
            <div className="ac-field" key={field.key}>
              <label className="ac-field__label" htmlFor={`heat-${field.key}`}>{t(field.labelKey, field.labelFallback)}</label>
              <input
                id={`heat-${field.key}`}
                type="number"
                value={tunables[field.key]}
                onChange={(event) => handleChange(field.key, event.target.value)}
                min={field.min}
                max={field.max}
                step={field.step}
              />
              <p className="ac-field__hint">{t(field.hintKey, field.hintFallback)}</p>
            </div>
          ))}
        </div>

        <div className="ac-actions">
          <Button onClick={handleSave} loading={saving}>{t('admin.heatConfig.save', 'Save Heat Tunables')}</Button>
          <Button variant="ghost" onClick={handleReset} disabled={saving}>{t('admin.heatConfig.reset', 'Reset to Defaults')}</Button>
        </div>
      </Card>
    </div>
  );
}
