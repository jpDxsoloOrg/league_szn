import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { tournamentsApi, playersApi } from '../services/api';
import type { Tournament, Player } from '../types';
import Skeleton from './ui/Skeleton';
import EmptyState from './ui/EmptyState';
import './Tournaments.css';

export default function Tournaments() {
  const { t } = useTranslation();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reload data when retry button is clicked
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [tournamentData, playerData] = await Promise.all([
        tournamentsApi.getAll(),
        playersApi.getAll(),
      ]);
      setTournaments(tournamentData);
      setPlayers(playerData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tournaments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [tournamentData, playerData] = await Promise.all([
          tournamentsApi.getAll(abortController.signal),
          playersApi.getAll(abortController.signal),
        ]);
        if (!abortController.signal.aborted) {
          setTournaments(tournamentData);
          setPlayers(playerData);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err.message || 'Failed to load tournaments');
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchData();
    return () => abortController.abort();
  }, []);

  useEffect(() => {
    if (!selectedTournament) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedTournament(null);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [selectedTournament]);

  const getPlayerName = (playerId: string) => {
    const player = players.find(p => p.playerId === playerId);
    return player ? player.name : t('common.unknown');
  };

  const getStatusBadge = (status: string) => {
    const classMap = {
      upcoming: 'status-upcoming',
      'in-progress': 'status-in-progress',
      completed: 'status-completed',
    };
    const statusLabels: Record<string, string> = {
      upcoming: t('tournaments.statusUpcoming'),
      'in-progress': t('tournaments.statusInProgress'),
      completed: t('tournaments.statusCompleted'),
    };
    return <span className={`status-badge ${classMap[status as keyof typeof classMap]}`}>{statusLabels[status] || status}</span>;
  };

  const renderRoundRobinStandings = (tournament: Tournament) => {
    if (!tournament.standings) return null;

    const standingsArray = Object.entries(tournament.standings).map(([playerId, stats]) => ({
      playerId,
      ...stats,
    }));

    // Sort by points descending
    standingsArray.sort((a, b) => b.points - a.points);

    return (
      <div className="round-robin-standings">
        <h4>{t('tournaments.standings')}</h4>
        <table>
          <thead>
            <tr>
              <th>{t('tournaments.table.rank')}</th>
              <th>{t('tournaments.table.player')}</th>
              <th>{t('tournaments.table.w')}</th>
              <th>{t('tournaments.table.l')}</th>
              <th>{t('tournaments.table.d')}</th>
              <th>{t('tournaments.table.points')}</th>
            </tr>
          </thead>
          <tbody>
            {standingsArray.map((standing, index) => (
              <tr key={standing.playerId}>
                <td>{index + 1}</td>
                <td>{getPlayerName(standing.playerId)}</td>
                <td className="wins">{standing.wins}</td>
                <td className="losses">{standing.losses}</td>
                <td className="draws">{standing.draws}</td>
                <td className="points">{standing.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderBracket = (tournament: Tournament) => {
    if (!tournament.brackets) return null;

    return (
      <div className="bracket">
        <h4>{t('tournaments.bracket')}</h4>
        {tournament.brackets.rounds.map((round) => (
          <div key={round.roundNumber} className="bracket-round">
            <h5>{t('tournaments.round')} {round.roundNumber}</h5>
            <div className="bracket-matches">
              {round.matches.map((match, idx) => (
                <div key={idx} className="bracket-match">
                  <div className="bracket-participant">
                    {match.participant1 ? getPlayerName(match.participant1) : t('common.tbd')}
                    {match.winner === match.participant1 && <span className="winner-indicator">✓</span>}
                  </div>
                  <div className="vs">{t('common.vs')}</div>
                  <div className="bracket-participant">
                    {match.participant2 ? getPlayerName(match.participant2) : t('common.tbd')}
                    {match.winner === match.participant2 && <span className="winner-indicator">✓</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return <Skeleton variant="cards" />;
  }

  if (error) {
    return (
      <div className="error">
        <p>{t('common.error')}: {error}</p>
        <button onClick={loadData}>{t('common.retry')}</button>
      </div>
    );
  }

  if (tournaments.length === 0) {
    return (
      <EmptyState
        title={t('tournaments.title')}
        description={t('tournaments.noTournaments')}
      />
    );
  }

  return (
    <div className="tournaments-container">
      <h2>{t('tournaments.title')}</h2>

      <div className="tournaments-grid">
        {tournaments.map((tournament) => (
          <div key={tournament.tournamentId} className="tournament-card">
            <div className="tournament-header">
              <h3>{tournament.name}</h3>
              {getStatusBadge(tournament.status)}
            </div>

            <div className="tournament-info">
              <p>
                <strong>{t('tournaments.type')}:</strong>{' '}
                {tournament.type === 'single-elimination' ? t('tournaments.singleElimination') : t('tournaments.roundRobin')}
              </p>
              <p>
                <strong>{t('tournaments.participants')}:</strong> {tournament.participants.length}
              </p>
              {tournament.winner && (
                <p className="tournament-winner">
                  <strong>{t('tournaments.winner')}:</strong> {getPlayerName(tournament.winner)}
                </p>
              )}
            </div>

            <button
              onClick={() => setSelectedTournament(tournament)}
              className="view-details-btn"
            >
              {t('tournaments.viewDetails')}
            </button>
          </div>
        ))}
      </div>

      {selectedTournament && (
        <div
          className="tournament-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tournament-modal-title"
          onClick={() => setSelectedTournament(null)}
        >
          <div className="tournament-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 id="tournament-modal-title">{selectedTournament.name}</h3>
              <button
                onClick={() => setSelectedTournament(null)}
                className="close-btn"
                aria-label={t('common.closeModal') || 'Close modal'}
              >
                ×
              </button>
            </div>

            <div className="tournament-details">
              <p>
                <strong>{t('tournaments.type')}:</strong>{' '}
                {selectedTournament.type === 'single-elimination' ? t('tournaments.singleElimination') : t('tournaments.roundRobin')}
              </p>
              <p>
                <strong>{t('tournaments.status')}:</strong> {getStatusBadge(selectedTournament.status)}
              </p>
              <p>
                <strong>{t('tournaments.participants')}:</strong>
              </p>
              <ul className="participants-list">
                {selectedTournament.participants.map((playerId) => (
                  <li key={playerId}>{getPlayerName(playerId)}</li>
                ))}
              </ul>
            </div>

            {selectedTournament.type === 'round-robin'
              ? renderRoundRobinStandings(selectedTournament)
              : renderBracket(selectedTournament)}
          </div>
        </div>
      )}
    </div>
  );
}
