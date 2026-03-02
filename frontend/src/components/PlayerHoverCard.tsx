import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Player } from '../types';
import type { Division } from '../types';
import './PlayerHoverCard.css';

interface PlayerHoverCardProps {
  player: Player;
  divisions: Division[];
  children: React.ReactNode;
}

const RESULT_MAP = {
  'W': 'W',
  'L': 'L',
  'D': 'D'
} as const;

export default function PlayerHoverCard({ player, divisions, children }: PlayerHoverCardProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  const divisionName = divisions.find((d) => d.divisionId === player.divisionId)?.name ?? null;
  const lastResult = player.recentForm?.[0];

  const truncatedBio = useMemo(() => {
    if (!player.bio) return null;
    const maxLength = 80;
    if (player.bio.length <= maxLength) return player.bio;
    return player.bio.slice(0, maxLength).trim() + '...';
  }, [player.bio]);

  const handleMouseEnter = useCallback(() => setVisible(true), []);
  const handleMouseLeave = useCallback(() => setVisible(false), []);

  return (
    <span
      className="player-hover-card-trigger"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      aria-describedby={visible ? `player-hover-${player.playerId}` : undefined}
    >
      {children}
      {visible && (
        <div 
          className="player-hover-card" 
          role="tooltip"
          id={`player-hover-${player.playerId}`}
          aria-live="polite"
        >
          {divisionName !== null && (
            <div className="player-hover-card-row">
              <span className="player-hover-card-label">{t('standings.table.division')}:</span>
              <span>{divisionName}</span>
            </div>
          )}
          {lastResult !== undefined && (
            <div className="player-hover-card-row">
              <span className="player-hover-card-label">{t('standings.lastResult')}:</span>
              <span>{RESULT_MAP[lastResult as keyof typeof RESULT_MAP] || lastResult}</span>
            </div>
          )}
          {truncatedBio && (
            <div className="player-hover-card-bio">
              {truncatedBio}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
