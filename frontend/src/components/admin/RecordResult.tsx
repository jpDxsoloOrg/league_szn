import { useState, useEffect } from 'react';
import { matchesApi, playersApi } from '../../services/api';
import type { Match, Player } from '../../types';
import './RecordResult.css';

export default function RecordResult() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [winners, setWinners] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [matchesData, playersData] = await Promise.all([
        matchesApi.getAll({ status: 'scheduled' }),
        playersApi.getAll(),
      ]);
      setMatches(matchesData);
      setPlayers(playersData);
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const getPlayerName = (playerId: string) => {
    const player = players.find(p => p.playerId === playerId);
    return player ? `${player.name} (${player.currentWrestler})` : 'Unknown';
  };

  const handleMatchSelect = (match: Match) => {
    setSelectedMatch(match);
    setWinners([]);
    setError(null);
    setSuccess(null);
  };

  const handleWinnerToggle = (playerId: string) => {
    setWinners(prev =>
      prev.includes(playerId)
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
  };

  const handleSubmit = async () => {
    if (!selectedMatch) return;

    if (winners.length === 0) {
      setError('Please select at least one winner');
      return;
    }

    const losers = selectedMatch.participants.filter(p => !winners.includes(p));

    try {
      setError(null);
      await matchesApi.recordResult(selectedMatch.matchId, { winners, losers });
      setSuccess('Match result recorded successfully!');
      setSelectedMatch(null);
      setWinners([]);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record result');
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="record-result">
      <h2>Record Match Results</h2>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {matches.length === 0 ? (
        <div className="empty-state">
          <p>No scheduled matches to record results for.</p>
        </div>
      ) : (
        <div className="matches-result-grid">
          <div className="matches-list-section">
            <h3>Scheduled Matches</h3>
            <div className="scheduled-matches-list">
              {matches.map(match => (
                <div
                  key={match.matchId}
                  className={`match-item ${selectedMatch?.matchId === match.matchId ? 'selected' : ''}`}
                  onClick={() => handleMatchSelect(match)}
                >
                  <div className="match-item-header">
                    <span className="match-type">{match.matchType}</span>
                    {match.isChampionship && (
                      <span className="championship-badge">Championship</span>
                    )}
                  </div>
                  <div className="match-item-date">
                    {new Date(match.date).toLocaleString()}
                  </div>
                  {match.stipulation && (
                    <div className="match-stipulation">{match.stipulation}</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="result-entry-section">
            {selectedMatch ? (
              <>
                <h3>Record Result</h3>
                <div className="match-details">
                  <div className="detail-row">
                    <strong>Match Type:</strong> {selectedMatch.matchType}
                  </div>
                  {selectedMatch.stipulation && (
                    <div className="detail-row">
                      <strong>Stipulation:</strong> {selectedMatch.stipulation}
                    </div>
                  )}
                  <div className="detail-row">
                    <strong>Date:</strong> {new Date(selectedMatch.date).toLocaleString()}
                  </div>
                </div>

                <div className="participants-selection">
                  <h4>Select Winner(s)</h4>
                  <div className="participants-list">
                    {selectedMatch.participants.map(playerId => (
                      <div
                        key={playerId}
                        className={`participant-option ${winners.includes(playerId) ? 'winner' : ''}`}
                        onClick={() => handleWinnerToggle(playerId)}
                      >
                        <div className="participant-info">
                          {getPlayerName(playerId)}
                        </div>
                        {winners.includes(playerId) && (
                          <span className="winner-badge">Winner</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="result-actions">
                  <button onClick={handleSubmit} disabled={winners.length === 0}>
                    Record Result
                  </button>
                  <button onClick={() => setSelectedMatch(null)} className="cancel-btn">
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <p>Select a match to record its result</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
