import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mockPlayerContenderStatus } from '../../mocks/contenderMockData';
import './MyContenderStatus.css';

export default function MyContenderStatus() {
  const { t } = useTranslation();
  const [playerStatus] = useState(mockPlayerContenderStatus);

  const getEligibilityBadge = (isEligible: boolean) => {
    if (isEligible) {
      return <span className="eligibility-badge eligible">{t('contenders.eligible')}</span>;
    }
    return <span className="eligibility-badge not-eligible">{t('contenders.notEligible')}</span>;
  };

  const getProgressPercentage = (rank: number, maxRank: number = 8) => {
    if (rank === 0) return 0;
    return ((maxRank - rank + 1) / maxRank) * 100;
  };

  return (
    <div className="my-contender-status">
      <header className="status-header">
        <h2>{t('contenders.myStatus.title')}</h2>
        <p className="subtitle">
          {t('contenders.myStatus.subtitle', { playerName: playerStatus.playerName })}
        </p>
      </header>

      <div className="championships-status">
        {playerStatus.championships.map((championship) => (
          <div key={championship.championshipId} className="championship-status-card">
            <div className="card-header">
              <h3>{championship.championshipName}</h3>
              {getEligibilityBadge(championship.isEligible)}
            </div>

            {championship.isEligible ? (
              <>
                {/* Ranking Display */}
                <div className="ranking-display">
                  <div className="rank-circle">
                    <span className="rank-number">#{championship.rank}</span>
                  </div>
                  <div className="ranking-info">
                    <div className="info-row">
                      <span className="label">{t('contenders.currentRank')}</span>
                      <span className="value">#{championship.rank}</span>
                    </div>
                    <div className="info-row">
                      <span className="label">{t('contenders.rankingScore')}</span>
                      <span className="value score">{championship.rankingScore.toFixed(1)}</span>
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="progress-section">
                  <div className="progress-header">
                    <span className="progress-label">{t('contenders.myStatus.progressToTop')}</span>
                    <span className="progress-value">
                      {getProgressPercentage(championship.rank).toFixed(0)}%
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${getProgressPercentage(championship.rank)}%` }}
                    />
                  </div>
                </div>

                {/* Path to Title */}
                <div className="path-to-title">
                  <h4>{t('contenders.myStatus.pathToTitle')}</h4>
                  <p>{championship.pathToTitle}</p>
                </div>
              </>
            ) : (
              <>
                {/* Not Eligible Display */}
                <div className="not-eligible-display">
                  <div className="matches-needed">
                    <div className="matches-circle">
                      <span className="matches-number">{championship.matchesNeeded}</span>
                    </div>
                    <div className="matches-info">
                      <span className="matches-label">
                        {t('contenders.myStatus.matchesNeeded')}
                      </span>
                      <span className="matches-hint">{championship.pathToTitle}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Summary Stats */}
      <div className="summary-stats">
        <div className="stat-card">
          <span className="stat-value">
            {playerStatus.championships.filter((c) => c.isEligible).length}
          </span>
          <span className="stat-label">{t('contenders.myStatus.eligibleChampionships')}</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">
            {playerStatus.championships.filter((c) => c.rank === 1).length}
          </span>
          <span className="stat-label">{t('contenders.myStatus.topContenderPositions')}</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">
            {playerStatus.championships
              .filter((c) => c.isEligible && c.rank <= 3)
              .length}
          </span>
          <span className="stat-label">{t('contenders.myStatus.topThreePositions')}</span>
        </div>
      </div>
    </div>
  );
}
