import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { stablesApi } from '../../services/api';
import { logger } from '../../utils/logger';
import type { StableStanding } from '../../types/stable';
import {
  DEFAULT_WRESTLER_IMAGE,
  resolveImageSrc,
  applyImageFallback,
} from '../../constants/imageFallbacks';
import Skeleton from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import './StableStandings.css';

export default function StableStandings() {
  const { t } = useTranslation();
  const [standings, setStandings] = useState<StableStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchStandings = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await stablesApi.getStandings(abortController.signal);
        if (!abortController.signal.aborted) {
          setStandings(data);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Failed to load stable standings');
          setError(err.message || 'Failed to load stable standings');
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchStandings();
    return () => abortController.abort();
  }, []);

  if (loading) {
    return <Skeleton variant="table" count={6} className="stable-standings-skeleton" />;
  }

  if (error) {
    return (
      <div className="error">
        <p>{t('common.error', 'Error')}: {error}</p>
        <button onClick={() => window.location.reload()}>{t('common.retry', 'Retry')}</button>
      </div>
    );
  }

  if (standings.length === 0) {
    return (
      <EmptyState
        title={t('stables.standings', 'Stable Standings')}
        description={t('stables.noStandings', 'No stable standings data yet.')}
      />
    );
  }

  return (
    <div className="stable-standings-container">
      <div className="stable-standings-table-wrapper">
        <table className="stable-standings-table">
          <thead>
            <tr>
              <th>{t('standings.table.rank', 'Rank')}</th>
              <th className="stable-standings-image-header">&nbsp;</th>
              <th>{t('stables.name', 'Name')}</th>
              <th>{t('stables.members', 'Members')}</th>
              <th>{t('standings.table.wins', 'W')}</th>
              <th>{t('standings.table.losses', 'L')}</th>
              <th>{t('standings.table.draws', 'D')}</th>
              <th>{t('standings.table.winPercent', 'Win%')}</th>
              <th>{t('standings.table.form', 'Form')}</th>
              <th>{t('standings.table.streak', 'Streak')}</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((standing, index) => (
              <tr key={standing.stableId}>
                <td className="rank">{index + 1}</td>
                <td className="stable-standings-image-cell">
                  <img
                    src={resolveImageSrc(standing.imageUrl, DEFAULT_WRESTLER_IMAGE)}
                    onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
                    alt={standing.name}
                    className="stable-standings-thumbnail"
                  />
                </td>
                <td className="stable-standings-name">
                  <Link to={`/stables/${standing.stableId}`} className="stable-standings-name-link">
                    {standing.name}
                  </Link>
                </td>
                <td className="stable-standings-member-count">{standing.memberCount}</td>
                <td className="wins">{standing.wins}</td>
                <td className="losses">{standing.losses}</td>
                <td className="draws">{standing.draws}</td>
                <td className="win-percentage">{standing.winPercentage.toFixed(1)}%</td>
                <td className="form-cell">
                  {standing.recentForm && standing.recentForm.length > 0 ? (
                    <span className="form-dots" aria-label={standing.recentForm.join(', ')}>
                      {standing.recentForm.map((result, i) => (
                        <span
                          key={i}
                          className={`form-dot ${result === 'W' ? 'win' : result === 'L' ? 'loss' : 'draw'}`}
                          title={result === 'W' ? 'Win' : result === 'L' ? 'Loss' : 'Draw'}
                        />
                      ))}
                    </span>
                  ) : (
                    <span className="form-empty">-</span>
                  )}
                </td>
                <td className="streak-cell">
                  {standing.currentStreak && standing.currentStreak.count >= 3 ? (
                    <span
                      className={`streak-badge ${standing.currentStreak.type === 'W' ? 'hot' : standing.currentStreak.type === 'L' ? 'cold' : 'neutral'}`}
                    >
                      {standing.currentStreak.count}
                      {standing.currentStreak.type === 'W' ? 'W' : standing.currentStreak.type === 'L' ? 'L' : 'D'}
                    </span>
                  ) : (
                    <span className="streak-empty">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
