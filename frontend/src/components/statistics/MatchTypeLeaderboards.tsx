import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { statisticsApi, seasonsApi } from '../../services/api';
import type { MatchTypeStatsEntry } from '../../services/api';
import type { Season } from '../../types';
import Skeleton from '../ui/Skeleton';
import SeasonSelector from './SeasonSelector';
import './Leaderboards.css';

function MatchTypeLeaderboards() {
  const { t } = useTranslation();
  const [activeType, setActiveType] = useState<string>('');
  const [leaderboards, setLeaderboards] = useState<Record<string, MatchTypeStatsEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState('');

  useEffect(() => {
    const abortController = new AbortController();
    seasonsApi.getAll(abortController.signal)
      .then(setSeasons)
      .catch((err: unknown) => {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Failed to load seasons', err);
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
          selectedSeasonId || undefined, abortController.signal
        );
        setLeaderboards(result.leaderboards);
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
  }, [selectedSeasonId]);

  const matchTypeLabelMap = useMemo<Record<string, string>>(() => ({
    singles: t('statistics.matchTypes.singles'),
    tag: t('statistics.matchTypes.tag'),
    ladder: t('statistics.matchTypes.ladder'),
    cage: t('statistics.matchTypes.cage'),
  }), [t]);

  const matchTypes = useMemo(
    () =>
      Object.keys(leaderboards).map((key) => ({
        key,
        label:
          matchTypeLabelMap[key] ||
          key
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase()),
      })),
    [leaderboards, matchTypeLabelMap]
  );

  useEffect(() => {
    if (matchTypes.length === 0) {
      if (activeType !== '') setActiveType('');
      return;
    }
    if (!activeType || !matchTypes.some((mt) => mt.key === activeType)) {
      setActiveType(matchTypes[0]?.key ?? '');
    }
  }, [matchTypes, activeType]);

  const entries = activeType ? (leaderboards[activeType] || []) : [];

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

      <div className="lb-tabs">
        {matchTypes.map((mt) => (
          <button
            key={mt.key}
            className={`lb-tab ${activeType === mt.key ? 'lb-tab-active' : ''}`}
            onClick={() => setActiveType(mt.key)}
          >
            {mt.label}
          </button>
        ))}
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
