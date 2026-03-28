import { useState, useEffect, useRef, FormEvent } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { matchesApi, playersApi, championshipsApi, tournamentsApi, seasonsApi, eventsApi, stipulationsApi, matchTypesApi, tagTeamsApi, divisionsApi } from '../../services/api';
import type { Match, Player, Championship, Tournament, Season, Stipulation, MatchType, Division } from '../../types';
import type { TagTeam } from '../../types/tagTeam';
import type { LeagueEvent, MatchDesignation } from '../../types/event';
import SearchableSelect from './SearchableSelect';
import Skeleton from '../ui/Skeleton';
import './ScheduleMatch.css';

export default function EditMatch() {
  const { t } = useTranslation();
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const [originalMatch, setOriginalMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [events, setEvents] = useState<LeagueEvent[]>([]);
  const [stipulations, setStipulations] = useState<Stipulation[]>([]);
  const [matchTypes, setMatchTypes] = useState<MatchType[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [divisionFilter, setDivisionFilter] = useState<string>('');
  const [activeTagTeams, setActiveTagTeams] = useState<(TagTeam & { player1Name?: string; player2Name?: string })[]>([]);
  const [tagTeamSelectionMode, setTagTeamSelectionMode] = useState<'tag-teams' | 'individuals'>('tag-teams');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const loadedRef = useRef(false);

  const [teams, setTeams] = useState<string[][]>([[], []]);

  const [formData, setFormData] = useState({
    matchFormat: '',
    stipulationId: '',
    participants: [] as string[],
    isChampionship: false,
    championshipId: '',
    tournamentId: '',
    seasonId: '',
    eventId: '',
    designation: 'midcard' as MatchDesignation,
  });

  useEffect(() => {
    if (!matchId || loadedRef.current) return;
    loadedRef.current = true;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [allMatches, playersData, championshipsData, tournamentsData, seasonsData, eventsData, stipulationsData, matchTypesData, tagTeamsData, divisionsData] = await Promise.all([
        matchesApi.getAll(),
        playersApi.getAll(),
        championshipsApi.getAll(),
        tournamentsApi.getAll(),
        seasonsApi.getAll(),
        eventsApi.getAll(),
        stipulationsApi.getAll(),
        matchTypesApi.getAll(),
        tagTeamsApi.getAll({ status: 'active' }).catch(() => [] as TagTeam[]),
        divisionsApi.getAll(),
      ]);

      setPlayers(playersData);
      setChampionships(championshipsData);
      setTournaments(tournamentsData);
      setSeasons(seasonsData);
      setEvents(eventsData);
      setStipulations(stipulationsData);
      setMatchTypes(matchTypesData);
      setActiveTagTeams(tagTeamsData as (TagTeam & { player1Name?: string; player2Name?: string })[]);
      setDivisions(divisionsData);
      const firstDivision = divisionsData[0];
      if (firstDivision) {
        setDivisionFilter(firstDivision.divisionId);
      }

      // Find the match to edit
      const match = allMatches.find(m => m.matchId === matchId);
      if (!match) {
        setError('Match not found');
        setLoading(false);
        return;
      }

      if (match.status !== 'scheduled') {
        setError('Only scheduled matches can be edited. Completed matches cannot be modified.');
        setLoading(false);
        return;
      }

      setOriginalMatch(match);

      // Find event and designation from events
      let matchEventId = '';
      let matchDesignation: MatchDesignation = 'midcard';
      for (const ev of eventsData) {
        const card = (ev.matchCards || []).find(c => c.matchId === matchId);
        if (card) {
          matchEventId = ev.eventId;
          matchDesignation = card.designation as MatchDesignation;
          break;
        }
      }

      // Pre-fill form with match data
      setFormData({
        matchFormat: match.matchFormat || '',
        stipulationId: match.stipulationId || '',
        participants: match.participants || [],
        isChampionship: match.isChampionship || false,
        championshipId: match.championshipId || '',
        tournamentId: match.tournamentId || '',
        seasonId: match.seasonId || '',
        eventId: matchEventId,
        designation: matchDesignation,
      });

      if (match.teams && match.teams.length >= 2) {
        setTeams(match.teams);
      }
    } catch (_err) {
      setError('Failed to load match data');
    } finally {
      setLoading(false);
    }
  };

  const isTagTeamMatch = formData.matchFormat.toLowerCase().includes('tag');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting || !matchId) return;

    setError(null);
    setSuccess(null);
    setSubmitting(true);

    if (isTagTeamMatch) {
      const validTeams = teams.filter(team => team.length >= 2);
      if (validTeams.length < 2) {
        setError(t('scheduleMatch.tagTeam.minTeamsError'));
        setSubmitting(false);
        return;
      }
      const allParticipants = teams.flat();

      try {
        await matchesApi.update(matchId, {
          matchFormat: formData.matchFormat,
          stipulationId: formData.stipulationId || undefined,
          participants: allParticipants,
          teams: validTeams,
          isChampionship: formData.isChampionship,
          championshipId: formData.championshipId || undefined,
          tournamentId: formData.tournamentId || undefined,
          seasonId: formData.seasonId || undefined,
          eventId: formData.eventId || undefined,
          designation: formData.eventId ? formData.designation : undefined,
        });
        setSuccess('Match updated successfully');
        setTimeout(() => navigate(-1), 1000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update match');
      } finally {
        setSubmitting(false);
      }
    } else {
      if (formData.participants.length < 2) {
        setError(t('scheduleMatch.minParticipantsError'));
        setSubmitting(false);
        return;
      }

      try {
        await matchesApi.update(matchId, {
          matchFormat: formData.matchFormat,
          stipulationId: formData.stipulationId || undefined,
          participants: formData.participants,
          isChampionship: formData.isChampionship,
          championshipId: formData.championshipId || undefined,
          tournamentId: formData.tournamentId || undefined,
          seasonId: formData.seasonId || undefined,
          eventId: formData.eventId || undefined,
          designation: formData.eventId ? formData.designation : undefined,
        });
        setSuccess('Match updated successfully');
        setTimeout(() => navigate(-1), 1000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update match');
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleParticipantToggle = (playerId: string) => {
    setFormData(prev => ({
      ...prev,
      participants: prev.participants.includes(playerId)
        ? prev.participants.filter(id => id !== playerId)
        : [...prev.participants, playerId],
    }));
  };

  const handleTeamMemberToggle = (teamIndex: number, playerId: string) => {
    setTeams(prev => {
      const newTeams = [...prev];
      const currentTeam = newTeams[teamIndex];
      const team = currentTeam ? [...currentTeam] : [];

      if (team.includes(playerId)) {
        newTeams[teamIndex] = team.filter(id => id !== playerId);
      } else {
        newTeams.forEach((t, i) => {
          if (i !== teamIndex && t) {
            newTeams[i] = t.filter(id => id !== playerId);
          }
        });
        newTeams[teamIndex] = [...team, playerId];
      }

      return newTeams;
    });
  };

  const addTeam = () => {
    setTeams(prev => [...prev, []]);
  };

  const removeTeam = (teamIndex: number) => {
    if (teams.length <= 2) return;
    setTeams(prev => prev.filter((_, i) => i !== teamIndex));
  };

  const getPlayerTeamIndex = (playerId: string): number => {
    return teams.findIndex(team => team.includes(playerId));
  };

  const getPlayerName = (playerId: string): string => {
    const player = players.find(p => p.playerId === playerId);
    return player ? player.name : t('common.unknown');
  };

  const filteredPlayers = !divisionFilter || divisionFilter === 'all'
    ? players
    : divisionFilter === 'none'
      ? players.filter(p => !p.divisionId)
      : players.filter(p => p.divisionId === divisionFilter);

  const handleMatchFormatChange = (newFormat: string) => {
    setFormData(prev => ({ ...prev, matchFormat: newFormat, participants: [] }));
    setTeams([[], []]);
    setTagTeamSelectionMode('tag-teams');
  };

  const handleSelectTagTeam = (teamIndex: number, tagTeamId: string) => {
    const tt = activeTagTeams.find(t => t.tagTeamId === tagTeamId);
    if (!tt) return;

    setTeams(prev => {
      const newTeams = [...prev];
      const playerIds = [tt.player1Id, tt.player2Id];
      newTeams.forEach((team, i) => {
        if (i !== teamIndex && team) {
          newTeams[i] = team.filter(id => !playerIds.includes(id));
        }
      });
      newTeams[teamIndex] = [tt.player1Id, tt.player2Id];
      return newTeams;
    });
  };

  const getTagTeamForTeam = (teamIndex: number): string => {
    const team = teams[teamIndex];
    if (!team || team.length !== 2) return '';
    const found = activeTagTeams.find(
      tt => (tt.player1Id === team[0] && tt.player2Id === team[1])
        || (tt.player1Id === team[1] && tt.player2Id === team[0])
    );
    return found?.tagTeamId ?? '';
  };

  if (loading) {
    return <Skeleton variant="block" count={4} />;
  }

  if (!originalMatch) {
    return (
      <div className="schedule-match">
        {error && <div className="error-message">{error}</div>}
        <Link to="/admin/results">&larr; Back to matches</Link>
      </div>
    );
  }

  return (
    <div className="schedule-match">
      <Link to="/admin/results" className="back-to-event-link">
        &larr; Back to Record Results
      </Link>
      <h2>Edit Match</h2>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <form onSubmit={handleSubmit} className="match-form">
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="matchFormat">{t('scheduleMatch.matchFormat', 'Match Format')}</label>
            <select
              id="matchFormat"
              value={formData.matchFormat}
              onChange={(e) => handleMatchFormatChange(e.target.value)}
              required
            >
              <option value="">{t('scheduleMatch.selectMatchFormat', 'Select Match Format')}</option>
              {matchTypes.map(mt => (
                <option key={mt.matchTypeId} value={mt.name}>
                  {mt.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="stipulation">{t('scheduleMatch.stipulation', 'Stipulation (Optional)')}</label>
          <select
            id="stipulation"
            value={formData.stipulationId}
            onChange={(e) => setFormData({ ...formData, stipulationId: e.target.value })}
          >
            <option value="">{t('scheduleMatch.noStipulation', 'Standard Match (No Stipulation)')}</option>
            {stipulations.map(s => (
              <option key={s.stipulationId} value={s.stipulationId}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {seasons.length > 0 && (
          <div className="form-group">
            <label htmlFor="season">Season</label>
            <select
              id="season"
              value={formData.seasonId}
              onChange={(e) => setFormData({ ...formData, seasonId: e.target.value })}
            >
              <option value="">No Season (Exhibition)</option>
              {seasons.filter(s => s.status === 'active').map(s => (
                <option key={s.seasonId} value={s.seasonId}>
                  {s.name} (Active)
                </option>
              ))}
              {seasons.filter(s => s.status === 'completed').map(s => (
                <option key={s.seasonId} value={s.seasonId}>
                  {s.name} (Completed)
                </option>
              ))}
            </select>
          </div>
        )}

        {events.length > 0 && (
          <div className="form-group">
            <label htmlFor="event">{t('scheduleMatch.event', 'Add to Event (Optional)')}</label>
            <SearchableSelect
              id="event"
              value={formData.eventId}
              onChange={(value) => setFormData({ ...formData, eventId: value })}
              placeholder={t('scheduleMatch.noEvent', 'No Event (Standalone Match)')}
              options={[
                { value: '', label: t('scheduleMatch.noEvent', 'No Event (Standalone Match)') },
                ...events.map(ev => ({
                  value: ev.eventId,
                  label: `${ev.name} (${new Date(ev.date).toLocaleDateString()})`,
                })),
              ]}
            />
          </div>
        )}

        {formData.eventId && (
          <div className="form-group">
            <label htmlFor="designation">{t('scheduleMatch.designation', 'Card Position')}</label>
            <select
              id="designation"
              value={formData.designation}
              onChange={(e) => setFormData({ ...formData, designation: e.target.value as MatchDesignation })}
            >
              <option value="pre-show">{t('events.designations.preShow', 'Pre-Show')}</option>
              <option value="opener">{t('events.designations.opener', 'Opener')}</option>
              <option value="midcard">{t('events.designations.midcard', 'Midcard')}</option>
              <option value="co-main">{t('events.designations.coMain', 'Co-Main Event')}</option>
              <option value="main-event">{t('events.designations.mainEvent', 'Main Event')}</option>
            </select>
          </div>
        )}

        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={formData.isChampionship}
              onChange={(e) => setFormData({ ...formData, isChampionship: e.target.checked, championshipId: '' })}
            />
            Championship Match
          </label>
        </div>

        {formData.isChampionship && (
          <div className="form-group">
            <label htmlFor="championship">Championship</label>
            <select
              id="championship"
              value={formData.championshipId}
              onChange={(e) => setFormData({ ...formData, championshipId: e.target.value })}
              required={formData.isChampionship}
            >
              <option value="">Select Championship</option>
              {championships.map(c => (
                <option key={c.championshipId} value={c.championshipId}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {tournaments.length > 0 && (
          <div className="form-group">
            <label htmlFor="tournament">Tournament (Optional)</label>
            <select
              id="tournament"
              value={formData.tournamentId}
              onChange={(e) => setFormData({ ...formData, tournamentId: e.target.value })}
            >
              <option value="">None</option>
              {tournaments.map(t => (
                <option key={t.tournamentId} value={t.tournamentId}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {isTagTeamMatch ? (
          <div className="form-group">
            <label>{t('scheduleMatch.tagTeam.selectTeams', 'Select Teams')}</label>

            {divisions.length > 0 && tagTeamSelectionMode === 'individuals' && (
              <div className="division-filter">
                <label htmlFor="divisionFilterEditTag">Filter by Division:</label>
                <select
                  id="divisionFilterEditTag"
                  value={divisionFilter}
                  onChange={(e) => setDivisionFilter(e.target.value)}
                  className="division-filter-select"
                >
                  <option value="all">All Divisions</option>
                  {divisions.map(d => (
                    <option key={d.divisionId} value={d.divisionId}>{d.name}</option>
                  ))}
                  <option value="none">No Division</option>
                </select>
              </div>
            )}

            <div className="tag-team-mode-toggle">
              <button
                type="button"
                className={`tag-team-mode-btn ${tagTeamSelectionMode === 'tag-teams' ? 'tag-team-mode-btn--active' : ''}`}
                onClick={() => setTagTeamSelectionMode('tag-teams')}
              >
                {t('scheduleMatch.tagTeam.useTagTeams', 'Use Tag Teams')}
              </button>
              <button
                type="button"
                className={`tag-team-mode-btn ${tagTeamSelectionMode === 'individuals' ? 'tag-team-mode-btn--active' : ''}`}
                onClick={() => setTagTeamSelectionMode('individuals')}
              >
                {t('scheduleMatch.tagTeam.useIndividuals', 'Pick Individuals')}
              </button>
            </div>

            <div className="tag-team-container">
              {teams.map((team, teamIndex) => (
                <div key={teamIndex} className="team-section">
                  <div className="team-header">
                    <h4>{t('scheduleMatch.tagTeam.team', 'Team')} {teamIndex + 1}</h4>
                    {teams.length > 2 && (
                      <button
                        type="button"
                        className="remove-team-btn"
                        onClick={() => removeTeam(teamIndex)}
                      >
                        {t('common.delete', 'Remove')}
                      </button>
                    )}
                  </div>

                  {tagTeamSelectionMode === 'tag-teams' && (
                    <div className="team-tag-team-select">
                      <select
                        value={getTagTeamForTeam(teamIndex)}
                        onChange={(e) => handleSelectTagTeam(teamIndex, e.target.value)}
                        className="tag-team-dropdown"
                      >
                        <option value="">{t('scheduleMatch.tagTeam.selectTagTeam', 'Select a Tag Team...')}</option>
                        {activeTagTeams
                          .filter(tt => {
                            const assignedToOther = teams.some((otherTeam, i) => {
                              if (i === teamIndex) return false;
                              return otherTeam.includes(tt.player1Id) && otherTeam.includes(tt.player2Id);
                            });
                            return !assignedToOther;
                          })
                          .map(tt => (
                            <option key={tt.tagTeamId} value={tt.tagTeamId}>
                              {tt.name} ({tt.player1Name ?? getPlayerName(tt.player1Id)} &amp; {tt.player2Name ?? getPlayerName(tt.player2Id)})
                            </option>
                          ))}
                      </select>
                    </div>
                  )}

                  <div className="team-members">
                    {team.length > 0 ? (
                      team.map(playerId => (
                        <span key={playerId} className="team-member-tag">
                          {getPlayerName(playerId)}
                          <button
                            type="button"
                            className="remove-member-btn"
                            onClick={() => handleTeamMemberToggle(teamIndex, playerId)}
                          >
                            ×
                          </button>
                        </span>
                      ))
                    ) : (
                      <span className="no-members">{t('scheduleMatch.tagTeam.noMembers', 'No members selected')}</span>
                    )}
                  </div>

                  {tagTeamSelectionMode === 'individuals' && (
                    <div className="team-players-grid">
                      {filteredPlayers.filter(p => !team.includes(p.playerId)).map(player => {
                        const playerTeamIndex = getPlayerTeamIndex(player.playerId);
                        const isInOtherTeam = playerTeamIndex !== -1 && playerTeamIndex !== teamIndex;
                        return (
                          <div
                            key={player.playerId}
                            className={`participant-card ${isInOtherTeam ? 'in-other-team' : ''}`}
                            onClick={() => !isInOtherTeam && handleTeamMemberToggle(teamIndex, player.playerId)}
                          >
                            <div className="participant-name">{player.name}</div>
                            <div className="participant-wrestler">{player.currentWrestler}</div>
                            {isInOtherTeam && (
                              <div className="other-team-label">
                                {t('scheduleMatch.tagTeam.team', 'Team')} {playerTeamIndex + 1}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
              <button type="button" className="add-team-btn" onClick={addTeam}>
                + {t('scheduleMatch.tagTeam.addTeam', 'Add Team')}
              </button>
            </div>
            <div className="teams-summary">
              {teams.map((team, i) => (
                <span key={i} className={`team-count ${team.length >= 2 ? 'valid' : 'invalid'}`}>
                  {t('scheduleMatch.tagTeam.team', 'Team')} {i + 1}: {team.length} {t('scheduleMatch.tagTeam.members', 'members')}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="form-group">
            <label>{t('scheduleMatch.participants')} ({formData.matchFormat.toLowerCase() === 'singles' ? '2' : '2+'})</label>
            {divisions.length > 0 && (
              <div className="division-filter">
                <label htmlFor="divisionFilterEdit">Filter by Division:</label>
                <select
                  id="divisionFilterEdit"
                  value={divisionFilter}
                  onChange={(e) => setDivisionFilter(e.target.value)}
                  className="division-filter-select"
                >
                  <option value="all">All Divisions</option>
                  {divisions.map(d => (
                    <option key={d.divisionId} value={d.divisionId}>{d.name}</option>
                  ))}
                  <option value="none">No Division</option>
                </select>
              </div>
            )}
            <div className="participants-grid">
              {filteredPlayers.map(player => (
                <div
                  key={player.playerId}
                  className={`participant-card ${formData.participants.includes(player.playerId) ? 'selected' : ''}`}
                  onClick={() => handleParticipantToggle(player.playerId)}
                >
                  <div className="participant-name">{player.name}</div>
                  <div className="participant-wrestler">{player.currentWrestler}</div>
                </div>
              ))}
            </div>
            <div className="selected-count">
              {t('scheduleMatch.selected')}: {formData.participants.length}
            </div>
          </div>
        )}

        <div className="edit-match-actions">
          <button type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save Changes'}
          </button>
          <button type="button" className="cancel-btn" onClick={() => navigate(-1)} disabled={submitting}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
