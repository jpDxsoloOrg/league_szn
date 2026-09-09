import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CommentaryParticipant } from '../../types/event';
import {
  DEFAULT_WRESTLER_IMAGE,
  applyImageFallback,
  resolveImageSrc,
} from '../../constants/imageFallbacks';
import MoveList from '../profile/MoveList';
import { formatRecord } from '../../utils/commentary';
import './CommentaryWrestlerCard.css';

export interface CommentaryWrestlerCardProps {
  participant: CommentaryParticipant;
  /** Denser layout used when five or six wrestlers share the screen. */
  compact?: boolean;
  /** Shown as a small tag when the match has teams. */
  teamLabel?: string;
  /** Index into the team colour palette; undefined when there are no teams. */
  teamIndex?: number;
}

const BIO_CLAMP = 140;

export default function CommentaryWrestlerCard({
  participant,
  compact = false,
  teamLabel,
  teamIndex,
}: CommentaryWrestlerCardProps) {
  const { t } = useTranslation();
  const [bioExpanded, setBioExpanded] = useState(false);

  const hasMoves = participant.signatures.length > 0 || participant.finishers.length > 0;
  const bio = participant.bio?.trim() ?? '';
  const clampBio = compact && bio.length > BIO_CLAMP && !bioExpanded;
  const shownBio = clampBio ? `${bio.slice(0, BIO_CLAMP).trimEnd()}…` : bio;

  const classes = [
    'commentary-card',
    compact ? 'commentary-card--compact' : '',
    teamIndex !== undefined ? `commentary-card--team-${teamIndex % 4}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={classes} id={`commentary-${participant.playerId}`}>
      <header className="commentary-card-header">
        <img
          src={resolveImageSrc(participant.imageUrl, DEFAULT_WRESTLER_IMAGE)}
          onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
          alt={participant.wrestlerName}
          className="commentary-card-portrait"
        />
        <div className="commentary-card-identity">
          {teamLabel && <span className="commentary-card-team">{teamLabel}</span>}
          <h2 className="commentary-card-name">{participant.wrestlerName}</h2>
          <p className="commentary-card-player">
            {t('events.commentary.playedBy', { name: participant.playerName })}
          </p>
          <div className="commentary-card-tags">
            {participant.alignment && (
              <span className={`commentary-card-alignment commentary-card-alignment--${participant.alignment}`}>
                {participant.alignment}
              </span>
            )}
            {participant.divisionName && (
              <span className="commentary-card-division">{participant.divisionName}</span>
            )}
          </div>
        </div>
      </header>

      <dl className="commentary-card-records">
        {participant.seasonRecord && (
          <div className="commentary-card-record">
            <dt>{t('events.commentary.seasonRecord')}</dt>
            <dd>{formatRecord(participant.seasonRecord)}</dd>
          </div>
        )}
        <div className="commentary-card-record">
          <dt>{t('events.commentary.allTime')}</dt>
          <dd>{formatRecord(participant.allTimeRecord)}</dd>
        </div>
        <div className="commentary-card-record">
          <dt>{t('events.commentary.multiMan')}</dt>
          <dd>{formatRecord(participant.multiManRecord)}</dd>
        </div>
      </dl>

      {hasMoves ? (
        <div className="commentary-card-moves">
          <MoveList title={t('profile.moves.signatures')} moves={participant.signatures} />
          <MoveList title={t('profile.moves.finishers')} moves={participant.finishers} />
        </div>
      ) : (
        <p className="commentary-card-empty">{t('events.commentary.noMoves')}</p>
      )}

      {bio ? (
        <p className="commentary-card-bio">
          {shownBio}
          {compact && bio.length > BIO_CLAMP && (
            <button
              type="button"
              className="commentary-card-bio-toggle"
              onClick={() => setBioExpanded((v) => !v)}
            >
              {bioExpanded ? t('events.commentary.less') : t('events.commentary.more')}
            </button>
          )}
        </p>
      ) : (
        <p className="commentary-card-bio commentary-card-empty">{t('events.commentary.noBio')}</p>
      )}
    </article>
  );
}
