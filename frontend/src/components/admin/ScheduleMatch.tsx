import { useState, useEffect, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { matchesApi, playersApi, championshipsApi, tournamentsApi, seasonsApi } from '../../services/api';
import { sanitizeInput } from '../../utils/sanitize';
import type { Player, Championship, Tournament, Season } from '../../types';
import './ScheduleMatch.css';

export default function ScheduleMatch() {
  const { t } = useTranslation();
  const [players, setPlayers] = useState<Player[]>([]);
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Tag team state: array of teams, each team is an array of player IDs
  const [teams, setTeams] = useState<string[][]>([[], []]);

  const [formData, setFormData] = useState({
    date: '',
    matchType: 'singles',
    stipulation: '',
    participants: [] as string[],
    isChampionship: false,
    championshipId: '',
    tournamentId: '',
    seasonId: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [playersData, championshipsData, tournamentsData, seasonsData] = await Promise.all([
        playersApi.getAll(),
        championshipsApi.getAll(),
        tournamentsApi.getAll(),
        seasonsApi.getAll(),
      ]);
      setPlayers(playersData);
      setChampionships(championshipsData);
      setTournaments(tournamentsData.filter(t => t.status !== 'completed'));
      setSeasons(seasonsData);

      // Set active season as default if one exists
      const activeSeason = seasonsData.find(s => s.status === 'active');
      if (activeSeason) {
        setFormData(prev => ({ ...prev, seasonId: activeSeason.seasonId }));
      }
    } catch (_err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const isTagTeamMatch = formData.matchType === 'tag';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (isTagTeamMatch) {
      // For tag team matches, validate teams
      const validTeams = teams.filter(team => team.length >= 2);
      if (validTeams.length < 2) {
        setError(t('scheduleMatch.tagTeam.minTeamsError'));
        return;
      }
      // All participants are members of all teams combined
      const allParticipants = teams.flat();

      try {
        // Sanitize stipulation input
        const sanitizedStipulation = sanitizeInput(formData.stipulation, 200);

        await matchesApi.schedule({
          date: new Date(formData.date).toISOString(),
          matchType: formData.matchType,
          stipulation: sanitizedStipulation,
          participants: allParticipants,
          teams: validTeams,
          isChampionship: formData.isChampionship,
          championshipId: formData.championshipId || undefined,
          tournamentId: formData.tournamentId || undefined,
          seasonId: formData.seasonId || undefined,
          status: 'scheduled',
        });

        setSuccess(t('scheduleMatch.success'));
        resetForm();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('scheduleMatch.error'));
      }
    } else {
      // Non-tag team match validation
      if (formData.participants.length < 2) {
        setError(t('scheduleMatch.minParticipantsError'));
        return;
      }

      try {
        // Sanitize stipulation input
        const sanitizedStipulation = sanitizeInput(formData.stipulation, 200);

        await matchesApi.schedule({
          date: new Date(formData.date).toISOString(),
          matchType: formData.matchType,
          stipulation: sanitizedStipulation,
          participants: formData.participants,
          isChampionship: formData.isChampionship,
          championshipId: formData.championshipId || undefined,
          tournamentId: formData.tournamentId || undefined,
          seasonId: formData.seasonId || undefined,
          status: 'scheduled',
        });

        setSuccess(t('scheduleMatch.success'));
        resetForm();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('scheduleMatch.error'));
      }
    }
  };

  const resetForm = () => {
    const activeSeason = seasons.find(s => s.status === 'active');
    setFormData({
      date: '',
      matchType: 'singles',
      stipulation: '',
      participants: [],
      isChampionship: false,
      championshipId: '',
      tournamentId: '',
      seasonId: activeSeason?.seasonId || '',
    });
    setTeams([[], []]);
  };

  const handleParticipantToggle = (playerId: string) => {
    setFormData(prev => ({
      ...prev,
      participants: prev.participants.includes(playerId)
        ? prev.participants.filter(id => id !== playerId)
        : [...prev.participants, playerId],
    }));
  };

  // Tag team helper functions
  const handleTeamMemberToggle = (teamIndex: number, playerId: string) => {
    setTeams(prev => {
      const newTeams = [...prev];
      const team = [...newTeams[teamIndex]];

      if (team.includes(playerId)) {
        // Remove from this team
        newTeams[teamIndex] = team.filter(id => id !== playerId);
      } else {
        // Remove from other teams first
        newTeams.forEach((t, i) => {
          if (i !== teamIndex) {
            newTeams[i] = t.filter(id => id !== playerId);
          }
        });
        // Add to this team
        newTeams[teamIndex] = [...team, playerId];
      }

      return newTeams;
    });
  };

  const addTeam = () => {
    setTeams(prev => [...prev, []]);
  };

  const removeTeam = (teamIndex: number) => {
    if (teams.length <= 2) return; // Keep at least 2 teams
    setTeams(prev => prev.filter((_, i) => i !== teamIndex));
  };

  const getPlayerTeamIndex = (playerId: string): number => {
    return teams.findIndex(team => team.includes(playerId));
  };

  const getPlayerName = (playerId: string): string => {
    const player = players.find(p => p.playerId === playerId);
    return player ? player.name : t('common.unknown');
  };

  const handleMatchTypeChange = (newType: string) => {
    setFormData(prev => ({ ...prev, matchType: newType, participants: [] }));
    setTeams([[], []]);
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="schedule-match">
      <h2>Schedule Match</h2>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <form onSubmit={handleSubmit} className="match-form">
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="date">Date & Time</label>
            <input
              type="datetime-local"
              id="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="matchType">{t('scheduleMatch.matchType')}</label>
            <select
              id="matchType"
              value={formData.matchType}
              onChange={(e) => handleMatchTypeChange(e.target.value)}
              required
            >
              <option value="singles">{t('scheduleMatch.matchTypes.singles')}</option>
              <option value="tag">{t('scheduleMatch.matchTypes.tag')}</option>
              <option value="triple-threat">{t('scheduleMatch.matchTypes.tripleThread')}</option>
              <option value="fatal-4-way">{t('scheduleMatch.matchTypes.fatal4Way')}</option>
              <option value="six-pack">{t('scheduleMatch.matchTypes.sixPack')}</option>
              <option value="battle-royal">{t('scheduleMatch.matchTypes.battleRoyal')}</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="stipulation">Stipulation (Optional)</label>
          <input
            type="text"
            id="stipulation"
            value={formData.stipulation}
            onChange={(e) => setFormData({ ...formData, stipulation: e.target.value })}
            placeholder="e.g., Ladder Match, Steel Cage, Hell in a Cell"
          />
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
            <small className="form-hint">Match results count towards the selected season's standings</small>
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
          /* Tag Team Selection UI */
          <div className="form-group">
            <label>{t('scheduleMatch.tagTeam.selectTeams')}</label>
            <div className="tag-team-container">
              {teams.map((team, teamIndex) => (
                <div key={teamIndex} className="team-section">
                  <div className="team-header">
                    <h4>{t('scheduleMatch.tagTeam.team')} {teamIndex + 1}</h4>
                    {teams.length > 2 && (
                      <button
                        type="button"
                        className="remove-team-btn"
                        onClick={() => removeTeam(teamIndex)}
                      >
                        {t('common.delete')}
                      </button>
                    )}
                  </div>
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
                      <span className="no-members">{t('scheduleMatch.tagTeam.noMembers')}</span>
                    )}
                  </div>
                  <div className="team-players-grid">
                    {players.filter(p => !team.includes(p.playerId)).map(player => {
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
                              {t('scheduleMatch.tagTeam.team')} {playerTeamIndex + 1}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <button type="button" className="add-team-btn" onClick={addTeam}>
                + {t('scheduleMatch.tagTeam.addTeam')}
              </button>
            </div>
            <div className="teams-summary">
              {teams.map((team, i) => (
                <span key={i} className={`team-count ${team.length >= 2 ? 'valid' : 'invalid'}`}>
                  {t('scheduleMatch.tagTeam.team')} {i + 1}: {team.length} {t('scheduleMatch.tagTeam.members')}
                </span>
              ))}
            </div>
          </div>
        ) : (
          /* Standard Participant Selection UI */
          <div className="form-group">
            <label>{t('scheduleMatch.participants')} ({formData.matchType === 'singles' ? '2' : '2+'})</label>
            <div className="participants-grid">
              {players.map(player => (
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

        <button type="submit">{t('scheduleMatch.submit')}</button>
      </form>
    </div>
  );
}
