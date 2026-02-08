import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { fantasyApi } from '../../services/api';
import type { FantasyConfig as FantasyConfigType } from '../../types/fantasy';
import './FantasyConfig.css';

export default function FantasyConfig() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<FantasyConfigType | null>(null);
  const [originalConfig, setOriginalConfig] = useState<FantasyConfigType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const fetchConfig = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fantasyApi.getConfig(controller.signal);
        setConfig(data);
        setOriginalConfig(data);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load config');
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();

    return () => controller.abort();
  }, []);

  const handleChange = (field: keyof FantasyConfigType, value: number | boolean | string) => {
    if (!config) return;
    setConfig((prev) => prev ? ({ ...prev, [field]: value }) : prev);
    setHasChanges(true);
    setError(null);
    setSuccess(null);
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await fantasyApi.updateConfig(config);
      setConfig(updated);
      setOriginalConfig(updated);
      setSuccess(t('fantasy.admin.config.saveSuccess'));
      setHasChanges(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fantasy.admin.config.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (originalConfig) {
      setConfig({ ...originalConfig });
    }
    setHasChanges(false);
    setError(null);
    setSuccess(null);
  };

  if (loading) {
    return (
      <div className="fantasy-config">
        <div className="loading-state">
          <div className="spinner" />
          <p>{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="fantasy-config">
        <div className="error-state">
          <p>{error || 'Failed to load configuration'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fantasy-config">
      <header className="config-header">
        <h2>{t('fantasy.admin.config.title')}</h2>
        <p className="subtitle">{t('fantasy.admin.config.subtitle')}</p>
      </header>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success" role="alert">
          {success}
        </div>
      )}

      <div className="config-sections">
        {/* Default Settings */}
        <section className="config-section">
          <h3>{t('fantasy.admin.config.defaultSettings')}</h3>
          <div className="config-grid">
            <div className="config-field">
              <label htmlFor="defaultBudget">{t('fantasy.admin.config.defaultBudget')}</label>
              <input
                type="number"
                id="defaultBudget"
                value={config.defaultBudget}
                onChange={(e) => handleChange('defaultBudget', parseInt(e.target.value) || 0)}
                min="100"
              />
              <span className="hint">{t('fantasy.admin.config.defaultBudgetHint')}</span>
            </div>

            <div className="config-field">
              <label htmlFor="defaultPicksPerDivision">
                {t('fantasy.admin.config.defaultPicksPerDivision')}
              </label>
              <input
                type="number"
                id="defaultPicksPerDivision"
                value={config.defaultPicksPerDivision}
                onChange={(e) =>
                  handleChange('defaultPicksPerDivision', parseInt(e.target.value) || 1)
                }
                min="1"
                max="10"
              />
              <span className="hint">{t('fantasy.admin.config.defaultPicksHint')}</span>
            </div>
          </div>
        </section>

        {/* Points Settings */}
        <section className="config-section">
          <h3>{t('fantasy.admin.config.pointsSettings')}</h3>
          <div className="config-grid">
            <div className="config-field">
              <label htmlFor="baseWinPoints">{t('fantasy.admin.config.baseWinPoints')}</label>
              <input
                type="number"
                id="baseWinPoints"
                value={config.baseWinPoints}
                onChange={(e) => handleChange('baseWinPoints', parseInt(e.target.value) || 0)}
                min="1"
              />
              <span className="hint">{t('fantasy.admin.config.baseWinPointsHint')}</span>
            </div>

            <div className="config-field">
              <label htmlFor="championshipBonus">
                {t('fantasy.admin.config.championshipBonus')}
              </label>
              <input
                type="number"
                id="championshipBonus"
                value={config.championshipBonus}
                onChange={(e) => handleChange('championshipBonus', parseInt(e.target.value) || 0)}
                min="0"
              />
            </div>

            <div className="config-field">
              <label htmlFor="titleWinBonus">{t('fantasy.admin.config.titleWinBonus')}</label>
              <input
                type="number"
                id="titleWinBonus"
                value={config.titleWinBonus}
                onChange={(e) => handleChange('titleWinBonus', parseInt(e.target.value) || 0)}
                min="0"
              />
            </div>

            <div className="config-field">
              <label htmlFor="perfectPickBonus">
                {t('fantasy.admin.config.perfectPickBonus')}
              </label>
              <input
                type="number"
                id="perfectPickBonus"
                value={config.perfectPickBonus}
                onChange={(e) => handleChange('perfectPickBonus', parseInt(e.target.value) || 0)}
                min="0"
              />
              <span className="hint">{t('fantasy.admin.config.perfectPickBonusHint')}</span>
            </div>

            <div className="config-field">
              <label htmlFor="underdogMultiplier">
                {t('fantasy.admin.config.underdogMultiplier')}
              </label>
              <input
                type="number"
                id="underdogMultiplier"
                value={config.underdogMultiplier}
                onChange={(e) =>
                  handleChange('underdogMultiplier', parseFloat(e.target.value) || 1)
                }
                min="1"
                step="0.1"
              />
              <span className="hint">{t('fantasy.admin.config.underdogMultiplierHint')}</span>
            </div>
          </div>
        </section>

        {/* Streak Settings */}
        <section className="config-section">
          <h3>{t('fantasy.admin.config.streakSettings')}</h3>
          <div className="config-grid">
            <div className="config-field">
              <label htmlFor="streakBonusThreshold">
                {t('fantasy.admin.config.streakBonusThreshold')}
              </label>
              <input
                type="number"
                id="streakBonusThreshold"
                value={config.streakBonusThreshold}
                onChange={(e) =>
                  handleChange('streakBonusThreshold', parseInt(e.target.value) || 0)
                }
                min="1"
              />
              <span className="hint">{t('fantasy.admin.config.streakBonusThresholdHint')}</span>
            </div>

            <div className="config-field">
              <label htmlFor="streakBonusPoints">
                {t('fantasy.admin.config.streakBonusPoints')}
              </label>
              <input
                type="number"
                id="streakBonusPoints"
                value={config.streakBonusPoints}
                onChange={(e) =>
                  handleChange('streakBonusPoints', parseInt(e.target.value) || 0)
                }
                min="0"
              />
            </div>
          </div>
        </section>

        {/* Cost Fluctuation Settings */}
        <section className="config-section">
          <h3>{t('fantasy.admin.config.costFluctuationSettings')}</h3>

          <div className="config-toggle">
            <label htmlFor="costFluctuationEnabled">
              <input
                type="checkbox"
                id="costFluctuationEnabled"
                checked={config.costFluctuationEnabled}
                onChange={(e) => handleChange('costFluctuationEnabled', e.target.checked)}
              />
              <span>{t('fantasy.admin.config.enableCostFluctuation')}</span>
            </label>
          </div>

          {config.costFluctuationEnabled && (
            <div className="config-grid">
              <div className="config-field">
                <label htmlFor="costChangePerWin">
                  {t('fantasy.admin.config.costChangePerWin')}
                </label>
                <input
                  type="number"
                  id="costChangePerWin"
                  value={config.costChangePerWin}
                  onChange={(e) =>
                    handleChange('costChangePerWin', parseInt(e.target.value) || 0)
                  }
                  min="0"
                />
              </div>

              <div className="config-field">
                <label htmlFor="costChangePerLoss">
                  {t('fantasy.admin.config.costChangePerLoss')}
                </label>
                <input
                  type="number"
                  id="costChangePerLoss"
                  value={config.costChangePerLoss}
                  onChange={(e) =>
                    handleChange('costChangePerLoss', parseInt(e.target.value) || 0)
                  }
                  min="0"
                />
              </div>

              <div className="config-field">
                <label htmlFor="costResetStrategy">
                  {t('fantasy.admin.config.costResetStrategy')}
                </label>
                <select
                  id="costResetStrategy"
                  value={config.costResetStrategy}
                  onChange={(e) =>
                    handleChange(
                      'costResetStrategy',
                      e.target.value as 'reset' | 'carry_over' | 'partial'
                    )
                  }
                >
                  <option value="reset">{t('fantasy.admin.config.resetFull')}</option>
                  <option value="carry_over">{t('fantasy.admin.config.carryOver')}</option>
                  <option value="partial">{t('fantasy.admin.config.partial')}</option>
                </select>
                <span className="hint">{t('fantasy.admin.config.costResetStrategyHint')}</span>
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="config-actions">
        <button
          className="btn-reset"
          onClick={handleReset}
          disabled={saving || !hasChanges}
        >
          {t('fantasy.admin.config.reset')}
        </button>
        <button
          className="btn-save"
          onClick={handleSave}
          disabled={saving || !hasChanges}
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </div>
  );
}
