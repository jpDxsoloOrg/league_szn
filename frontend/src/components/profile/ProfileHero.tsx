import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';
import type { BadgeTone } from '../ui/Badge';
import type { Player } from '../../types';
import { isNeedsWrestler } from '../../utils/needsWrestler';

const ALIGNMENT_TONES: Record<NonNullable<Player['alignment']>, BadgeTone> = {
  face: 'primary',
  heel: 'pink',
  neutral: 'neutral',
};

interface ProfileHeroProps {
  player: Player;
  /** Division, stable and similar lines, already resolved to names. */
  details?: Array<{ label: string; value: string }>;
  actions?: ReactNode;
}

/** Top of a player's page, with the page's only h1. */
export default function ProfileHero({ player, details = [], actions }: ProfileHeroProps) {
  const { t } = useTranslation();
  const lines = [...details];
  if (player.alternateWrestler) {
    lines.unshift({ label: t('publicProfile.alternateWrestler'), value: player.alternateWrestler });
  }
  if (player.psnId) {
    lines.push({ label: t('publicProfile.psnId'), value: player.psnId });
  }

  return (
    <header className="profile-hero">
      <Avatar src={player.imageUrl} name={player.name} size="xl" ring="violet" />
      <div className="profile-hero__text">
        <h1 className="profile-hero__name">{player.name}</h1>
        {!isNeedsWrestler(player.currentWrestler) && (
          <p className="profile-hero__wrestler">
            {t('publicProfile.playingAs')} {player.currentWrestler}
          </p>
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
      </div>
      {actions && <div className="profile-hero__actions">{actions}</div>}
    </header>
  );
}
