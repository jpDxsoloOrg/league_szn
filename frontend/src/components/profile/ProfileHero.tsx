import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';
import type { BadgeTone } from '../ui/Badge';
import FormDots from '../ui/FormDots';
import type { FormResult } from '../ui/FormDots';
import type { TileAccent } from '../ui/PhotoTile';
import type { Player } from '../../types';
import { isNeedsWrestler } from '../../utils/needsWrestler';

const ALIGNMENT_TONES: Record<NonNullable<Player['alignment']>, BadgeTone> = {
  face: 'primary',
  heel: 'pink',
  neutral: 'neutral',
};

export interface ProfileHeroTitle {
  id: string;
  name: string;
  accent: TileAccent;
}

/** What turns the hero into a wrestler card on a public profile. */
export interface ProfileHeroCard {
  overall?: number;
  titles: ProfileHeroTitle[];
  /** Oldest to newest. */
  form: FormResult[];
  streak?: { type: FormResult; count: number };
}

interface ProfileHeroProps {
  player: Player;
  /** Division, stable and similar lines, already resolved to names. */
  details?: Array<{ label: string; value: string }>;
  actions?: ReactNode;
  card?: ProfileHeroCard;
}

/** Top of a player's page, with the page's only h1. */
export default function ProfileHero({ player, details = [], actions, card }: ProfileHeroProps) {
  const { t } = useTranslation();
  const hasWrestler = !isNeedsWrestler(player.currentWrestler);
  const lines = [...details];
  if (player.alternateWrestler) {
    lines.unshift({ label: t('publicProfile.alternateWrestler'), value: player.alternateWrestler });
  }
  if (player.psnId) {
    lines.push({ label: t('publicProfile.psnId'), value: player.psnId });
  }

  return (
    <header className={`profile-hero${card ? ' profile-hero--card' : ''}`}>
      <div className="profile-hero__portrait">
        <Avatar src={player.imageUrl} name={player.name} size="xl" ring={card?.titles.length ? 'gold' : 'violet'} />
        {card?.overall !== undefined && (
          <p className="profile-hero__overall">
            <span className="profile-hero__overall-value">{card.overall}</span>
            <span>{t('publicProfile.overall')}</span>
          </p>
        )}
      </div>
      <div className="profile-hero__text">
        {card && card.titles.length > 0 && (
          <ul className="profile-hero__titles" aria-label={t('publicProfile.titlesHeld')}>
            {card.titles.map((title) => (
              <li key={title.id} className={`profile-hero__title profile-hero__title--${title.accent}`}>{title.name}</li>
            ))}
          </ul>
        )}
        {card && hasWrestler ? (
          <>
            <h1 className="profile-hero__name">{player.currentWrestler}</h1>
            <p className="profile-hero__wrestler">{t('publicProfile.playedBy', { name: player.name })}</p>
          </>
        ) : (
          <>
            <h1 className="profile-hero__name">{player.name}</h1>
            {hasWrestler && (
              <p className="profile-hero__wrestler">
                {t('publicProfile.playingAs')} {player.currentWrestler}
              </p>
            )}
          </>
        )}
        {player.alignment && (
          <Badge tone={ALIGNMENT_TONES[player.alignment]}>{t(`profile.mobile.${player.alignment}`)}</Badge>
        )}
        {lines.length > 0 && (
          <dl className="profile-hero__details">
            {lines.map((line) => (
              <div key={line.label}>
                <dt>{line.label}</dt>
                <dd>{line.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {card && (card.form.length > 0 || card.streak) && (
          <div className="profile-hero__form">
            {card.form.length > 0 && <FormDots results={card.form} />}
            {card.streak && (
              <span>{t('publicProfile.streakValue', { count: card.streak.count, type: card.streak.type })}</span>
            )}
          </div>
        )}
      </div>
      {actions && <div className="profile-hero__actions">{actions}</div>}
    </header>
  );
}
