import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Megaphone } from 'lucide-react';
import { challengesApi } from '../../services/api';
import type { ChallengeStatus, ChallengeWithPlayers } from '../../types/challenge';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import Tabs from '../ui/Tabs';
import ChallengeStatusBadge from './ChallengeStatusBadge';
import ChallengeVersus from './ChallengeVersus';
import { getDaysRemaining, getDisplayStatus } from './challengeUtils';
import './ChallengeBoard.css';

type FilterTab = 'active' | 'pending' | 'accepted' | 'recent';

const CALL_OUT_PATH = '/promos/new?promoType=call-out';
const BOARD_STATUSES: ReadonlyArray<ChallengeStatus> = ['pending', 'countered', 'accepted'];

export default function ChallengeBoard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState<FilterTab>('active');
  const [challenges, setChallenges] = useState<ChallengeWithPlayers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      try {
        const data = await challengesApi.getAll(undefined, controller.signal);
        if (controller.signal.aborted) return;
        // Public board: open business only. Overdue challenges drop off here
        // even before the expiry sweep has updated them.
        setChallenges(data.filter((challenge) => BOARD_STATUSES.includes(getDisplayStatus(challenge))));
        setError(null);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [reloadKey]);

  const filtered = useMemo(() => {
    switch (activeFilter) {
      case 'pending':
        return challenges.filter((challenge) => getDisplayStatus(challenge) === 'pending');
      case 'accepted':
        return challenges.filter((challenge) => challenge.status === 'accepted');
      case 'recent':
        return challenges.filter((challenge) => challenge.status === 'declined');
      default:
        return challenges;
    }
  }, [activeFilter, challenges]);

  const renderFooter = (challenge: ChallengeWithPlayers) => {
    if (getDisplayStatus(challenge) !== 'pending') {
      return <span>{new Date(challenge.createdAt).toLocaleDateString()}</span>;
    }
    const days = getDaysRemaining(challenge);
    return (
      <span className={days <= 1 ? 'challenge-card__countdown--urgent' : undefined}>
        {days} {t('common.days')} {t('challenges.board.remaining')}
      </span>
    );
  };

  const renderList = () => {
    if (loading) return <Skeleton variant="cards" count={4} />;
    if (error) {
      return (
        <EmptyState
          title={t('challenges.board.loadError', 'Could not load challenges')}
          description={error}
          actionLabel={t('common.retry')}
          onAction={() => setReloadKey((key) => key + 1)}
        />
      );
    }
    if (filtered.length === 0) {
      return (
        <EmptyState
          icon={<Megaphone aria-hidden="true" />}
          title={t('challenges.board.noChallenges')}
          actionLabel={t('promos.editor.cutCallOut', 'Cut a Call-Out Promo')}
          onAction={() => navigate(CALL_OUT_PATH)}
        />
      );
    }
    return (
      <div className="challenge-board__grid">
        {filtered.map((challenge) => (
          <Card key={challenge.challengeId} to={`/challenges/${challenge.challengeId}`} className="challenge-card">
            <div className="challenge-card__top">
              <span className="challenge-card__match">
                {challenge.matchType}
                {challenge.stipulation && <span className="challenge-card__stipulation">{challenge.stipulation}</span>}
              </span>
              <ChallengeStatusBadge challenge={challenge} />
            </div>
            <ChallengeVersus challenge={challenge} />
            {challenge.message && <p className="challenge-card__message">&ldquo;{challenge.message}&rdquo;</p>}
            <div className="challenge-card__footer">
              {renderFooter(challenge)}
              {challenge.challengeMode === 'tag_team' && <Badge>{t('challenges.board.tagTeamMatch')}</Badge>}
              {challenge.championshipId && <Badge tone="warning">{t('challenges.board.titleMatch')}</Badge>}
            </div>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="challenge-board">
      <PageHeader
        title={t('challenges.board.title')}
        actions={(
          <>
            <Button variant="secondary" to="/challenges/my">{t('challenges.board.myChallenges')}</Button>
            <Button to={CALL_OUT_PATH}>{t('promos.editor.cutCallOut', 'Cut a Call-Out Promo')}</Button>
          </>
        )}
      />
      <Tabs
        label={t('challenges.board.filters')}
        value={activeFilter}
        onValueChange={(value) => setActiveFilter(value as FilterTab)}
        items={[
          { value: 'active', label: t('challenges.board.filterActive') },
          { value: 'pending', label: t('challenges.board.filterPending') },
          { value: 'accepted', label: t('challenges.board.filterAccepted') },
          { value: 'recent', label: t('challenges.board.filterRecent') },
        ]}
      />
      <div className="challenge-board__list">{renderList()}</div>
    </div>
  );
}
