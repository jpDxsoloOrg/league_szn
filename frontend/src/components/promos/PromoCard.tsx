import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Crown, Pin, Trophy } from 'lucide-react';
import type { PromoType, PromoWithContext, ReactionType } from '../../types/promo';
import type { ChallengeWithPlayers } from '../../types/challenge';
import { useAuth } from '../../contexts/AuthContext';
import { useSiteConfig } from '../../contexts/SiteConfigContext';
import { challengesApi } from '../../services/api';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';
import type { BadgeTone } from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import ChallengeStatusBadge from '../challenges/ChallengeStatusBadge';
import { findCallOutChallenge, getDisplayStatus } from '../challenges/challengeUtils';
import PromoReactions from './PromoReactions';
import './PromoCard.css';

interface PromoCardProps {
  /** `isArchived` is only sent to staff who ask for archived promos. */
  promo: PromoWithContext & { isArchived?: boolean };
  compact?: boolean;
  isRead?: boolean;
  onView?: () => void;
  onReact?: (promoId: string, reaction: ReactionType) => void;
}

const PROMO_TYPE_TONES: Record<PromoType, BadgeTone> = {
  'open-mic': 'neutral',
  'call-out': 'pink',
  response: 'violet',
  'pre-match': 'primary',
  'post-match': 'win',
  championship: 'warning',
  return: 'violet',
  rivalry: 'pink',
};

function highlightMentions(content: string): (string | JSX.Element)[] {
  const parts = content.split(/(@[\w\s]+?)(?=\s[^a-zA-Z]|\s@|,|!|\.|$)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('@')) {
      return (
        <span key={idx} className="promo-card__mention">
          {part}
        </span>
      );
    }
    return part;
  });
}

const TRUNCATE_LENGTH = 150;

export default function PromoCard({ promo, compact = false, isRead, onView, onReact }: PromoCardProps) {
  const { t } = useTranslation();
  const { playerId } = useAuth();
  const { features } = useSiteConfig();
  const [acceptingChallenge, setAcceptingChallenge] = useState(false);
  const [challenge, setChallenge] = useState<ChallengeWithPlayers | null>(null);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const canTruncate = promo.content.length > TRUNCATE_LENGTH;
  const displayContent = useMemo(
    () => canTruncate && !expanded ? promo.content.slice(0, TRUNCATE_LENGTH) + '...' : promo.content,
    [promo.content, canTruncate, expanded]
  );

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((v) => !v);
  };

  const isTargetOfCallOut = Boolean(
    features.challenges &&
    promo.promoType === 'call-out' &&
    playerId &&
    promo.targetPlayerId === playerId
  );

  const { playerId: authorId, createdAt: postedAt } = promo;

  // The challenges API returns every status when given a player, so the status
  // shown here always comes from the matched challenge itself.
  useEffect(() => {
    if (!isTargetOfCallOut || !playerId) return;
    const controller = new AbortController();
    const loadChallenge = async () => {
      try {
        const challenges = await challengesApi.getAll({ playerId }, controller.signal);
        if (!controller.signal.aborted) {
          setChallenge(findCallOutChallenge(challenges, { playerId: authorId, createdAt: postedAt }, playerId));
        }
      } catch {
        if (!controller.signal.aborted) setChallenge(null);
      }
    };
    void loadChallenge();
    return () => controller.abort();
  }, [isTargetOfCallOut, playerId, authorId, postedAt]);

  const handleAcceptChallenge = async () => {
    if (!challenge) return;
    setAcceptingChallenge(true);
    setChallengeError(null);
    try {
      await challengesApi.respond(challenge.challengeId, 'accept');
      setChallenge({ ...challenge, status: 'accepted' });
    } catch {
      setChallengeError(t('promos.card.acceptFailed', 'Could not accept the challenge. Try again.'));
    } finally {
      setAcceptingChallenge(false);
    }
  };

  const renderChallengeStatus = (current: ChallengeWithPlayers) => {
    const status = getDisplayStatus(current);
    if (status === 'pending') {
      return (
        <Button size="sm" loading={acceptingChallenge} onClick={handleAcceptChallenge}>
          {acceptingChallenge
            ? t('promos.card.accepting', 'Accepting...')
            : t('promos.card.acceptChallenge', 'Accept Challenge')}
        </Button>
      );
    }
    if (status === 'accepted') {
      return <Badge tone="win">{t('promos.card.challengeAccepted', 'Challenge Accepted!')}</Badge>;
    }
    return <ChallengeStatusBadge challenge={current} />;
  };

  const classes = [
    'promo-card',
    promo.isPinned ? 'promo-card--pinned' : '',
    compact ? 'promo-card--compact' : '',
    isRead === false ? 'promo-card--unread' : '',
  ].filter(Boolean).join(' ');

  return (
    <Card
      padding={compact ? 'sm' : 'md'}
      className={classes}
      onClick={() => { if (isRead === false) onView?.(); }}
    >
      <div className="promo-card__header">
        <Avatar src={promo.playerImageUrl} name={promo.wrestlerName} />
        <div className="promo-card__author">
          <span className="promo-card__wrestler">{promo.wrestlerName}</span>
          {promo.playerName && <span className="promo-card__player">{promo.playerName}</span>}
        </div>
        <div className="promo-card__badges">
          {promo.isPinned && (
            <Badge tone="primary" icon={<Pin aria-hidden="true" size={12} />}>
              {t('promos.card.pinned', 'Pinned')}
            </Badge>
          )}
          {promo.isArchived && <Badge>{t('promos.card.archived', 'Archived')}</Badge>}
          <Badge tone={PROMO_TYPE_TONES[promo.promoType]}>
            {t(`promos.types.${promo.promoType}`, promo.promoType)}
          </Badge>
        </div>
      </div>

      {promo.promoType === 'response' && promo.targetPromo && (
        <p className="promo-card__context">
          {t('promos.card.respondingTo', 'Responding to')}{' '}
          <Link to={`/promos/${promo.targetPromoId}`}>
            {promo.targetPromo.title || t('promos.card.aPromo', 'a promo')} {t('promos.card.by', 'by')}{' '}
            {promo.targetWrestlerName}
          </Link>
        </p>
      )}

      {promo.promoType === 'call-out' && promo.challengeMode === 'tag_team' && promo.challengerTagTeamName && promo.targetTagTeamName && (
        <p className="promo-card__context">
          <strong>{promo.challengerTagTeamName}</strong>{' '}
          {t('promos.card.callingOut', 'calling out')}{' '}
          <strong>{promo.targetTagTeamName}</strong>
        </p>
      )}

      {promo.promoType === 'call-out' && promo.challengeMode !== 'tag_team' && promo.targetWrestlerName && (
        <p className="promo-card__context">
          {t('promos.card.callingOut', 'Calling out')} <strong>{promo.targetWrestlerName}</strong>
        </p>
      )}

      {promo.matchName && (
        <p className="promo-card__context">
          <Trophy aria-hidden="true" size={16} />
          {promo.matchName}
        </p>
      )}

      {promo.championshipName && (
        <p className="promo-card__context">
          <Crown aria-hidden="true" size={16} />
          {promo.championshipName}
        </p>
      )}

      {promo.title && <h3 className="promo-card__title">{promo.title}</h3>}

      <div className="promo-card__content">
        <p>{highlightMentions(displayContent)}</p>
        {canTruncate && (
          <button type="button" className="promo-card__more" onClick={toggleExpand}>
            {expanded
              ? t('promos.card.showLess', 'Show less')
              : t('promos.card.readMore', 'Read more')}
          </button>
        )}
      </div>

      {isTargetOfCallOut && challenge && (
        <div className="promo-card__challenge">
          {renderChallengeStatus(challenge)}
          <Link to={`/challenges/${challenge.challengeId}`} className="promo-card__link">
            {t('promos.card.viewChallenge', 'View Challenge')}
          </Link>
          {challengeError && <span className="promo-card__error" role="alert">{challengeError}</span>}
        </div>
      )}

      <div className="promo-card__footer">
        <PromoReactions
          reactionCounts={promo.reactionCounts}
          onReact={onReact ? (reaction) => onReact(promo.promoId, reaction) : undefined}
        />
        {promo.responseCount > 0 && (
          <Link to={`/promos/${promo.promoId}`} className="promo-card__link">
            {promo.responseCount} {promo.responseCount === 1
              ? t('promos.card.response', 'response')
              : t('promos.card.responses', 'responses')}
            {' — '}
            {t('promos.card.viewThread', 'View Thread')}
          </Link>
        )}
      </div>
    </Card>
  );
}
