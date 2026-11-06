import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { standingsApi, seasonsApi, divisionsApi } from '../services/api';
import { logger } from '../utils/logger';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useIsMobile } from '../hooks/useIsMobile';
import { useShowMore } from '../hooks/useShowMore';
import type { Standings as StandingsType, Season, Division, Player } from '../types';
import PlayerHoverCard from './PlayerHoverCard';
import DivisionFilter from './DivisionFilter';
import Avatar from './ui/Avatar';
import DataTable from './ui/DataTable';
import type { DataTableColumn } from './ui/DataTable';
import EmptyState from './ui/EmptyState';
import FormDots from './ui/FormDots';
import PageHeader from './ui/PageHeader';
import Podium from './ui/Podium';
import type { PodiumEntry } from './ui/Podium';
import Select from './ui/Select';
import ShowMore from './ui/ShowMore';
import Skeleton from './ui/Skeleton';
import './rankPodium.css';
import './Standings.css';

interface RankedPlayer extends Player {
  rank: number;
  matchesPlayed: number;
  winRate: number;
}

const PODIUM_SIZE = 3;
const ROWS_PER_PAGE = 50;

const STREAK_TITLE_KEYS = {
  W: 'standings.winStreak',
  L: 'standings.lossStreak',
  D: 'standings.drawStreak',
} as const;

function formatRecord(player: Player): string {
  return `${player.wins} - ${player.losses} - ${player.draws}`;
}

function formatWinRate(player: RankedPlayer): string {
  return player.matchesPlayed > 0 ? `${player.winRate.toFixed(1)}%` : '-';
}

/** The API sends recentForm newest first; FormDots reads oldest to newest. */
function RecentForm({ player }: { player: Player }) {
  if (!player.recentForm || player.recentForm.length === 0) {
    return <span className="standings-muted">-</span>;
  }
  return <FormDots results={[...player.recentForm].reverse()} />;
}

function Streak({ streak }: { streak: Player['currentStreak'] }) {
  const { t } = useTranslation();
  if (!streak || streak.count === 0) {
    return <span className="standings-muted">-</span>;
  }
  return (
    <span className={`standings-streak standings-streak--${streak.type.toLowerCase()}`} title={t(STREAK_TITLE_KEYS[streak.type])}>
      {streak.type}{streak.count}
    </span>
  );
}

export default function Standings() {
  const { t } = useTranslation();
  useDocumentTitle(t('standings.title'));
  const isMobile = useIsMobile();
  const [standings, setStandings] = useState<StandingsType | null>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [selectedDivision, setSelectedDivision] = useState('all');
  const [selectedAlignment, setSelectedAlignment] = useState('all');
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [defaultsResolved, setDefaultsResolved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const { count: visibleCount, showMore } = useShowMore(
    ROWS_PER_PAGE,
    `${selectedDivision}|${selectedAlignment}|${selectedSeasonId}`,
  );

  useEffect(() => {
    const abortController = new AbortController();

    const fetchInitialData = async () => {
      try {
        const [seasonsData, divisionsData] = await Promise.all([
          seasonsApi.getAll(abortController.signal),
          divisionsApi.getAll(abortController.signal),
        ]);
        if (abortController.signal.aborted) return;
        setSeasons(seasonsData);
        setDivisions(divisionsData);
        const activeSeason = seasonsData.find((season) => season.status === 'active');
        if (activeSeason) setSelectedSeasonId(activeSeason.seasonId);
        const heavyweight = divisionsData.find((division) => division.name.toLowerCase() === 'heavyweight');
        if (heavyweight) setSelectedDivision(heavyweight.divisionId);
        setDefaultsResolved(true);
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Failed to load initial standings data');
        }
        if (!abortController.signal.aborted) setDefaultsResolved(true);
      }
    };

    fetchInitialData();
    return () => abortController.abort();
  }, []);

  useEffect(() => {
    if (!defaultsResolved) return;
    const abortController = new AbortController();

    const fetchStandings = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await standingsApi.get(selectedSeasonId || undefined, abortController.signal);
        if (!abortController.signal.aborted) setStandings(data);
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err.message);
        }
      } finally {
        if (!abortController.signal.aborted) setLoading(false);
      }
    };

    fetchStandings();
    return () => abortController.abort();
  }, [selectedSeasonId, defaultsResolved, reloadCount]);

  const rankedPlayers = useMemo((): RankedPlayer[] => {
    const matchesDivision = (player: Player) => {
      if (selectedDivision === 'all') return true;
      if (selectedDivision === 'none') return !player.divisionId;
      return player.divisionId === selectedDivision;
    };
    const matchesAlignment = (player: Player) => selectedAlignment === 'all' || player.alignment === selectedAlignment;

    const hasPlayed = (player: Player) => player.wins + player.losses + player.draws > 0;
    const shown = (standings?.players ?? []).filter((player) => matchesDivision(player) && matchesAlignment(player));

    // The API sorts on wins, which puts 0-0-0 above 0-2-0. Players who have
    // wrestled rank first, so the podium is always the top of the table.
    return [...shown.filter(hasPlayed), ...shown.filter((player) => !hasPlayed(player))].map((player, index) => {
      const matchesPlayed = player.wins + player.losses + player.draws;
      return {
        ...player,
        rank: index + 1,
        matchesPlayed,
        winRate: matchesPlayed > 0 ? (player.wins / matchesPlayed) * 100 : 0,
        // No record in this scope means nothing to show form for, whatever happened elsewhere.
        recentForm: matchesPlayed > 0 ? player.recentForm : undefined,
        currentStreak: matchesPlayed > 0 ? player.currentStreak : undefined,
      };
    });
  }, [standings, selectedDivision, selectedAlignment]);

  // Only players who have wrestled earn a medal position.
  const playedPlayers = rankedPlayers.filter((player) => player.matchesPlayed > 0);
  // Fewer than three is not a podium, so the table starts at #1 instead.
  const podiumPlayers = playedPlayers.length >= PODIUM_SIZE ? playedPlayers.slice(0, PODIUM_SIZE) : [];
  const listedPlayers = rankedPlayers.slice(podiumPlayers.length);

  const podiumEntries: PodiumEntry[] = podiumPlayers.map((player) => ({
    id: player.playerId,
    name: player.name,
    imageUrl: player.imageUrl,
    record: formatRecord(player),
    subtitle: player.currentWrestler,
    to: `/player/${player.playerId}`,
    stats: [
      { label: t('standings.table.winPercent'), value: formatWinRate(player) },
      { label: t('standings.table.streak'), value: <Streak streak={player.currentStreak} /> },
      { label: t('standings.table.form'), value: <RecentForm player={player} /> },
    ],
  }));

  const columns: DataTableColumn<RankedPlayer>[] = [
    {
      key: 'rank',
      header: t('standings.table.rank'),
      render: (player) => <span className="standings-rank">#{player.rank}</span>,
      sortValue: (player) => player.rank,
    },
    {
      key: 'player',
      header: t('standings.table.player'),
      render: (player) => (
        <div className="standings-player">
          <Avatar src={player.imageUrl} name={player.name} />
          <div className="standings-player__names">
            <PlayerHoverCard player={player} divisions={divisions}>
              <Link to={`/player/${player.playerId}`} className="standings-player__name">{player.name}</Link>
            </PlayerHoverCard>
            <span className="standings-player__wrestler">{player.currentWrestler}</span>
          </div>
        </div>
      ),
      sortValue: (player) => player.name,
    },
    {
      key: 'record',
      header: t('standings.record'),
      render: formatRecord,
      align: 'center',
      sortValue: (player) => player.wins,
    },
    {
      key: 'winRate',
      header: t('standings.table.winPercent'),
      render: formatWinRate,
      align: 'center',
      sortValue: (player) => player.winRate,
    },
    {
      key: 'form',
      header: t('standings.table.form'),
      render: (player) => <RecentForm player={player} />,
      align: 'center',
    },
    {
      key: 'streak',
      header: t('standings.table.streak'),
      render: (player) => <Streak streak={player.currentStreak} />,
      align: 'center',
    },
  ];

  const seasonName = seasons.find((season) => season.seasonId === selectedSeasonId)?.name ?? t('standings.allTime');
  const seasonOptions = [
    { value: '', label: t('standings.allTime') },
    ...seasons.map((season) => ({
      value: season.seasonId,
      label: season.status === 'active' ? `${season.name} (${t('common.active')})` : season.name,
    })),
  ];
  const alignmentOptions = [
    { value: 'all', label: t('standings.alignment.all') },
    { value: 'face', label: t('standings.alignment.face') },
    { value: 'neutral', label: t('standings.alignment.neutral') },
    { value: 'heel', label: t('standings.alignment.heel') },
  ];

  const renderResults = () => {
    if (loading) return <Skeleton variant="table" className="standings-skeleton" />;

    if (error !== null) {
      return (
        <EmptyState
          title={t('common.error')}
          description={error || t('standings.loadFailed')}
          actionLabel={t('common.retry')}
          onAction={() => setReloadCount((count) => count + 1)}
        />
      );
    }

    if (!standings || standings.players.length === 0) {
      return <EmptyState title={t('standings.emptyTitle')} description={t('standings.noPlayers')} />;
    }

    if (rankedPlayers.length === 0) {
      return <EmptyState title={t('standings.noMatchesTitle')} description={t('standings.noMatchesHint')} />;
    }

    const firstListed = listedPlayers[0];
    const lastListed = listedPlayers[listedPlayers.length - 1];

    return (
      <>
        {podiumEntries.length > 0 && <Podium className="rank-podium" entries={podiumEntries} label={t('standings.topThree')} />}

        {firstListed && lastListed && (
          <section aria-label={t('standings.restOfTable')}>
            {podiumEntries.length > 0 && (
              <div className="standings-section-header">
                <h2 className="standings-section-header__title">{t('standings.restOfTable')}</h2>
                <span className="standings-section-header__range">
                  {t('standings.ranksRange', { from: firstListed.rank, to: lastListed.rank })}
                </span>
              </div>
            )}

            {isMobile ? (
              <ol className="standings-list">
                {listedPlayers.slice(0, visibleCount).map((player) => (
                  <li key={player.playerId}>
                    <Link to={`/player/${player.playerId}`} className="standings-row">
                      <span className="standings-rank">#{player.rank}</span>
                      <Avatar src={player.imageUrl} name={player.name} />
                      <span className="standings-row__names">
                        <span className="standings-row__name">{player.name}</span>
                        <span className="standings-row__wrestler">
                          {player.mainOverall !== undefined && `${t('standings.table.overall')} ${player.mainOverall} · `}
                          {player.currentWrestler}
                        </span>
                      </span>
                      <span className="standings-row__stats">
                        <span className="standings-row__record">{formatRecord(player)}</span>
                        <span className="standings-row__win-rate">{formatWinRate(player)}</span>
                        <span className="standings-row__form">
                          <Streak streak={player.currentStreak} />
                          {player.recentForm && player.recentForm.length > 0 && <RecentForm player={player} />}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <DataTable
                className="standings-table"
                caption={t('standings.title')}
                columns={columns}
                rows={listedPlayers}
                rowLimit={visibleCount}
                rowKey={(player) => player.playerId}
              />
            )}

            <ShowMore
              shown={Math.min(visibleCount, listedPlayers.length)}
              total={listedPlayers.length}
              onShowMore={() => showMore()}
            />
          </section>
        )}
      </>
    );
  };

  return (
    <div className="standings-page">
      <PageHeader
        eyebrow={seasonName}
        title={t('standings.title')}
        actions={(
          <>
            <Select
              className="standings-select"
              label={t('standings.alignment.label')}
              value={selectedAlignment}
              onValueChange={setSelectedAlignment}
              options={alignmentOptions}
            />
            {seasons.length > 0 && (
              <Select
                className="standings-select"
                id="season-select"
                label={t('standings.season')}
                value={selectedSeasonId}
                onValueChange={setSelectedSeasonId}
                options={seasonOptions}
              />
            )}
          </>
        )}
      />

      {divisions.length > 0 && (
        <div className="standings-divisions">
          <DivisionFilter
            divisions={divisions}
            selectedDivision={selectedDivision}
            onSelect={setSelectedDivision}
            labelKey="standings.filterByDivision"
            showNoDivision
          />
        </div>
      )}

      {renderResults()}
    </div>
  );
}
