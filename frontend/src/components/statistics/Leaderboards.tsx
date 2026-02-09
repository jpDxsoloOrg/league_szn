import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { statisticsApi } from '../../services/api';
import type { LeaderboardEntry } from '../../types/statistics';
import './Leaderboards.css';

type CategoryKey = 'mostWins' | 'bestWinPercentage' | 'longestStreak' | 'mostChampionships' | 'longestReign';

function Leaderboards() {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('mostWins');
  const [timeframe, setTimeframe] = useState<'allTime' | 'season'>('allTime');
  const [leaderboards, setLeaderboards] = useState<Record<string, LeaderboardEntry[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const abortController = new AbortController();
    const fetchLeaderboards = async () => {
      setLoading(true);
      try {
        const result = await statisticsApi.getLeaderboards(abortController.signal);
        setLeaderboards(result.leaderboards);
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Failed to load leaderboards', err);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchLeaderboards();
    return () => abortController.abort();
  }, []);

  const categories: { key: CategoryKey; label: string }[] = [
    { key: 'mostWins', label: t('statistics.leaderboards.categories.mostWins') },
    { key: 'bestWinPercentage', label: t('statistics.leaderboards.categories.winPercentage') },
    { key: 'longestStreak', label: t('statistics.leaderboards.categories.streaks') },
    { key: 'mostChampionships', label: t('statistics.leaderboards.categories.championships') },
    { key: 'longestReign', label: t('statistics.leaderboards.categories.longestReign') },
  ];

  const entries: LeaderboardEntry[] = leaderboards[activeCategory] || [];

  const valueSuffix: Record<CategoryKey, string> = {
    mostWins: '',
    bestWinPercentage: '%',
    longestStreak: '',
    mostChampionships: '',
    longestReign: ` ${t('common.days')}`,
  };

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
        <h2>{t('statistics.leaderboards.title')}</h2>
        <p>{t('common.loading', 'Loading...')}</p>
      </div>
    );
  }

  return (
    <div className="leaderboards">
      <div className="lb-header">
        <h2>{t('statistics.leaderboards.title')}</h2>
        <div className="lb-nav-links">
          <Link to="/stats">{t('statistics.nav.playerStats')}</Link>
          <Link to="/stats/head-to-head">{t('statistics.nav.headToHead')}</Link>
          <Link to="/stats/records">{t('statistics.nav.records')}</Link>
        </div>
      </div>

      {/* Timeframe Toggle */}
      <div className="lb-timeframe-toggle">
        <button
          className={`lb-toggle-btn ${timeframe === 'allTime' ? 'lb-toggle-active' : ''}`}
          onClick={() => setTimeframe('allTime')}
        >
          {t('statistics.leaderboards.allTime')}
        </button>
        <button
          className={`lb-toggle-btn ${timeframe === 'season' ? 'lb-toggle-active' : ''}`}
          onClick={() => setTimeframe('season')}
        >
          {t('statistics.leaderboards.season')}
        </button>
      </div>

      {/* Category Tabs */}
      <div className="lb-tabs">
        {categories.map((cat) => (
          <button
            key={cat.key}
            className={`lb-tab ${activeCategory === cat.key ? 'lb-tab-active' : ''}`}
            onClick={() => setActiveCategory(cat.key)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Leaderboard List */}
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
                {typeof entry.value === 'number' && activeCategory === 'bestWinPercentage'
                  ? entry.value.toFixed(1)
                  : entry.value}
                {valueSuffix[activeCategory]}
              </div>
            </div>
          );
        })}
        {entries.length === 0 && (
          <p>{t('statistics.leaderboards.noData', 'No data available yet.')}</p>
        )}
      </div>
    </div>
  );
}

export default Leaderboards;
