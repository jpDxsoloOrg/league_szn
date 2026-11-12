import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useTagTeamContenderRanks, type TagTitleStanding } from '../../hooks/useTagTeamContenderRanks';
import { profileApi, tagTeamsApi } from '../../services/api';
import type { TagTeam } from '../../types/tagTeam';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import './MyContenderStatus.css';

type RankedStanding = Extract<TagTitleStanding, { status: 'ranked' }>;

function Movement({ standing }: { standing: RankedStanding }) {
  const { t } = useTranslation();

  if (standing.isNew) {
    return <span className="my-contender__move my-contender__move--new">{t('contenders.new')}</span>;
  }
  if (standing.movement > 0) {
    return (
      <span className="my-contender__move my-contender__move--up">
        <ArrowUp aria-hidden="true" size={14} />
        {t('contenders.movedUp', { places: standing.movement })}
      </span>
    );
  }
  if (standing.movement < 0) {
    const places = Math.abs(standing.movement);
    return (
      <span className="my-contender__move my-contender__move--down">
        <ArrowDown aria-hidden="true" size={14} />
        {t('contenders.movedDown', { places })}
      </span>
    );
  }
  return (
    <span className="my-contender__move">
      <Minus aria-hidden="true" size={14} />
      {t('contenders.noMovement')}
    </span>
  );
}

function StandingRow({ standing }: { standing: TagTitleStanding }) {
  const { t } = useTranslation();

  return (
    <li className="my-contender__row">
      <span className="my-contender__title">{standing.championshipName}</span>
      {standing.status === 'champion' && (
        <Badge tone="primary">{t('contenders.myStatus.tagTitles.champions')}</Badge>
      )}
      {standing.status === 'ranked' && (
        <span className="my-contender__detail">
          <Badge tone="pink">{t('contenders.myStatus.tagTitles.rank', { rank: standing.rank })}</Badge>
          <Movement standing={standing} />
          <span className="my-contender__muted">
            {t('contenders.myStatus.tagTitles.matchesInPeriod', { count: standing.matchesInPeriod })}
          </span>
        </span>
      )}
      {standing.status === 'unranked' && (
        <span className="my-contender__detail">
          <Badge tone="neutral">{t('contenders.myStatus.tagTitles.unranked')}</Badge>
          <span className="my-contender__muted">
            {t('contenders.myStatus.tagTitles.matchesNeeded', { count: standing.minimumMatches })}
          </span>
        </span>
      )}
    </li>
  );
}

function TagTitleStandings({ tagTeamId }: { tagTeamId: string }) {
  const { t } = useTranslation();
  const { standings, loading, failed } = useTagTeamContenderRanks(tagTeamId);

  if (loading) return <Skeleton variant="block" count={2} />;
  if (failed) return <p className="my-contender__muted">{t('contenders.myStatus.tagTitles.loadFailed')}</p>;
  if (standings.length === 0) return <p className="my-contender__muted">{t('contenders.myStatus.tagTitles.noTagTitles')}</p>;

  return (
    <ul className="my-contender__list">
      {standings.map((standing) => <StandingRow key={standing.championshipId} standing={standing} />)}
    </ul>
  );
}

/** The signed-in wrestler's contender standing. Today it covers their tag team on each tag title. */
export default function MyContenderStatus() {
  const { t } = useTranslation();
  const { isAuthenticated, isWrestler } = useAuth();
  useDocumentTitle(t('contenders.myStatus.title'));

  const [tagTeam, setTagTeam] = useState<TagTeam | null>(null);
  const [loading, setLoading] = useState(isAuthenticated && isWrestler);
  const [error, setError] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);

  const loadTeam = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError(false);
    try {
      const profile = await profileApi.getMyProfile(signal);
      const team = profile.tagTeamId ? await tagTeamsApi.getById(profile.tagTeamId, signal) : null;
      if (!signal.aborted) setTagTeam(team);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setTagTeam(null);
      setError(true);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !isWrestler) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    loadTeam(controller.signal);
    return () => controller.abort();
  }, [isAuthenticated, isWrestler, loadTeam, reloadCount]);

  const renderTagTitles = () => {
    if (!isAuthenticated) {
      return <p className="my-contender__muted">{t('contenders.myStatus.tagTitles.loginRequired')}</p>;
    }
    if (loading) return <Skeleton variant="block" count={2} />;
    if (error) {
      return (
        <EmptyState
          title={t('common.error')}
          description={t('contenders.myStatus.tagTitles.loadFailed')}
          actionLabel={t('common.retry')}
          onAction={() => setReloadCount((count) => count + 1)}
        />
      );
    }
    if (!tagTeam) {
      return (
        <div className="my-contender__empty">
          <p className="my-contender__muted">{t('contenders.myStatus.tagTitles.notInTeam')}</p>
          <Button variant="secondary" size="sm" to="/my-tag-team">
            {t('contenders.myStatus.tagTitles.goToMyTagTeam')}
          </Button>
        </div>
      );
    }
    if (tagTeam.status !== 'active') {
      return <p className="my-contender__muted">{t('contenders.myStatus.tagTitles.teamNotActive')}</p>;
    }
    return (
      <>
        <p className="my-contender__team">{t('contenders.myStatus.tagTitles.teamLabel', { name: tagTeam.name })}</p>
        <TagTitleStandings tagTeamId={tagTeam.tagTeamId} />
      </>
    );
  };

  return (
    <div className="my-contender">
      <PageHeader
        title={t('contenders.myStatus.title')}
        actions={<Button variant="secondary" to="/contenders">{t('contenders.myStatus.viewRankings')}</Button>}
      />

      <section className="my-contender__section" aria-labelledby="my-contender-tag-titles">
        <h2 id="my-contender-tag-titles" className="my-contender__heading">
          {t('contenders.myStatus.tagTitles.heading')}
        </h2>
        {renderTagTitles()}
      </section>

      <EmptyState
        title={t('contenders.myStatus.tagTitles.singlesComingSoon')}
        description={t('contenders.myStatus.requiresAuth')}
      />
    </div>
  );
}
