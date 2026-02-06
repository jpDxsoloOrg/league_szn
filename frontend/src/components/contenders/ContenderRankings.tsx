import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mockChampionshipContenders } from '../../mocks/contenderMockData';
import ContenderCard from './ContenderCard';
import './ContenderRankings.css';

export default function ContenderRankings() {
  const { t } = useTranslation();
  const [selectedChampionship, setSelectedChampionship] = useState(
    mockChampionshipContenders[0].championshipId
  );

  const currentChampionship = mockChampionshipContenders.find(
    (c) => c.championshipId === selectedChampionship
  );

  if (!currentChampionship) {
    return (
      <div className="contender-rankings">
        <div className="error-message">{t('contenders.noData')}</div>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
  };

  return (
    <div className="contender-rankings">
      <header className="rankings-header">
        <h2>{t('contenders.title')}</h2>
        <p className="subtitle">{t('contenders.subtitle')}</p>
      </header>

      {/* Championship Selector Tabs */}
      <div className="championship-tabs">
        {mockChampionshipContenders.map((championship) => (
          <button
            key={championship.championshipId}
            className={`tab ${
              selectedChampionship === championship.championshipId ? 'active' : ''
            }`}
            onClick={() => setSelectedChampionship(championship.championshipId)}
          >
            {championship.championshipName}
          </button>
        ))}
      </div>

      {/* Current Champion Section */}
      <section className="current-champion-section">
        <h3>{t('contenders.currentChampion')}</h3>
        <div className="champion-card">
          <div className="champion-badge">
            <span className="trophy-icon">🏆</span>
          </div>
          <div className="champion-image">
            {currentChampionship.currentChampion.imageUrl ? (
              <img
                src={currentChampionship.currentChampion.imageUrl}
                alt={currentChampionship.currentChampion.wrestlerName}
              />
            ) : (
              <div className="placeholder-image">
                {currentChampionship.currentChampion.wrestlerName.charAt(0)}
              </div>
            )}
          </div>
          <div className="champion-info">
            <h4 className="champion-wrestler-name">
              {currentChampionship.currentChampion.wrestlerName}
            </h4>
            <p className="champion-player-name">
              {currentChampionship.currentChampion.playerName}
            </p>
          </div>
        </div>
      </section>

      {/* Contenders List */}
      <section className="contenders-section">
        <h3>{t('contenders.rankings')}</h3>
        <div className="contenders-list">
          {currentChampionship.contenders.length === 0 ? (
            <div className="empty-state">
              <p>{t('contenders.noContenders')}</p>
              <span className="hint">
                {t('contenders.noContendersHint', {
                  minMatches: currentChampionship.config.minimumMatches,
                })}
              </span>
            </div>
          ) : (
            currentChampionship.contenders.map((contender) => (
              <ContenderCard key={contender.playerId} contender={contender} />
            ))
          )}
        </div>
      </section>

      {/* Last Calculated */}
      <footer className="rankings-footer">
        <p className="last-calculated">
          {t('contenders.lastCalculated')}: {formatDate(currentChampionship.calculatedAt)}
        </p>
        <div className="config-info">
          <span>
            {t('contenders.rankingPeriod')}: {currentChampionship.config.rankingPeriodDays}{' '}
            {t('contenders.days')}
          </span>
          <span className="separator">•</span>
          <span>
            {t('contenders.minMatches')}: {currentChampionship.config.minimumMatches}
          </span>
          <span className="separator">•</span>
          <span>
            {t('contenders.maxContenders')}: {currentChampionship.config.maxContenders}
          </span>
        </div>
      </footer>
    </div>
  );
}
