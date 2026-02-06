import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Championship } from '../../types';
import type { ContenderConfig } from '../../types/contender';
import { championshipsApi, contendersApi } from '../../services/api';
import './AdminContenderConfig.css';

const defaultConfig = (championshipId: string): ContenderConfig => ({
  championshipId,
  rankingPeriodDays: 90,
  minimumMatches: 5,
  maxContenders: 8,
  includeDraws: false,
  divisionRestricted: true,
});

export default function AdminContenderConfig() {
  const { t } = useTranslation();
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [selectedChampionshipId, setSelectedChampionshipId] = useState('');
  const [config, setConfig] = useState<ContenderConfig>(defaultConfig(''));
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    championshipsApi
      .getAll()
      .then((data) => {
        setChampionships(data);
        if (data.length > 0 && data[0]) {
          setSelectedChampionshipId(data[0].championshipId);
          setConfig(defaultConfig(data[0].championshipId));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleChampionshipChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const championshipId = e.target.value;
    setSelectedChampionshipId(championshipId);
    setConfig(defaultConfig(championshipId));
  };

  const handleNumberChange = (field: keyof ContenderConfig, value: string) => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue)) {
      setConfig((prev) => ({ ...prev, [field]: numValue }));
    }
  };

  const handleCheckboxChange = (field: keyof ContenderConfig) => {
    setConfig((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const handleRecalculate = async () => {
    try {
      setRecalculating(true);
      setMessage(null);
      const result = await contendersApi.recalculate(selectedChampionshipId || undefined);
      setMessage({ type: 'success', text: result.message });
      setTimeout(() => setMessage(null), 5000);
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to recalculate rankings',
      });
    } finally {
      setRecalculating(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-contender-config">
        <h3>{t('contenders.admin.title')}</h3>
        <p>{t('common.loading', 'Loading...')}</p>
      </div>
    );
  }

  if (championships.length === 0) {
    return (
      <div className="admin-contender-config">
        <h3>{t('contenders.admin.title')}</h3>
        <p>{t('contenders.admin.noChampionships', 'No championships found. Create championships first.')}</p>
      </div>
    );
  }

  return (
    <div className="admin-contender-config">
      <h3>{t('contenders.admin.title')}</h3>
      <p className="config-subtitle">{t('contenders.admin.subtitle')}</p>

      {/* Championship Selector */}
      <div className="config-section">
        <label className="config-label" htmlFor="championship-select">
          {t('contenders.admin.selectChampionship')}
        </label>
        <select
          id="championship-select"
          className="config-select"
          value={selectedChampionshipId}
          onChange={handleChampionshipChange}
        >
          {championships.map((c) => (
            <option key={c.championshipId} value={c.championshipId}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Configuration Fields */}
      <div className="config-fields">
        <div className="config-field">
          <label className="config-label" htmlFor="ranking-period">
            {t('contenders.admin.rankingPeriodDays')}
          </label>
          <input
            id="ranking-period"
            type="number"
            className="config-input"
            value={config.rankingPeriodDays}
            onChange={(e) => handleNumberChange('rankingPeriodDays', e.target.value)}
            min={7}
            max={365}
          />
          <span className="config-hint">{t('contenders.admin.rankingPeriodHint')}</span>
        </div>

        <div className="config-field">
          <label className="config-label" htmlFor="minimum-matches">
            {t('contenders.admin.minimumMatches')}
          </label>
          <input
            id="minimum-matches"
            type="number"
            className="config-input"
            value={config.minimumMatches}
            onChange={(e) => handleNumberChange('minimumMatches', e.target.value)}
            min={1}
            max={50}
          />
          <span className="config-hint">{t('contenders.admin.minimumMatchesHint')}</span>
        </div>

        <div className="config-field">
          <label className="config-label" htmlFor="max-contenders">
            {t('contenders.admin.maxContenders')}
          </label>
          <input
            id="max-contenders"
            type="number"
            className="config-input"
            value={config.maxContenders}
            onChange={(e) => handleNumberChange('maxContenders', e.target.value)}
            min={1}
            max={20}
          />
          <span className="config-hint">{t('contenders.admin.maxContendersHint')}</span>
        </div>

        <div className="config-field checkbox-field">
          <label className="config-checkbox-label">
            <input
              type="checkbox"
              checked={config.includeDraws}
              onChange={() => handleCheckboxChange('includeDraws')}
            />
            <span>{t('contenders.admin.includeDraws')}</span>
          </label>
          <span className="config-hint">{t('contenders.admin.includeDrawsHint')}</span>
        </div>

        <div className="config-field checkbox-field">
          <label className="config-checkbox-label">
            <input
              type="checkbox"
              checked={config.divisionRestricted}
              onChange={() => handleCheckboxChange('divisionRestricted')}
            />
            <span>{t('contenders.admin.divisionRestricted')}</span>
          </label>
          <span className="config-hint">{t('contenders.admin.divisionRestrictedHint')}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="config-actions">
        <button className="btn-recalculate" onClick={handleRecalculate} disabled={recalculating}>
          {recalculating
            ? t('common.processing', 'Processing...')
            : t('contenders.admin.recalculate')}
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
