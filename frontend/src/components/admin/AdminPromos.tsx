import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PromoType } from '../../types/promo';
import { mockPromos } from '../../mocks/promoMockData';
import type { PromoWithContext } from '../../types/promo';
import './AdminPromos.css';

const PROMO_TYPE_OPTIONS: { value: '' | PromoType; labelKey: string; fallback: string }[] = [
  { value: '', labelKey: 'promos.admin.all', fallback: 'All' },
  { value: 'open-mic', labelKey: 'promos.types.open-mic', fallback: 'Open Mic' },
  { value: 'call-out', labelKey: 'promos.types.call-out', fallback: 'Call-Out' },
  { value: 'response', labelKey: 'promos.types.response', fallback: 'Response' },
  { value: 'pre-match', labelKey: 'promos.types.pre-match', fallback: 'Pre-Match' },
  { value: 'post-match', labelKey: 'promos.types.post-match', fallback: 'Post-Match' },
  { value: 'championship', labelKey: 'promos.types.championship', fallback: 'Championship' },
  { value: 'return', labelKey: 'promos.types.return', fallback: 'Return' },
];

function getTotalReactions(promo: PromoWithContext): number {
  return Object.values(promo.reactionCounts).reduce((sum, count) => sum + count, 0);
}

function truncateContent(content: string, maxLength: number = 50): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength) + '...';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}

export default function AdminPromos() {
  const { t } = useTranslation();
  const [promos, setPromos] = useState<PromoWithContext[]>([...mockPromos]);
  const [filterType, setFilterType] = useState<'' | PromoType>('');

  const filteredPromos = useMemo(() => {
    if (!filterType) return promos;
    return promos.filter((p) => p.promoType === filterType);
  }, [promos, filterType]);

  const handleTogglePin = (promoId: string) => {
    setPromos((prev) =>
      prev.map((p) =>
        p.promoId === promoId ? { ...p, isPinned: !p.isPinned } : p
      )
    );
  };

  const handleToggleHide = (promoId: string) => {
    setPromos((prev) =>
      prev.map((p) =>
        p.promoId === promoId ? { ...p, isHidden: !p.isHidden } : p
      )
    );
  };

  const handleDelete = (promoId: string) => {
    if (window.confirm(t('promos.admin.confirmDelete', 'Are you sure you want to delete this promo?'))) {
      setPromos((prev) => prev.filter((p) => p.promoId !== promoId));
    }
  };

  return (
    <div className="admin-promos">
      <div className="admin-promos-header">
        <h3>{t('promos.admin.title', 'Manage Promos')}</h3>
        <div className="admin-promos-filter">
          <label htmlFor="promo-type-filter">
            {t('promos.admin.filterByType', 'Filter by Type')}
          </label>
          <select
            id="promo-type-filter"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as '' | PromoType)}
          >
            {PROMO_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey, opt.fallback)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="admin-promos-table-wrapper">
        <table className="admin-promos-table">
          <thead>
            <tr>
              <th>{t('promos.admin.player', 'Player')}</th>
              <th>{t('promos.admin.type', 'Type')}</th>
              <th>{t('promos.admin.content', 'Content')}</th>
              <th>{t('promos.admin.reactions', 'Reactions')}</th>
              <th>{t('promos.admin.date', 'Date')}</th>
              <th>{t('promos.admin.actions', 'Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredPromos.map((promo) => (
              <tr key={promo.promoId} className={promo.isHidden ? 'hidden-row' : ''}>
                <td className="player-cell">
                  <span className="wrestler-name">{promo.wrestlerName}</span>
                  <span className="player-name">({promo.playerName})</span>
                </td>
                <td>
                  <span className="type-badge">
                    {t(`promos.types.${promo.promoType}`, promo.promoType)}
                  </span>
                </td>
                <td className="content-cell">
                  {truncateContent(promo.title ? `${promo.title} - ${promo.content}` : promo.content)}
                </td>
                <td className="reactions-cell">{getTotalReactions(promo)}</td>
                <td className="date-cell">{formatDate(promo.createdAt)}</td>
                <td className="actions-cell">
                  <button
                    className={`action-btn pin-btn ${promo.isPinned ? 'active' : ''}`}
                    onClick={() => handleTogglePin(promo.promoId)}
                    title={promo.isPinned
                      ? t('promos.admin.unpin', 'Unpin')
                      : t('promos.admin.pin', 'Pin')}
                  >
                    {promo.isPinned
                      ? t('promos.admin.unpin', 'Unpin')
                      : t('promos.admin.pin', 'Pin')}
                  </button>
                  <button
                    className={`action-btn hide-btn ${promo.isHidden ? 'active' : ''}`}
                    onClick={() => handleToggleHide(promo.promoId)}
                    title={promo.isHidden
                      ? t('promos.admin.unhide', 'Unhide')
                      : t('promos.admin.hide', 'Hide')}
                  >
                    {promo.isHidden
                      ? t('promos.admin.unhide', 'Unhide')
                      : t('promos.admin.hide', 'Hide')}
                  </button>
                  <button
                    className="action-btn delete-btn"
                    onClick={() => handleDelete(promo.promoId)}
                    title={t('promos.admin.delete', 'Delete')}
                  >
                    {t('promos.admin.delete', 'Delete')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
