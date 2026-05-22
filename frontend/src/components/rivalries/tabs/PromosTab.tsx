import { useTranslation } from 'react-i18next';
import type { Player } from '../../../types';
import type { HydratedRivalry } from '../../../types/rivalry';

interface TabProps {
  hydrated: HydratedRivalry;
  players: Player[];
}

/**
 * Recent promos by the participants. The hydrated payload already
 * carries the latest 5 — RIV-06's rivalryId-tagged promos will swap
 * this for a `promosApi.getAll({ rivalryId })` call once the seed
 * data and UI catch up; participant-keyed promos still flow through
 * the hydrated path for legacy data.
 */
export default function PromosTab({ hydrated, players }: TabProps) {
  const { t } = useTranslation();
  const lookup = new Map(players.map((p) => [p.playerId, p] as const));

  if (hydrated.recentPromos.length === 0) {
    return <div className="rivalry-tab__empty">{t('rivalries.detail.noRecentPromos')}</div>;
  }

  return (
    <div className="rivalry-tab">
      {hydrated.recentPromos.map((p) => {
        const author = lookup.get(p.playerId);
        return (
          <article key={p.promoId} className="rivalry-tab__card">
            <header className="rivalry-detail-promo__header">
              <strong>{author?.currentWrestler ?? author?.name ?? p.playerId}</strong>
              <span className="rivalry-detail-promo__date">
                {new Date(p.createdAt).toLocaleDateString()}
              </span>
            </header>
            {p.title && <h4 className="rivalry-detail-promo__title">{p.title}</h4>}
            <p className="rivalry-detail-promo__content">{p.content}</p>
          </article>
        );
      })}
    </div>
  );
}
