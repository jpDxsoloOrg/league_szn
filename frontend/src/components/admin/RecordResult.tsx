import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { matchesApi, playersApi } from '../../services/api';
import type { Match, Player } from '../../types';
import './RecordResult.css';

export default function RecordResult() {
  const { t } = useTranslation();
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [winners, setWinners] = useState<string[]>([]);
  const [winningTeamIndex, setWinningTeamIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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
    } catch (_err) {
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
    setWinningTeamIndex(null);
    setError(null);
    setSuccess(null);
  };

  const isTagTeamMatch = selectedMatch?.teams && selectedMatch.teams.length >= 2;

  const handleWinnerToggle = (playerId: string) => {
    setWinners(prev =>
      prev.includes(playerId)
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
  };

  const handleTeamWinnerSelect = (teamIndex: number) => {
    if (!selectedMatch?.teams) return;

    if (winningTeamIndex === teamIndex) {
      // Deselect this team
      setWinningTeamIndex(null);
      setWinners([]);
    } else {
      // Select this team as winner
      setWinningTeamIndex(teamIndex);
      setWinners(selectedMatch.teams[teamIndex]);
    }
  };

  const getPlayerNameShort = (playerId: string): string => {
    const player = players.find(p => p.playerId === playerId);
    return player ? player.name : t('common.unknown');
  };

  const handleSubmit = async () => {
    if (!selectedMatch || submitting) return;

    setSubmitting(true);

    if (isTagTeamMatch) {
      // Tag team match validation
      if (winningTeamIndex === null || winners.length === 0) {
        setError(t('recordResult.selectWinningTeam'));
        return;
      }

      // All non-winning team members are losers
      const losers = selectedMatch.participants.filter(p => !winners.includes(p));

      try {
        setError(null);
        await matchesApi.recordResult(selectedMatch.matchId, {
          winners,
          losers,
          winningTeam: winningTeamIndex
        });
        setSuccess(t('recordResult.success'));
        setSelectedMatch(null);
        setWinners([]);
        setWinningTeamIndex(null);
        await loadData();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('recordResult.error'));
      } finally {
        setSubmitting(false);
      }
    } else {
      // Standard match validation
      if (winners.length === 0) {
        setError(t('recordResult.selectWinner'));
        return;
      }

      const losers = selectedMatch.participants.filter(p => !winners.includes(p));

      try {
        setError(null);
        await matchesApi.recordResult(selectedMatch.matchId, { winners, losers });
        setSuccess(t('recordResult.success'));
        setSelectedMatch(null);
        setWinners([]);
        await loadData();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('recordResult.error'));
      } finally {
        setSubmitting(false);
      }
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
                  {isTagTeamMatch ? (
                    <>
                      <h4>{t('recordResult.selectWinningTeamTitle')}</h4>
                      <div className="teams-list">
                        {selectedMatch.teams!.map((team, teamIndex) => (
                          <div
                            key={teamIndex}
                            className={`team-option ${winningTeamIndex === teamIndex ? 'winner' : ''}`}
                            onClick={() => handleTeamWinnerSelect(teamIndex)}
                          >
                            <div className="team-info">
                              <div className="team-label">{t('recordResult.team')} {teamIndex + 1}</div>
                              <div className="team-members-list">
                                {team.map(playerId => (
                                  <span key={playerId} className="team-member-name">
                                    {getPlayerNameShort(playerId)}
                                  </span>
                                ))}
                              </div>
                            </div>
                            {winningTeamIndex === teamIndex && (
                              <span className="winner-badge">{t('recordResult.winner')}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <h4>{t('recordResult.selectWinners')}</h4>
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
                              <span className="winner-badge">{t('recordResult.winner')}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="result-actions">
                  <button onClick={handleSubmit} disabled={winners.length === 0 || submitting}>
                    {submitting ? 'Recording...' : 'Record Result'}
                  </button>
                  <button onClick={() => setSelectedMatch(null)} className="cancel-btn" disabled={submitting}>
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
