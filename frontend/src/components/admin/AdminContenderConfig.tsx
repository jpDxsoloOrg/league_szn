import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  mockContenderConfigs,
  mockChampionshipContenders,
} from '../../mocks/contenderMockData';
import type { ContenderConfig } from '../../types/contender';
import './AdminContenderConfig.css';

export default function AdminContenderConfig() {
  const { t } = useTranslation();
  const [selectedChampionshipId, setSelectedChampionshipId] = useState(
    mockContenderConfigs[0].championshipId
  );

  const getConfigForChampionship = (championshipId: string): ContenderConfig => {
    const found = mockContenderConfigs.find((c) => c.championshipId === championshipId);
    return (
      found ?? {
        championshipId,
        rankingPeriodDays: 90,
        minimumMatches: 5,
        maxContenders: 8,
        includeDraws: false,
        divisionRestricted: true,
      }
    );
  };

  const [config, setConfig] = useState<ContenderConfig>(
    getConfigForChampionship(selectedChampionshipId)
  );

  const handleChampionshipChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const championshipId = e.target.value;
    setSelectedChampionshipId(championshipId);
    setConfig(getConfigForChampionship(championshipId));
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

  const handleSave = () => {
    alert(
      t('contenders.admin.saveSuccess', {
        championship: getChampionshipName(selectedChampionshipId),
      })
    );
  };

  const handleRecalculate = () => {
    alert(
      t('contenders.admin.recalculateSuccess', {
        championship: getChampionshipName(selectedChampionshipId),
      })
    );
  };

  const getChampionshipName = (championshipId: string): string => {
    const championship = mockChampionshipContenders.find(
      (c) => c.championshipId === championshipId
    );
    return championship?.championshipName ?? championshipId;
  };

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
          {mockChampionshipContenders.map((c) => (
            <option key={c.championshipId} value={c.championshipId}>
              {c.championshipName}
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
        <button className="btn-save" onClick={handleSave}>
          {t('contenders.admin.save')}
        </button>
        <button className="btn-recalculate" onClick={handleRecalculate}>
          {t('contenders.admin.recalculate')}
        </button>
      </div>
    </div>
  );
}
