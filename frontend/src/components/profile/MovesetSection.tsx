import { useTranslation } from 'react-i18next';
import Card from '../ui/Card';
import type { Player } from '../../types';
import MoveList from './MoveList';

interface MovesetSectionProps {
  player: Pick<Player, 'bio' | 'signatures' | 'finishers'>;
  /** Show prompts for empty lists. The public page hides them instead. */
  showEmpty?: boolean;
}

export default function MovesetSection({ player, showEmpty = false }: MovesetSectionProps) {
  const { t } = useTranslation();

  return (
    <section className="profile-section" aria-labelledby="profile-moveset-title">
      <h2 className="profile-section__title" id="profile-moveset-title">{t('publicProfile.moveset')}</h2>
      <Card>
        {player.bio ? (
          <p className="profile-bio">{player.bio}</p>
        ) : (
          showEmpty && <p className="profile-bio profile-bio--empty">{t('profile.bio.empty')}</p>
        )}
        <div className="profile-moves">
          <MoveList
            title={t('profile.moves.signatures')}
            moves={player.signatures}
            emptyText={showEmpty ? t('profile.moves.noSignatures') : undefined}
          />
          <MoveList
            title={t('profile.moves.finishers')}
            moves={player.finishers}
            emptyText={showEmpty ? t('profile.moves.noFinishers') : undefined}
          />
        </div>
      </Card>
    </section>
  );
}
