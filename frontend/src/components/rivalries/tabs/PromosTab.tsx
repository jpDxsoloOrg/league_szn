import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Player } from '../../../types';
import type { HydratedRivalry } from '../../../types/rivalry';
import { resolvePlayerFullLabel } from '../rivalryUtils';

interface TabProps {
  hydrated: HydratedRivalry;
  players: Player[];
}

/**
 * Recent promos within the rivalry. The hydrated payload carries
 * every recent promo by either participant; this tab narrows it
 * further to promos that actually reference the OPPOSING participant
 * (targetPlayerId / targetPromoId points at the other wrestler),
 * which is the spec for what should show on a rivalry's promos tab.
 *
 * Promos hydrated from the backend carry the metadata we need to
 * make that decision client-side; no extra fetch.
 */
export default function PromosTab({ hydrated, players }: TabProps) {
  const { t } = useTranslation();
  const lookup = new Map(players.map((p) => [p.playerId, p] as const));

  const participantIds = useMemo(
    () => new Set(hydrated.rivalry.participants.map((p) => p.playerId)),
    [hydrated.rivalry.participants],
  );

  // First narrow to promos where each promo's author is one rivalry
  // participant and the targetPlayerId is the other (or the promo
  // explicitly carries this rivalry's id).
  const promos = useMemo(() => {
    return hydrated.recentPromos.filter((promo) => {
      if (promo.rivalryId === hydrated.rivalry.rivalryId) return true;
      if (!promo.targetPlayerId) return false;
      return (
        participantIds.has(promo.playerId) &&
        participantIds.has(promo.targetPlayerId) &&
        promo.playerId !== promo.targetPlayerId
      );
    });
  }, [hydrated.recentPromos, hydrated.rivalry.rivalryId, participantIds]);

  if (promos.length === 0) {
    return <div className="rivalry-tab__empty">{t('rivalries.detail.noRecentPromos')}</div>;
  }

  return (
    <div className="rivalry-tab">
      {promos.map((p) => {
        const author = lookup.get(p.playerId);
        return (
          <article key={p.promoId} className="rivalry-tab__card">
            <header className="rivalry-detail-promo__header">
              <strong>{resolvePlayerFullLabel(author, p.playerId)}</strong>
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
