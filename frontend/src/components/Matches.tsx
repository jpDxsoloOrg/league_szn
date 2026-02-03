import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { matchesApi, playersApi } from '../services/api';
import type { Match, Player } from '../types';
import './Matches.css';

export default function Matches() {
  const { t } = useTranslation();
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [filter, setFilter] = useState<'all' | 'scheduled' | 'completed'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [filter]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [matchData, playerData] = await Promise.all([
        matchesApi.getAll(filter === 'all' ? {} : { status: filter }),
        playersApi.getAll(),
      ]);
      setMatches(matchData);
      setPlayers(playerData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load matches');
    } finally {
      setLoading(false);
    }
  };

  const getPlayerName = (playerId: string) => {
    const player = players.find(p => p.playerId === playerId);
    return player ? player.name : t('common.unknown');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getMatchResult = (match: Match) => {
    if (match.status === 'scheduled') {
      return <span className="status-scheduled">{t('common.scheduled')}</span>;
    }

    if (!match.winners || !match.losers) {
      return <span className="status-completed">{t('common.completed')}</span>;
    }

    const winners = match.winners.map(getPlayerName).join(', ');
    const losers = match.losers.map(getPlayerName).join(', ');

    return (
      <div className="match-result">
        <div className="winners">
          <strong>{match.winners.length > 1 ? t('matches.winners') : t('matches.winner')}:</strong> {winners}
        </div>
        <div className="losers">
          <strong>{match.losers.length > 1 ? t('matches.losers') : t('matches.loser')}:</strong> {losers}
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="loading">{t('matches.loading')}</div>;
  }

  if (error) {
    return (
      <div className="error">
        <p>{t('common.error')}: {error}</p>
        <button onClick={loadData}>{t('common.retry')}</button>
      </div>
    );
  }

  return (
    <div className="matches-container">
      <div className="matches-header">
        <h2>{t('matches.title')}</h2>
        <div className="filter-buttons">
          <button
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            {t('matches.filters.all')}
          </button>
          <button
            className={filter === 'scheduled' ? 'active' : ''}
            onClick={() => setFilter('scheduled')}
          >
            {t('matches.filters.scheduled')}
          </button>
          <button
            className={filter === 'completed' ? 'active' : ''}
            onClick={() => setFilter('completed')}
          >
            {t('matches.filters.completed')}
          </button>
        </div>
      </div>

      {matches.length === 0 ? (
        <div className="empty-state">
          <p>{t('matches.noMatches')}</p>
        </div>
      ) : (
        <div className="matches-list">
          {matches.map((match) => (
            <div key={match.matchId} className="match-card">
              <div className="match-header">
                <div className="match-info">
                  <h3>{match.matchType}</h3>
                  {match.stipulation && (
                    <span className="stipulation">{match.stipulation}</span>
                  )}
                  {match.isChampionship && (
                    <span className="championship-badge">{t('matches.championship')}</span>
                  )}
                </div>
                <div className="match-date">{formatDate(match.date)}</div>
              </div>

              <div className="match-participants">
                <strong>{t('matches.participants')}:</strong>{' '}
                {match.participants.map(getPlayerName).join(', ')}
              </div>

              <div className="match-result-section">
                {getMatchResult(match)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
