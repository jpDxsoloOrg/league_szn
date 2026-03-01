import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Player } from '../types';
import type { Division } from '../types';
import './PlayerHoverCard.css';

interface PlayerHoverCardProps {
  player: Player;
  divisions: Division[];
  children: React.ReactNode;
}

export default function PlayerHoverCard({ player, divisions, children }: PlayerHoverCardProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  const divisionName = divisions.find((d) => d.divisionId === player.divisionId)?.name ?? null;
  const lastResult = player.recentForm?.[0];
  const truncatedBio = player.bio ? player.bio.substring(0, 100) + '...' : '';

  const handleMouseEnter = useCallback(() => setVisible(true), []);
  const handleMouseLeave = useCallback(() => setVisible(false), []);

  return (
    <span
      className="player-hover-card-trigger"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {visible && (
        <div className="player-hover-card" role="tooltip">
          {divisionName !== null && (
            <div className="player-hover-card-row">
              <span className="player-hover-card-label">{t('standings.table.division')}:</span>
              <span>{divisionName}</span>
            </div>
          )}
          {lastResult !== undefined && (
            <div className="player-hover-card-row">
              <span className="player-hover-card-label">{t('standings.lastResult')}:</span>
              <span>{lastResult === 'W' ? t('match.result.win') : lastResult === 'L' ? t('match.result.loss') : t('match.result.draw')}</span>
            </div>
          )}
          {player.bio && (
            <div className="player-hover-card-row">
              <span className="player-hover-card-label">{t('bio.preview')}:</span>
              <span>{truncatedBio}</span>
            </div>
          )}
        </div>
      )}
    </span>
  );
}