import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Rivalry } from '../../services/api/rivalries.api';
import './RivalryCard.css';

const INTENSITY_EMOJI: Record<string, string> = {
  'heating-up': '🔥',
  intense: '💥',
  historic: '👑',
};

interface RivalryCardProps {
  rivalry: Rivalry;
  featured?: boolean;
}

export default function RivalryCard({ rivalry, featured }: RivalryCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const { playerA, playerB, winsA, winsB, recentMatches, intensity, championshipAtStake } = rivalry;
  const total = winsA + winsB;
  const emoji = INTENSITY_EMOJI[intensity] ?? '🔥';
  const intensityKey = `rivalries.intensity.${intensity}` as const;

  const seriesText =
    winsA === winsB
      ? t('rivalries.seriesTied', { wins: winsA })
      : winsA > winsB
        ? t('rivalries.seriesLeads', {
            name: playerA.wrestlerName || playerA.name,
            wins: winsA,
            losses: winsB,
          })
        : t('rivalries.seriesLeads', {
            name: playerB.wrestlerName || playerB.name,
            wins: winsB,
            losses: winsA,
          });

  return (
    <article className={`rivalry-card ${featured ? 'rivalry-card--featured' : ''}`}>
      {featured && (
        <div className="rivalry-card__badge">{t('rivalries.rivalryOfTheWeek')}</div>
      )}
      <div className="rivalry-card__header">
        <div className="rivalry-card__players">
          <div className="rivalry-card__player">
            {playerA.imageUrl ? (
              <img src={playerA.imageUrl} alt="" className="rivalry-card__avatar" />
            ) : (
              <div className="rivalry-card__avatar rivalry-card__avatar--placeholder" />
            )}
            <span className="rivalry-card__name">{playerA.wrestlerName || playerA.name}</span>
          </div>
          <span className="rivalry-card__vs">{t('common.vs')}</span>
          <div className="rivalry-card__player">
            {playerB.imageUrl ? (
              <img src={playerB.imageUrl} alt="" className="rivalry-card__avatar" />
            ) : (
              <div className="rivalry-card__avatar rivalry-card__avatar--placeholder" />
            )}
            <span className="rivalry-card__name">{playerB.wrestlerName || playerB.name}</span>
          </div>
        </div>
        <div className="rivalry-card__intensity" title={t(intensityKey)}>
          {emoji} {t(intensityKey)}
        </div>
      </div>
      <p className="rivalry-card__series">{seriesText}</p>
      {championshipAtStake && (
        <p className="rivalry-card__championship">{t('rivalries.championshipAtStake')}</p>
      )}
      <div className="rivalry-card__recent">
        <button
          type="button"
          className="rivalry-card__toggle"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
        >
          {t('rivalries.recentMatches')} ({recentMatches.length})
        </button>
        {expanded && (
          <ul className="rivalry-card__matches">
            {recentMatches.map((m) => (
              <li key={m.matchId}>
                <span>
                  {new Date(m.date).toLocaleDateString()}
                  {m.championshipId ? ' 🏆' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rivalry-card__footer">
        <Link to="/stats/head-to-head" className="rivalry-card__link">
          {t('statistics.nav.headToHead')} →
        </Link>
      </div>
    </article>
  );
}
