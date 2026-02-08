import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { fantasyApi, seasonsApi } from '../../services/api';
import type { FantasyLeaderboardEntry } from '../../types/fantasy';
import type { Season } from '../../types';
import './FantasyLeaderboard.css';

export default function FantasyLeaderboard() {
  const { t } = useTranslation();
  const [leaderboard, setLeaderboard] = useState<FantasyLeaderboardEntry[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const itemsPerPage = 10;

  // Fetch seasons and identify current user on mount
  useEffect(() => {
    const controller = new AbortController();

    const fetchInitialData = async () => {
      try {
        const [seasonsData, myPicks] = await Promise.all([
          seasonsApi.getAll(controller.signal),
          fantasyApi.getAllMyPicks(controller.signal).catch(() => []),
        ]);

        setSeasons(seasonsData);

        // Find active season
        const activeSeason = seasonsData.find((s) => s.status === 'active');
        if (activeSeason) {
          setSelectedSeasonId(activeSeason.seasonId);
        }

        // Get current user's fantasyUserId from their picks
        const firstPick = myPicks[0];
        if (firstPick) {
          setCurrentUserId(firstPick.fantasyUserId);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error('Failed to load initial data:', err);
      }
    };

    fetchInitialData();

    return () => controller.abort();
  }, []);

  // Fetch leaderboard when season changes
  useEffect(() => {
    const controller = new AbortController();

    const fetchLeaderboard = async () => {
      try {
        setLoading(true);
        const data = await fantasyApi.getLeaderboard(
          selectedSeasonId || undefined,
          controller.signal
        );
        setLeaderboard(data);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error('Failed to load leaderboard:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();

    return () => controller.abort();
  }, [selectedSeasonId]);

  const totalPages = Math.ceil(leaderboard.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedLeaderboard = leaderboard.slice(startIndex, startIndex + itemsPerPage);

  const currentUserRank = currentUserId
    ? leaderboard.find((entry) => entry.fantasyUserId === currentUserId)?.rank
    : undefined;

  const currentUserPoints = currentUserId
    ? leaderboard.find((entry) => entry.fantasyUserId === currentUserId)?.currentSeasonPoints
    : undefined;

  return (
    <div className="fantasy-leaderboard">
      <header className="leaderboard-header">
        <h1>{t('fantasy.leaderboard.title')}</h1>
        <div className="season-selector">
          <label htmlFor="season-select">{t('fantasy.leaderboard.season')}:</label>
          <select
            id="season-select"
            value={selectedSeasonId}
            onChange={(e) => {
              setSelectedSeasonId(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="">{t('fantasy.leaderboard.allSeasons', 'All Seasons')}</option>
            {seasons.map((season) => (
              <option key={season.seasonId} value={season.seasonId}>
                {season.name} {season.status === 'active' ? `(${t('common.active')})` : ''}
              </option>
            ))}
          </select>
        </div>
      </header>

      {currentUserRank && (
        <div className="your-rank-banner">
          <span className="rank-label">{t('fantasy.leaderboard.yourRank')}:</span>
          <span className="rank-value">#{currentUserRank}</span>
          <span className="rank-points">
            {currentUserPoints} {t('fantasy.leaderboard.pts')}
          </span>
        </div>
      )}

      {loading ? (
        <div className="loading-state">
          <div className="spinner" />
          <p>{t('common.loading')}</p>
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="empty-state">
          <p>{t('fantasy.leaderboard.noEntries', 'No leaderboard entries yet. Complete an event with picks to see rankings!')}</p>
        </div>
      ) : (
        <>
          <div className="leaderboard-table-wrapper">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th className="col-rank">{t('fantasy.leaderboard.rank')}</th>
                  <th className="col-player">{t('fantasy.leaderboard.player')}</th>
                  <th className="col-points">{t('fantasy.leaderboard.points')}</th>
                  <th className="col-perfect">{t('fantasy.leaderboard.perfect')}</th>
                  <th className="col-streak">{t('fantasy.leaderboard.streak')}</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLeaderboard.map((entry) => {
                  const isCurrentUser = currentUserId !== null && entry.fantasyUserId === currentUserId;
                  return (
                    <tr key={entry.fantasyUserId} className={isCurrentUser ? 'current-user' : ''}>
                      <td className="col-rank">
                        <span className={`rank rank-${entry.rank}`}>
                          {entry.rank <= 3 ? getMedalEmoji(entry.rank) : `#${entry.rank}`}
                        </span>
                      </td>
                      <td className="col-player">
                        <span className="username">{entry.username}</span>
                        {isCurrentUser && <span className="you-badge">{t('fantasy.leaderboard.you')}</span>}
                      </td>
                      <td className="col-points">
                        <span className="points-value">{entry.currentSeasonPoints}</span>
                      </td>
                      <td className="col-perfect">
                        {entry.perfectPicks > 0 ? (
                          <span className="perfect-count">{entry.perfectPicks}</span>
                        ) : (
                          <span className="no-value">-</span>
                        )}
                      </td>
                      <td className="col-streak">
                        {entry.currentStreak > 0 ? (
                          <span className="streak-value">
                            {entry.currentStreak >= 3 && '🔥'} {entry.currentStreak}
                          </span>
                        ) : (
                          <span className="no-value">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="page-btn"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                {t('common.previous')}
              </button>
              <span className="page-info">
                {t('fantasy.leaderboard.pageOf', { current: currentPage, total: totalPages })}
              </span>
              <button
                className="page-btn"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                {t('common.next')}
              </button>
            </div>
          )}
        </>
      )}

      <div className="leaderboard-legend">
        <h3>{t('fantasy.leaderboard.legend')}</h3>
        <ul>
          <li>
            <span className="legend-icon">⭐</span>
            {t('fantasy.leaderboard.perfectDescription')}
          </li>
          <li>
            <span className="legend-icon">🔥</span>
            {t('fantasy.leaderboard.streakDescription')}
          </li>
        </ul>
      </div>
    </div>
  );
}

function getMedalEmoji(rank: number): string {
  switch (rank) {
    case 1:
      return '🥇';
    case 2:
      return '🥈';
    case 3:
      return '🥉';
    default:
      return `#${rank}`;
  }
}
