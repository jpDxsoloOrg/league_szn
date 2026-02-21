import { useTranslation } from 'react-i18next';
import type { ContenderWithPlayer } from '../../types/contender';
import {
  DEFAULT_WRESTLER_IMAGE,
  applyImageFallback,
  resolveImageSrc,
} from '../../constants/imageFallbacks';
import './ContenderCard.css';

interface ContenderCardProps {
  contender: ContenderWithPlayer;
}

export default function ContenderCard({ contender }: ContenderCardProps) {
  const { t } = useTranslation();

  const getMovementIndicator = () => {
    if (contender.isNew) {
      return <span className="movement-badge new">{t('contenders.new')}</span>;
    }
    if (contender.movement > 0) {
      return (
        <span className="movement-badge up">
          ▲ {contender.movement}
        </span>
      );
    }
    if (contender.movement < 0) {
      return (
        <span className="movement-badge down">
          ▼ {Math.abs(contender.movement)}
        </span>
      );
    }
    return <span className="movement-badge stable">—</span>;
  };

  const getStreakDisplay = () => {
    if (contender.currentStreak > 0) {
      return (
        <span className="streak positive">
          W{contender.currentStreak}
        </span>
      );
    }
    if (contender.currentStreak < 0) {
      return (
        <span className="streak negative">
          L{Math.abs(contender.currentStreak)}
        </span>
      );
    }
    return <span className="streak neutral">—</span>;
  };

  const isTopContender = contender.rank === 1;

  return (
    <div className={`contender-card ${isTopContender ? 'top-contender' : ''}`}>
      <div className="rank-section">
        <div className="rank-number">{contender.rank}</div>
        <div className="movement-indicator">{getMovementIndicator()}</div>
      </div>

      <div className="contender-image">
        <img
          src={resolveImageSrc(contender.imageUrl, DEFAULT_WRESTLER_IMAGE)}
          onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
          alt={contender.wrestlerName}
        />
      </div>

      <div className="contender-info">
        <h4 className="wrestler-name">{contender.wrestlerName}</h4>
        <p className="player-name">{contender.playerName}</p>
        <div className="contender-stats">
          <div className="stat">
            <span className="stat-label">{t('contenders.score')}</span>
            <span className="stat-value">{contender.rankingScore.toFixed(1)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">{t('contenders.winRate')}</span>
            <span className="stat-value">{contender.winPercentage.toFixed(1)}%</span>
          </div>
          <div className="stat">
            <span className="stat-label">{t('contenders.streak')}</span>
            <span className="stat-value">{getStreakDisplay()}</span>
          </div>
        </div>
      </div>

      {isTopContender && (
        <div className="top-contender-badge">
          {t('contenders.topContender')}
        </div>
      )}
    </div>
  );
}
