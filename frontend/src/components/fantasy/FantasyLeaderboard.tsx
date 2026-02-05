import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mockFantasyLeaderboard, mockSeasons, mockCurrentFantasyUser } from '../../mocks/fantasyMockData';
import './FantasyLeaderboard.css';

export default function FantasyLeaderboard() {
  const { t } = useTranslation();
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>(
    mockSeasons.find((s) => s.status === 'active')?.seasonId || ''
  );
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const leaderboard = mockFantasyLeaderboard;
  const totalPages = Math.ceil(leaderboard.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedLeaderboard = leaderboard.slice(startIndex, startIndex + itemsPerPage);

  const currentUserRank = leaderboard.find(
    (entry) => entry.fantasyUserId === mockCurrentFantasyUser.fantasyUserId
  )?.rank;

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
            {mockSeasons.map((season) => (
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
            {mockCurrentFantasyUser.currentSeasonPoints} {t('fantasy.leaderboard.pts')}
          </span>
        </div>
      )}

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
              const isCurrentUser = entry.fantasyUserId === mockCurrentFantasyUser.fantasyUserId;
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
