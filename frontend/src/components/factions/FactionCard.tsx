import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Player } from '../../types';
import type { Stable } from '../../types/stable';
import {
  DEFAULT_FACTION_IMAGE,
  DEFAULT_WRESTLER_IMAGE,
  resolveImageSrc,
  applyImageFallback,
} from '../../constants/imageFallbacks';
import './FactionCard.css';

const ROSTER_AVATAR_LIMIT = 6;
const HEAT_FLAME_COUNT = 5;

interface FactionCardProps {
  faction: Stable;
  playerById?: ReadonlyMap<string, Player>;
  /**
   * Optional streak from the standings call — used to derive the heat
   * gauge. We deliberately clamp to [0, HEAT_FLAME_COUNT] regardless of
   * streak type (W/L/D) so every consumer reads heat the same way.
   * When standings hasn't loaded yet (or doesn't include this faction),
   * the gauge shows zero lit flames.
   */
  currentStreak?: { type: 'W' | 'L' | 'D'; count: number };
}

function clampHeat(count: number | undefined): number {
  if (!count || count < 0) return 0;
  return Math.min(HEAT_FLAME_COUNT, Math.floor(count));
}

function FlameIcon({ lit }: { lit: boolean }) {
  // Pure presentational SVG — no per-flame aria, the parent provides one label.
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 16 16"
      className={`faction-card__flame ${lit ? 'faction-card__flame--lit' : 'faction-card__flame--dim'}`}
    >
      <path
        d="M8 .5s2.5 3 2.5 5.5a2.5 2.5 0 0 1-1 2 1.5 1.5 0 0 0 1.5-2.5C12.5 7 14 9 14 11a6 6 0 1 1-12 0c0-2.5 2-4.5 2-7 0 2 2 3 4 3.5 0-2-1-3-1-4.5 0-1 1-2.5 1-2.5z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function FactionCard({ faction, playerById, currentStreak }: FactionCardProps) {
  const { t } = useTranslation();

  const totalMatches = faction.wins + faction.losses + faction.draws;
  const winPercentage = totalMatches > 0
    ? `${((faction.wins / totalMatches) * 100).toFixed(1)}%`
    : '—';

  const leader = playerById?.get(faction.leaderId);
  const leaderName = leader?.name ?? t('factions.unknownLeader', 'Unknown');

  const rosterIds = faction.memberIds.slice(0, ROSTER_AVATAR_LIMIT);
  const extraMembers = Math.max(0, faction.memberIds.length - ROSTER_AVATAR_LIMIT);

  const litHeat = clampHeat(currentStreak?.count);
  const heatLabel = t('factions.hub.heatLabel', 'Heat: {{lit}} of {{total}}', {
    lit: litHeat,
    total: HEAT_FLAME_COUNT,
  });

  const statusLabel = t(`factions.hub.status.${faction.status}`, faction.status);

  return (
    <Link
      to={`/factions/${faction.stableId}`}
      className="faction-card"
      aria-label={faction.name}
    >
      <div className="faction-card__hero">
        <img
          src={resolveImageSrc(faction.imageUrl, DEFAULT_FACTION_IMAGE)}
          onError={(event) => applyImageFallback(event, DEFAULT_FACTION_IMAGE)}
          alt=""
          className="faction-card__hero-image"
        />
        <div className="faction-card__hero-overlay" aria-hidden="true" />
        <span
          className={`faction-card__status faction-card__status--${faction.status}`}
        >
          {statusLabel}
        </span>
        <h3 className="faction-card__name">{faction.name}</h3>
      </div>

      <div className="faction-card__body">
        <div className="faction-card__leader">
          <img
            src={resolveImageSrc(leader?.imageUrl, DEFAULT_WRESTLER_IMAGE)}
            onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
            alt=""
            className="faction-card__leader-avatar"
          />
          <span className="faction-card__leader-text">
            {t('factions.hub.ledBy', 'Led by {{name}}', { name: leaderName })}
          </span>
        </div>

        <div
          className="faction-card__roster"
          aria-label={t('factions.hub.rosterLabel', 'Roster of {{count}} members', {
            count: faction.memberIds.length,
          })}
        >
          {rosterIds.map((playerId) => {
            const member = playerById?.get(playerId);
            return (
              <img
                key={playerId}
                src={resolveImageSrc(member?.imageUrl, DEFAULT_WRESTLER_IMAGE)}
                onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
                alt=""
                className="faction-card__roster-avatar"
              />
            );
          })}
          {extraMembers > 0 && (
            <span className="faction-card__roster-extra" aria-hidden="true">
              +{extraMembers}
            </span>
          )}
        </div>

        <div className="faction-card__stats">
          <div className="faction-card__stat">
            <span className="faction-card__stat-label">{t('factions.hub.statWins', 'WINS')}</span>
            <strong className="faction-card__stat-value">{faction.wins}</strong>
          </div>
          <div className="faction-card__stat">
            <span className="faction-card__stat-label">{t('factions.hub.statLosses', 'LOSSES')}</span>
            <strong className="faction-card__stat-value">{faction.losses}</strong>
          </div>
          <div className="faction-card__stat">
            <span className="faction-card__stat-label">{t('factions.hub.statDraws', 'DRAWS')}</span>
            <strong className="faction-card__stat-value">{faction.draws}</strong>
          </div>
          <div className="faction-card__stat">
            <span className="faction-card__stat-label">{t('factions.hub.statWinPct', 'WIN%')}</span>
            <strong className="faction-card__stat-value">{winPercentage}</strong>
          </div>
        </div>

        <div className="faction-card__heat" role="img" aria-label={heatLabel}>
          {Array.from({ length: HEAT_FLAME_COUNT }, (_, i) => (
            <FlameIcon key={i} lit={i < litHeat} />
          ))}
        </div>
      </div>
    </Link>
  );
}
