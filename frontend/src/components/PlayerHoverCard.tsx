import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Division, Player } from '../types';
import './PlayerHoverCard.css';

interface PlayerHoverCardProps {
  player: Player;
  divisions: Division[];
  children: ReactNode;
}

const RESULT_KEYS = {
  W: 'ui.formDots.win',
  L: 'ui.formDots.loss',
  D: 'ui.formDots.draw',
} as const;

/** Extra player details on hover or keyboard focus, kept out of the table columns. */
export default function PlayerHoverCard({ player, divisions, children }: PlayerHoverCardProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  const divisionName = divisions.find((division) => division.divisionId === player.divisionId)?.name;
  // recentForm is newest first.
  const lastResult = player.recentForm?.[0];

  const rows = [
    { label: t('standings.table.division'), value: divisionName },
    { label: t('standings.table.overall'), value: player.mainOverall },
    { label: t('standings.table.psn'), value: player.psnId },
    { label: t('standings.alignment.label'), value: player.alignment && t(`standings.alignment.${player.alignment}`) },
    { label: t('standings.lastResult'), value: lastResult && t(RESULT_KEYS[lastResult]) },
  ].filter((row) => row.value !== undefined && row.value !== '');

  return (
    <span
      className="player-hover-card-trigger"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && rows.length > 0 && (
        <span className="player-hover-card" role="tooltip">
          {rows.map((row) => (
            <span key={row.label} className="player-hover-card__row">
              <span className="player-hover-card__label">{row.label}</span>
              <span>{row.value}</span>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
