import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { statisticsApi, seasonsApi, matchTypesApi, stipulationsApi } from '../../services/api';
import type { MatchTypeStatsEntry } from '../../services/api';
import type { Season, MatchType, Stipulation } from '../../types';
import Skeleton from '../ui/Skeleton';
import SeasonSelector from './SeasonSelector';
import './Leaderboards.css';

function MatchTypeLeaderboards() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<MatchTypeStatsEntry[]>([]);
  const [appliedFilters, setAppliedFilters] = useState<{
    matchTypeName?: string;
    stipulationName?: string;
  }>({});
  const [loading, setLoading] = useState(true);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [matchTypes, setMatchTypes] = useState<MatchType[]>([]);
  const [stipulations, setStipulations] = useState<Stipulation[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [selectedMatchTypeId, setSelectedMatchTypeId] = useState('');
  const [selectedStipulationId, setSelectedStipulationId] = useState('');

  useEffect(() => {
    const abortController = new AbortController();

    Promise.all([
      seasonsApi.getAll(abortController.signal),
      matchTypesApi.getAll(abortController.signal),
      stipulationsApi.getAll(abortController.signal),
    ])
      .then(([seasonsData, matchTypesData, stipulationsData]) => {
        setSeasons(seasonsData);
        setMatchTypes(matchTypesData);
        setStipulations(stipulationsData);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Failed to load filter data', err);
        }
      });

    return () => abortController.abort();
  }, []);

  useEffect(() => {
    const abortController = new AbortController();
    const fetchData = async () => {
      setLoading(true);
      try {
        const result = await statisticsApi.getMatchTypeLeaderboards(
          {
            seasonId: selectedSeasonId || undefined,
            matchTypeId: selectedMatchTypeId || undefined,
            stipulationId: selectedStipulationId || undefined,
          },
          abortController.signal
        );
        setEntries(result.leaderboard || []);
        setAppliedFilters({
          matchTypeName: result.appliedFilters?.matchTypeName,
          stipulationName: result.appliedFilters?.stipulationName,
        });
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Failed to load match type leaderboards', err);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    return () => abortController.abort();
  }, [selectedSeasonId, selectedMatchTypeId, selectedStipulationId]);

  const selectedMatchType = matchTypes.find((item) => item.matchTypeId === selectedMatchTypeId);
  const selectedStipulation = stipulations.find((item) => item.stipulationId === selectedStipulationId);
  const activeFilterLabel =
    appliedFilters.matchTypeName ||
    appliedFilters.stipulationName ||
    selectedMatchType?.name ||
    selectedStipulation?.name ||
    t('statistics.matchTypeLeaderboards.allFilters', 'All Match Types');

  function getMedalColor(rank: number): string | null {
    switch (rank) {
      case 1: return '#d4af37';
      case 2: return '#c0c0c0';
      case 3: return '#cd7f32';
      default: return null;
    }
  }

  function getMedalLabel(rank: number): string {
    switch (rank) {
      case 1: return '1st';
      case 2: return '2nd';
      case 3: return '3rd';
      default: return `${rank}th`;
    }
  }

  if (loading) {
    return (
      <div className="leaderboards">
        <h2>{t('statistics.matchTypeLeaderboards.title')}</h2>
        <Skeleton variant="table" count={8} />
      </div>
    );
  }

  return (
    <div className="leaderboards">
      <div className="lb-header">
        <h2>{t('statistics.matchTypeLeaderboards.title')}</h2>
        <div className="lb-nav-links">
          <Link to="/stats">{t('statistics.nav.playerStats')}</Link>
          <Link to="/stats/leaderboards">{t('statistics.nav.leaderboards')}</Link>
          <Link to="/stats/records">{t('statistics.nav.records')}</Link>
        </div>
      </div>

      <SeasonSelector
        seasons={seasons}
        selectedSeasonId={selectedSeasonId}
        onSeasonChange={setSelectedSeasonId}
      />

      <div className="lb-filters">
        <div className="lb-filter">
          <label htmlFor="match-type-filter">{t('statistics.labels.matchType')}</label>
          <select
            id="match-type-filter"
            value={selectedMatchTypeId}
            onChange={(e) => {
              setSelectedMatchTypeId(e.target.value);
              setSelectedStipulationId('');
            }}
          >
            <option value="">{t('common.all', 'All')}</option>
            {matchTypes.map((mt) => (
              <option key={mt.matchTypeId} value={mt.matchTypeId}>
                {mt.name}
              </option>
            ))}
          </select>
        </div>

        <div className="lb-filter">
          <label htmlFor="stipulation-filter">{t('statistics.labels.stipulation', 'Stipulation')}</label>
          <select
            id="stipulation-filter"
            value={selectedStipulationId}
            onChange={(e) => {
              setSelectedStipulationId(e.target.value);
              setSelectedMatchTypeId('');
            }}
          >
            <option value="">{t('common.all', 'All')}</option>
            {stipulations.map((stipulation) => (
              <option key={stipulation.stipulationId} value={stipulation.stipulationId}>
                {stipulation.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="lb-filter-summary">
        {t(
          'statistics.matchTypeLeaderboards.filteredBySimple',
          {
            defaultValue: 'Filtered by "{{filter}}".',
            filter: activeFilterLabel,
          }
        )}
      </div>

      <div className="lb-list">
        {entries.map((entry) => {
          const medalColor = getMedalColor(entry.rank);
          return (
            <div
              key={entry.playerId}
              className={`lb-entry ${medalColor ? 'lb-entry-medal' : ''}`}
              style={medalColor ? { borderLeftColor: medalColor } : undefined}
            >
              <div className="lb-rank" style={medalColor ? { color: medalColor } : undefined}>
                {entry.rank <= 3 ? (
                  <span className="lb-medal" style={{ backgroundColor: medalColor || undefined }}>
                    {getMedalLabel(entry.rank)}
                  </span>
                ) : (
                  <span className="lb-rank-num">{entry.rank}</span>
                )}
              </div>
              <div className="lb-player-info">
                <Link to={`/stats/player/${entry.playerId}`} className="lb-player-name">
                  {entry.playerName}
                </Link>
                <span className="lb-wrestler-name">{entry.wrestlerName}</span>
              </div>
              <div className="lb-value">
                {entry.winPercentage.toFixed(1)}%
              </div>
              <div className="lb-record">
                {entry.wins}-{entry.losses}-{entry.draws}
              </div>
            </div>
          );
        })}
        {entries.length === 0 && (
          <p>{t('statistics.matchTypeLeaderboards.noData')}</p>
        )}
      </div>
    </div>
  );
}

export default MatchTypeLeaderboards;
