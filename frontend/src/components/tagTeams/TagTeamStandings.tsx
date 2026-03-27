import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { tagTeamsApi } from '../../services/api';
import { logger } from '../../utils/logger';
import type { TagTeamStanding } from '../../types/tagTeam';
import Skeleton from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import './TagTeamStandings.css';

export default function TagTeamStandings() {
  const { t } = useTranslation();
  const [standings, setStandings] = useState<TagTeamStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchStandings = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await tagTeamsApi.getStandings(abortController.signal);
        if (!abortController.signal.aborted) {
          setStandings(data);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Failed to load tag team standings');
          setError(err.message || t('tagTeams.standings.error', 'Failed to load standings'));
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchStandings();
    return () => abortController.abort();
  }, [t]);

  if (loading) {
    return <Skeleton variant="table" className="tag-team-standings-skeleton" />;
  }

  if (error) {
    return (
      <div className="error">
        <p>{t('common.error', 'Error')}: {error}</p>
      </div>
    );
  }

  if (standings.length === 0) {
    return (
      <EmptyState
        title={t('tagTeams.standings.title', 'Tag Team Standings')}
        description={t('tagTeams.standings.empty', 'No tag team standings available yet.')}
      />
    );
  }

  return (
    <div className="tag-team-standings">
      <div className="tag-team-standings__table-wrapper">
        <table className="tag-team-standings__table">
          <thead>
            <tr>
              <th>{t('tagTeams.standings.rank', 'Rank')}</th>
              <th className="tag-team-standings__name-header">
                {t('tagTeams.standings.name', 'Name')}
              </th>
              <th>{t('tagTeams.standings.players', 'Players')}</th>
              <th>{t('tagTeams.standings.wins', 'W')}</th>
              <th>{t('tagTeams.standings.losses', 'L')}</th>
              <th>{t('tagTeams.standings.draws', 'D')}</th>
              <th>{t('tagTeams.standings.winPercent', 'Win%')}</th>
              <th>{t('tagTeams.standings.form', 'Form')}</th>
              <th>{t('tagTeams.standings.streak', 'Streak')}</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((team, index) => (
              <tr key={team.tagTeamId} className="tag-team-standings__row">
                <td className="rank">{index + 1}</td>
                <td className="tag-team-standings__name-cell">
                  <Link to={`/tag-teams/${team.tagTeamId}`} className="tag-team-standings__name-link">
                    {team.name}
                  </Link>
                </td>
                <td className="tag-team-standings__players-cell">
                  {team.player1Name} &amp; {team.player2Name}
                </td>
                <td className="wins">{team.wins}</td>
                <td className="losses">{team.losses}</td>
                <td className="draws">{team.draws}</td>
                <td className="win-percentage">{team.winPercentage.toFixed(1)}%</td>
                <td className="form-cell">
                  {team.recentForm && team.recentForm.length > 0 ? (
                    <span className="form-dots" aria-label={team.recentForm.join(', ')}>
                      {team.recentForm.map((result, i) => (
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
                  {team.currentStreak && team.currentStreak.count >= 3 ? (
                    <span
                      className={`streak-badge ${
                        team.currentStreak.type === 'W'
                          ? 'hot'
                          : team.currentStreak.type === 'L'
                            ? 'cold'
                            : 'neutral'
                      }`}
                    >
                      {team.currentStreak.count}
                      {team.currentStreak.type === 'W' ? 'W' : team.currentStreak.type === 'L' ? 'L' : 'D'}
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
