import { useMemo, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserRoundX } from 'lucide-react';
import {
  championshipsApi,
  divisionsApi,
  factionsApi,
  isApiError,
  matchesApi,
  playersApi,
  rivalriesApi,
  standingsApi,
  tagTeamsApi,
} from '../../services/api';
import type { PlayerDirectoryEntry } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useSiteConfig } from '../../contexts/SiteConfigContext';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import Skeleton from '../ui/Skeleton';
import type { Championship, Match, Player, Division } from '../../types';
import type { Rivalry } from '../../types/rivalry';
import type { Stable } from '../../types/stable';
import type { TagTeam } from '../../types/tagTeam';
import { computePlayerForm } from '../../utils/matchDisplay';
import { getTitleAccent } from '../titleAccent';
import MovesetSection from './MovesetSection';
import ProfileHero from './ProfileHero';
import ProfileRivalries from './ProfileRivalries';
import RecentMatches from './RecentMatches';
import RecordSummary from './RecordSummary';
import SeasonRecords from './SeasonRecords';
import type { SeasonRecord } from './profileRecord';
import '../MeForms.css';
import './Profile.css';

interface PlayerProfile extends Player {
  seasonRecords?: SeasonRecord[];
}

export default function PublicProfile() {
  const { playerId } = useParams<{ playerId: string }>();
  const { t } = useTranslation();
  const { isAuthenticated, isWrestler, playerId: currentPlayerId } = useAuth();
  const { features } = useSiteConfig();

  const [player, setPlayer] = useState<PlayerProfile | null>(null);
  const [overall, setOverall] = useState<number | undefined>();
  const [matches, setMatches] = useState<Match[]>([]);
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [rivalries, setRivalries] = useState<Rivalry[]>([]);
  const [directory, setDirectory] = useState<PlayerDirectoryEntry[]>([]);
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

        // Only the player is essential; each of the rest adds one part of the card.
        const [
          playerData,
          standingsData,
          divisionsData,
          stablesData,
          tagTeamsData,
          matchesData,
          championshipsData,
          rivalriesData,
          directoryData,
        ] = await Promise.all([
          playersApi.getById(playerId, signal),
          standingsApi.get(undefined, signal).catch(() => null),
          divisionsApi.getAll(signal).catch(() => [] as Division[]),
          factionsApi.getAll(undefined, signal).catch(() => [] as Stable[]),
          tagTeamsApi.getAll(undefined, signal).catch(() => [] as TagTeam[]),
          matchesApi.getAll({ playerId }, signal).catch(() => [] as Match[]),
          championshipsApi.getAll(signal).catch(() => [] as Championship[]),
          rivalriesApi.list({ participantId: playerId, status: 'active' }, signal)
            .then((response) => response.rivalries)
            .catch(() => [] as Rivalry[]),
          playersApi.getDirectory(signal).catch(() => [] as PlayerDirectoryEntry[]),
        ]);

        if (signal.aborted) return;

        setPlayer(playerData as PlayerProfile);
        setDivisions(divisionsData);
        setStables(stablesData);
        setTagTeams(tagTeamsData);
        setMatches(matchesData);
        setChampionships(championshipsData);
        setRivalries(rivalriesData);
        setDirectory(directoryData);
        // Standings leave some players out, so they only supply the overall.
        setOverall(standingsData?.players.find((entry) => entry.playerId === playerId)?.mainOverall);
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

  const names = useMemo(
    () => new Map(directory.map((entry) => [entry.playerId, entry.currentWrestler || entry.name])),
    [directory],
  );

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

  const form = computePlayerForm(player.playerId, matches);
  const titles = championships
    .filter((championship) => {
      const holder = championship.currentChampion;
      return championship.isActive !== false && (Array.isArray(holder) ? holder.includes(player.playerId) : holder === player.playerId);
    })
    .map((championship) => ({
      id: championship.championshipId,
      name: championship.name,
      accent: getTitleAccent(championship),
    }));

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
        card={{
          overall: player.mainOverall ?? overall,
          titles,
          // The form is newest first; FormDots reads oldest to newest.
          form: [...form.recentForm].reverse(),
          streak: form.currentStreak,
        }}
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

      <RecordSummary record={player} titlesHeld={titles.length} />

      <div className="profile-columns">
        <RecentMatches playerId={player.playerId} matches={matches} names={names} />
        <div className="profile-columns__side">
          <ProfileRivalries playerId={player.playerId} rivalries={rivalries} names={names} />
          <SeasonRecords seasons={player.seasonRecords ?? []} />
        </div>
      </div>

      {hasMoveset && <MovesetSection player={player} />}
    </div>
  );
}
