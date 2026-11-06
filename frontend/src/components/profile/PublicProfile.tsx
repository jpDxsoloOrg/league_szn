import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserRoundX } from 'lucide-react';
import { playersApi, standingsApi, divisionsApi, factionsApi, tagTeamsApi, isApiError } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useSiteConfig } from '../../contexts/SiteConfigContext';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import type { FormResult } from '../ui/FormDots';
import Skeleton from '../ui/Skeleton';
import type { Player, Division } from '../../types';
import type { Stable } from '../../types/stable';
import type { TagTeam } from '../../types/tagTeam';
import MovesetSection from './MovesetSection';
import ProfileHero from './ProfileHero';
import RecordSummary from './RecordSummary';
import SeasonRecords from './SeasonRecords';
import type { SeasonRecord } from './profileRecord';
import '../MeForms.css';
import './Profile.css';

interface PlayerProfile extends Player {
  seasonRecords?: SeasonRecord[];
}

interface StandingsEntry {
  recentForm?: FormResult[];
  currentStreak?: { type: FormResult; count: number };
}

export default function PublicProfile() {
  const { playerId } = useParams<{ playerId: string }>();
  const { t } = useTranslation();
  const { isAuthenticated, isWrestler, playerId: currentPlayerId } = useAuth();
  const { features } = useSiteConfig();

  const [player, setPlayer] = useState<PlayerProfile | null>(null);
  const [standingsEntry, setStandingsEntry] = useState<StandingsEntry | null>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [stables, setStables] = useState<Stable[]>([]);
  const [tagTeams, setTagTeams] = useState<TagTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playerId) return;

    const controller = new AbortController();
    const { signal } = controller;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [playerData, standingsData, divisionsData, stablesData, tagTeamsData] = await Promise.all([
          playersApi.getById(playerId, signal),
          standingsApi.get(undefined, signal),
          divisionsApi.getAll(signal),
          factionsApi.getAll(undefined, signal).catch(() => [] as Stable[]),
          tagTeamsApi.getAll(undefined, signal).catch(() => [] as TagTeam[]),
        ]);

        if (signal.aborted) return;

        setPlayer(playerData as PlayerProfile);
        setDivisions(divisionsData);
        setStables(stablesData);
        setTagTeams(tagTeamsData);

        // This player's form and streak come from the standings response.
        const entry = standingsData.players.find((p) => p.playerId === playerId);
        setStandingsEntry(entry ? { recentForm: entry.recentForm, currentStreak: entry.currentStreak } : null);
      } catch (err) {
        if (signal.aborted) return;
        if (isApiError(err, 404)) {
          setError(t('publicProfile.notFound'));
        } else {
          setError(err instanceof Error ? err.message : t('publicProfile.loadError'));
        }
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    };

    void fetchData();

    return () => {
      controller.abort();
    };
  }, [playerId, t]);

  if (loading) {
    return (
      <div className="profile-page">
        <Skeleton variant="block" count={4} />
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="profile-page">
        {error && <p className="me-alert me-alert--error" role="alert">{error}</p>}
        <EmptyState
          icon={<UserRoundX aria-hidden="true" size={32} />}
          title={t('publicProfile.notFoundTitle')}
          description={t('publicProfile.notFoundMessage')}
        />
      </div>
    );
  }

  const details = [
    {
      label: t('publicProfile.division'),
      value: divisions.find((division) => division.divisionId === player.divisionId)?.name,
    },
    {
      label: t('publicProfile.stable'),
      value: stables.find((stable) => stable.stableId === player.stableId)?.name,
    },
    {
      label: t('publicProfile.tagTeam'),
      value: tagTeams.find((tagTeam) => tagTeam.tagTeamId === player.tagTeamId)?.name,
    },
  ].flatMap(({ label, value }) => (value ? [{ label, value }] : []));

  const hasMoveset =
    Boolean(player.bio) || (player.signatures?.length ?? 0) > 0 || (player.finishers?.length ?? 0) > 0;
  const canChallenge =
    features.challenges && isAuthenticated && isWrestler && currentPlayerId && currentPlayerId !== playerId;
  const headToHeadPath = `/stats/head-to-head?${currentPlayerId ? `player1=${currentPlayerId}&` : ''}player2=${playerId}`;

  return (
    <div className="profile-page">
      <ProfileHero
        player={player}
        details={details}
        actions={
          <>
            {canChallenge && (
              <Button to={`/promos/new?promoType=call-out&targetPlayerId=${playerId}`}>
                {t('publicProfile.challenge')}
              </Button>
            )}
            <Button variant="secondary" to={headToHeadPath}>{t('publicProfile.viewHeadToHead')}</Button>
            {features.statistics && (
              <Button variant="secondary" to={`/stats/player/${playerId}`}>{t('publicProfile.fullStats')}</Button>
            )}
          </>
        }
      />

      <RecordSummary
        record={player}
        recentForm={standingsEntry?.recentForm}
        streak={standingsEntry?.currentStreak}
      />
      {hasMoveset && <MovesetSection player={player} />}
      <SeasonRecords seasons={player.seasonRecords ?? []} />
    </div>
  );
}
