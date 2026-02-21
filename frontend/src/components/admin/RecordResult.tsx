import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { matchesApi, playersApi, eventsApi, stipulationsApi } from '../../services/api';
import type { Match, Player, Stipulation } from '../../types';
import type { LeagueEvent } from '../../types/event';
import SearchableSelect from './SearchableSelect';
import Skeleton from '../ui/Skeleton';
import './RecordResult.css';

const STANDALONE_FILTER = '__standalone__';

export default function RecordResult() {
  const { t } = useTranslation();
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<LeagueEvent[]>([]);
  const [stipulations, setStipulations] = useState<Stipulation[]>([]);
  const [selectedEventFilter, setSelectedEventFilter] = useState<string>('');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [winners, setWinners] = useState<string[]>([]);
  const [winningTeamIndex, setWinningTeamIndex] = useState<number | null>(null);
  const [starRating, setStarRating] = useState<number | ''>('');
  const [matchOfTheNight, setMatchOfTheNight] = useState(false);
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
      const [matchesData, playersData, eventsData, stipulationsData] = await Promise.all([
        matchesApi.getAll({ status: 'scheduled' }),
        playersApi.getAll(),
        eventsApi.getAll(),
        stipulationsApi.getAll(),
      ]);
      setMatches(matchesData);
      setPlayers(playersData);
      setStipulations(stipulationsData);

      // Only show events that have scheduled matches or are upcoming/in-progress
      const activeEvents = eventsData
        .filter(e => e.status === 'upcoming' || e.status === 'in-progress')
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setEvents(activeEvents);

      // Default to earliest upcoming/in-progress event that has scheduled matches
      const matchIdSet = new Set(matchesData.map(m => m.matchId));
      const defaultEvent = activeEvents.find(ev =>
        (ev.matchCards || []).some(card => matchIdSet.has(card.matchId))
      );
      setSelectedEventFilter(prev => prev || (defaultEvent?.eventId || STANDALONE_FILTER));
    } catch (_err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Build a map of matchId -> eventId for quick lookup
  const matchEventMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const ev of events) {
      for (const card of ev.matchCards || []) {
        map.set(card.matchId, ev.eventId);
      }
    }
    return map;
  }, [events]);

  // Build a map of matchId -> designation for display
  const matchDesignationMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const ev of events) {
      for (const card of ev.matchCards || []) {
        map.set(card.matchId, card.designation);
      }
    }
    return map;
  }, [events]);

  // Build a map of stipulationId -> name for display
  const stipulationMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of stipulations) {
      map.set(s.stipulationId, s.name);
    }
    return map;
  }, [stipulations]);

  // Filter matches based on selected event
  const filteredMatches = useMemo(() => {
    if (selectedEventFilter === STANDALONE_FILTER) {
      return matches.filter(m => !matchEventMap.has(m.matchId));
    }
    if (selectedEventFilter) {
      const selectedEvent = events.find(e => e.eventId === selectedEventFilter);
      if (selectedEvent) {
        const eventMatchIds = new Set((selectedEvent.matchCards || []).map(c => c.matchId));
        // Preserve match card order by sorting by position
        const positionMap = new Map<string, number>();
        for (const card of selectedEvent.matchCards || []) {
          positionMap.set(card.matchId, card.position);
        }
        return matches
          .filter(m => eventMatchIds.has(m.matchId))
          .sort((a, b) => (positionMap.get(a.matchId) || 0) - (positionMap.get(b.matchId) || 0));
      }
    }
    return matches;
  }, [matches, selectedEventFilter, events, matchEventMap]);

  const getPlayerName = (playerId: string) => {
    const player = players.find(p => p.playerId === playerId);
    return player ? `${player.name} (${player.currentWrestler})` : 'Unknown';
  };

  const getStipulationName = (stipulationId: string): string => {
    return stipulationMap.get(stipulationId) || stipulationId;
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
      const team = selectedMatch.teams[teamIndex];
      setWinners(team ?? []);
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
        const payload: { winners: string[]; losers: string[]; winningTeam: number; starRating?: number; matchOfTheNight?: boolean } = {
          winners,
          losers,
          winningTeam: winningTeamIndex,
        };
        if (starRating !== '') payload.starRating = starRating as number;
        if (matchOfTheNight) payload.matchOfTheNight = true;
        await matchesApi.recordResult(selectedMatch.matchId, payload);
        setSuccess(t('recordResult.success'));
        setSelectedMatch(null);
        setWinners([]);
        setWinningTeamIndex(null);
        setStarRating('');
        setMatchOfTheNight(false);
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
        const payload: { winners: string[]; losers: string[]; starRating?: number; matchOfTheNight?: boolean } = { winners, losers };
        if (starRating !== '') payload.starRating = starRating as number;
        if (matchOfTheNight) payload.matchOfTheNight = true;
        await matchesApi.recordResult(selectedMatch.matchId, payload);
        setSuccess(t('recordResult.success'));
        setSelectedMatch(null);
        setWinners([]);
        setStarRating('');
        setMatchOfTheNight(false);
        await loadData();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('recordResult.error'));
      } finally {
        setSubmitting(false);
      }
    }
  };

  if (loading) {
    return <Skeleton variant="block" count={4} />;
  }

  return (
    <div className="record-result">
      <h2>Record Match Results</h2>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <div className="event-filter-bar">
        <div className="event-filter-labels">
          <label htmlFor="eventFilter">Event</label>
          <small>
            Select an event to record card results, or use standalone matches for unslotted bouts.{' '}
            <Link to="/guide/wiki/admin-record-results">Learn more</Link>
          </small>
        </div>
        <SearchableSelect
          id="eventFilter"
          value={selectedEventFilter}
          onChange={(value) => {
            setSelectedEventFilter(value);
            setSelectedMatch(null);
            setWinners([]);
            setWinningTeamIndex(null);
          }}
          placeholder="Select an event..."
          options={[
            ...events.map(ev => ({
              value: ev.eventId,
              label: `${ev.name} (${new Date(ev.date).toLocaleDateString()})`,
            })),
            { value: STANDALONE_FILTER, label: 'Standalone Matches (No Event)' },
          ]}
        />
      </div>

      {filteredMatches.length === 0 ? (
        <div className="empty-state">
          <p>No scheduled matches{selectedEventFilter === STANDALONE_FILTER ? ' outside of events' : ' for this event'}.</p>
        </div>
      ) : (
        <div className="matches-result-grid">
          <div className="matches-list-section">
            <h3>Scheduled Matches ({filteredMatches.length})</h3>
            <div className="scheduled-matches-list">
              {filteredMatches.map(match => {
                const designation = matchDesignationMap.get(match.matchId);
                return (
                  <div
                    key={match.matchId}
                    className={`match-item ${selectedMatch?.matchId === match.matchId ? 'selected' : ''}`}
                    onClick={() => handleMatchSelect(match)}
                  >
                    <div className="match-item-header">
                      <span className="match-type">{match.matchFormat}</span>
                      <div className="match-badges">
                        {designation && (
                          <span className="designation-badge">{designation.replace('-', ' ')}</span>
                        )}
                        {match.isChampionship && (
                          <span className="championship-badge">Championship</span>
                        )}
                      </div>
                    </div>
                    <div className="match-participants-preview">
                      {match.participants.map((pid, i) => (
                        <span key={pid}>
                          {getPlayerNameShort(pid)}{i < match.participants.length - 1 ? ' vs ' : ''}
                        </span>
                      ))}
                    </div>
                    {match.stipulationId && (
                      <div className="match-stipulation">{getStipulationName(match.stipulationId)}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="result-entry-section">
            {selectedMatch ? (
              <>
                <h3>Record Result</h3>
                <div className="match-details">
                  <div className="detail-row">
                    <strong>Match Type:</strong> {selectedMatch.matchFormat}
                  </div>
                  {selectedMatch.stipulationId && (
                    <div className="detail-row">
                      <strong>Stipulation:</strong> {getStipulationName(selectedMatch.stipulationId)}
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

                <div className="rating-awards-block">
                  <div className="star-rating-row">
                    <span className="star-rating-label">{t('match.starRating')}</span>
                    <div className="star-rating-stars" role="group" aria-label={t('match.starRating')}>
                      {[1, 2, 3, 4, 5].map((value) => (
                        <button
                          key={value}
                          type="button"
                          className={`star-btn ${typeof starRating === 'number' && starRating >= value ? 'filled' : ''}`}
                          onClick={() => setStarRating(starRating === value ? '' : value)}
                          title={`${value} ${value === 1 ? 'star' : 'stars'}`}
                          aria-pressed={typeof starRating === 'number' && starRating >= value}
                        >
                          {typeof starRating === 'number' && starRating >= value ? '\u2605' : '\u2606'}
                        </button>
                      ))}
                    </div>
                    {starRating !== '' && (
                      <button
                        type="button"
                        className="star-rating-clear"
                        onClick={() => setStarRating('')}
                      >
                        {t('match.clearRating')}
                      </button>
                    )}
                  </div>
                  <div className="motn-row">
                    <label className="motn-label">
                      <input
                        type="checkbox"
                        checked={matchOfTheNight}
                        onChange={(e) => setMatchOfTheNight(e.target.checked)}
                        className="motn-checkbox"
                      />
                      <span className="motn-text">{t('match.matchOfTheNight')}</span>
                    </label>
                  </div>
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
