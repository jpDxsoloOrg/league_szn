import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PromoWithContext, PromoType } from '../../types/promo';
import { mockPlayers } from '../../mocks/promoMockData';
import PromoReactions from './PromoReactions';
import './PromoCard.css';

interface PromoCardProps {
  promo: PromoWithContext;
  compact?: boolean;
}

const PROMO_TYPE_COLORS: Record<PromoType, string> = {
  'open-mic': '#6366f1',
  'call-out': '#ef4444',
  response: '#3b82f6',
  'pre-match': '#f59e0b',
  'post-match': '#10b981',
  championship: '#d4af37',
  return: '#ec4899',
};

function getAvatarColor(playerId: string): string {
  const player = mockPlayers.find((p) => p.playerId === playerId);
  return player?.avatarColor || '#666';
}

function getInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function highlightMentions(content: string): (string | JSX.Element)[] {
  const parts = content.split(/(@[\w\s]+?)(?=\s[^a-zA-Z]|\s@|,|!|\.|$)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('@')) {
      return (
        <span key={idx} className="promo-mention">
          {part}
        </span>
      );
    }
    return part;
  });
}

export default function PromoCard({ promo, compact = false }: PromoCardProps) {
  const { t } = useTranslation();

  return (
    <div className={`promo-card ${promo.isPinned ? 'pinned' : ''} ${compact ? 'compact' : ''}`}>
      {promo.isPinned && (
        <div className="promo-pinned-indicator">
          <span className="pin-icon">{'\u{1F4CC}'}</span>
          <span>{t('promos.card.pinned', 'Pinned')}</span>
        </div>
      )}

      <div className="promo-card-header">
        <div
          className="promo-avatar"
          style={{ backgroundColor: getAvatarColor(promo.playerId) }}
        >
          {getInitial(promo.wrestlerName)}
        </div>
        <div className="promo-author-info">
          <div className="promo-author-line">
            <span className="promo-wrestler-name">{promo.wrestlerName}</span>
            <span className="promo-player-name">({promo.playerName})</span>
            <span
              className="promo-type-badge"
              style={{ backgroundColor: PROMO_TYPE_COLORS[promo.promoType] }}
            >
              {t(`promos.types.${promo.promoType}`, promo.promoType)}
            </span>
          </div>
          <span className="promo-timestamp">{formatTimestamp(promo.createdAt)}</span>
        </div>
      </div>

      {promo.promoType === 'response' && promo.targetPromo && (
        <div className="promo-responding-to">
          <span className="responding-label">{t('promos.card.respondingTo', 'Responding to')}</span>
          <Link to={`/promos/${promo.targetPromoId}`} className="responding-link">
            {promo.targetPromo.title || t('promos.card.aPromo', 'a promo')} {t('promos.card.by', 'by')}{' '}
            {promo.targetWrestlerName}
          </Link>
        </div>
      )}

      {(promo.promoType === 'call-out') && promo.targetWrestlerName && (
        <div className="promo-target">
          <span className="target-label">{t('promos.card.callingOut', 'Calling out')}</span>
          <span className="target-name">{promo.targetWrestlerName}</span>
        </div>
      )}

      {promo.matchName && (
        <div className="promo-match-context">
          <span className="match-icon">{'\u{1F3C6}'}</span>
          <span>{promo.matchName}</span>
        </div>
      )}

      {promo.championshipName && (
        <div className="promo-championship-context">
          <span className="championship-icon">{'\u{1F451}'}</span>
          <span>{promo.championshipName}</span>
        </div>
      )}

      {promo.title && <h3 className="promo-title">{promo.title}</h3>}

      <div className="promo-content">
        <p>{highlightMentions(promo.content)}</p>
      </div>

      <div className="promo-card-footer">
        <PromoReactions reactionCounts={promo.reactionCounts} />

        <div className="promo-footer-actions">
          {promo.responseCount > 0 && (
            <Link to={`/promos/${promo.promoId}`} className="promo-thread-link">
              {promo.responseCount} {promo.responseCount === 1
                ? t('promos.card.response', 'response')
                : t('promos.card.responses', 'responses')}
              {' \u2014 '}
              {t('promos.card.viewThread', 'View Thread')}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
