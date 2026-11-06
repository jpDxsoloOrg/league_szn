import { useState, useEffect, useRef, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import {
  matchesApi,
  playersApi,
  championshipsApi,
  tournamentsApi,
  seasonsApi,
  eventsApi,
  stipulationsApi,
  matchTypesApi,
  tagTeamsApi,
  divisionsApi,
} from '../../services/api';
import type {
  Match,
  Player,
  Championship,
  Tournament,
  Season,
  Stipulation,
  MatchType,
  Division,
} from '../../types';
import type { TagTeam } from '../../types/tagTeam';
import type { LeagueEvent, MatchDesignation } from '../../types/event';
import SearchableSelect from '../admin/SearchableSelect';
import Button from '../ui/Button';
import Skeleton from '../ui/Skeleton';
import { formatCalendarDate } from '../../utils/dateUtils';
import './MatchEditForm.css';

interface MatchEditFormProps {
  matchId: string;
  lockedEventId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function MatchEditForm({
  matchId,
  lockedEventId,
  onSuccess,
  onCancel,
}: MatchEditFormProps) {
  const { t } = useTranslation();
  const [originalMatch, setOriginalMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [events, setEvents] = useState<LeagueEvent[]>([]);
  const [stipulations, setStipulations] = useState<Stipulation[]>([]);
  const [matchTypes, setMatchTypes] = useState<MatchType[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [divisionFilter, setDivisionFilter] = useState<string>('all');
  const [activeTagTeams, setActiveTagTeams] = useState<
    (TagTeam & { player1Name?: string; player2Name?: string })[]
  >([]);
  const [tagTeamSelectionMode, setTagTeamSelectionMode] = useState<'tag-teams' | 'individuals'>(
    'tag-teams'
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      const [
        allMatches,
        playersData,
        championshipsData,
        tournamentsData,
        seasonsData,
        eventsData,
        stipulationsData,
        matchTypesData,
        tagTeamsData,
        divisionsData,
      ] = await Promise.all([
        matchesApi.getAll(),
        // Staff can book hidden players, so this needs the full roster.
        playersApi.getAllIncludingHidden(),
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
      setActiveTagTeams(
        tagTeamsData as (TagTeam & { player1Name?: string; player2Name?: string })[]
      );
      setDivisions(divisionsData);

      // Find the match to edit
      const match = allMatches.find((m) => m.matchId === matchId);
      if (!match) {
        setError(t('events.forms.matchNotFound', 'Match not found'));
        setLoading(false);
        return;
      }

      if (match.status !== 'scheduled') {
        setError(t('events.forms.onlyScheduled', 'Only scheduled matches can be edited. Completed matches cannot be modified.'));
        setLoading(false);
        return;
      }

      setOriginalMatch(match);

      // Find event and designation from events
      let matchEventId = '';
      let matchDesignation: MatchDesignation = 'midcard';
      for (const ev of eventsData) {
        const card = (ev.matchCards || []).find((c) => c.matchId === matchId);
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
      setError(t('events.forms.loadError', 'Failed to load match data'));
    } finally {
      setLoading(false);
    }
  };

  const isTagTeamMatch = formData.matchFormat.toLowerCase().includes('tag');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting || !matchId) return;

    setError(null);
    setSubmitting(true);

    const effectiveEventId = lockedEventId ?? (formData.eventId || undefined);
    const effectiveDesignation = lockedEventId
      ? formData.designation
      : formData.eventId
        ? formData.designation
        : undefined;

    if (isTagTeamMatch) {
      const validTeams = teams.filter((team) => team.length >= 2);
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
          eventId: effectiveEventId,
          designation: effectiveDesignation,
        });
        onSuccess();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('events.forms.updateError', 'Failed to update match'));
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
          eventId: effectiveEventId,
          designation: effectiveDesignation,
        });
        onSuccess();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('events.forms.updateError', 'Failed to update match'));
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleParticipantToggle = (playerId: string) => {
    setFormData((prev) => ({
      ...prev,
      participants: prev.participants.includes(playerId)
        ? prev.participants.filter((id) => id !== playerId)
        : [...prev.participants, playerId],
    }));
  };

  const handleTeamMemberToggle = (teamIndex: number, playerId: string) => {
    setTeams((prev) => {
      const newTeams = [...prev];
      const currentTeam = newTeams[teamIndex];
      const team = currentTeam ? [...currentTeam] : [];

      if (team.includes(playerId)) {
        newTeams[teamIndex] = team.filter((id) => id !== playerId);
      } else {
        newTeams.forEach((tm, i) => {
          if (i !== teamIndex && tm) {
            newTeams[i] = tm.filter((id) => id !== playerId);
          }
        });
        newTeams[teamIndex] = [...team, playerId];
      }

      return newTeams;
    });
  };

  const addTeam = () => {
    setTeams((prev) => [...prev, []]);
  };

  const removeTeam = (teamIndex: number) => {
    if (teams.length <= 2) return;
    setTeams((prev) => prev.filter((_, i) => i !== teamIndex));
  };

  const getPlayerTeamIndex = (playerId: string): number => {
    return teams.findIndex((team) => team.includes(playerId));
  };

  const getPlayerName = (playerId: string): string => {
    const player = players.find((p) => p.playerId === playerId);
    return player ? player.name : t('common.unknown');
  };

  const filteredPlayers =
    !divisionFilter || divisionFilter === 'all'
      ? players
      : divisionFilter === 'none'
        ? players.filter((p) => !p.divisionId)
        : players.filter((p) => p.divisionId === divisionFilter);

  const handleMatchFormatChange = (newFormat: string) => {
    setFormData((prev) => ({ ...prev, matchFormat: newFormat, participants: [] }));
    setTeams([[], []]);
    setTagTeamSelectionMode('tag-teams');
  };

  const handleSelectTagTeam = (teamIndex: number, tagTeamId: string) => {
    const tt = activeTagTeams.find((tm) => tm.tagTeamId === tagTeamId);
    if (!tt) return;

    setTeams((prev) => {
      const newTeams = [...prev];
      const playerIds = [tt.player1Id, tt.player2Id];
      newTeams.forEach((team, i) => {
        if (i !== teamIndex && team) {
          newTeams[i] = team.filter((id) => !playerIds.includes(id));
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
      (tt) =>
        (tt.player1Id === team[0] && tt.player2Id === team[1]) ||
        (tt.player1Id === team[1] && tt.player2Id === team[0])
    );
    return found?.tagTeamId ?? '';
  };

  if (loading) {
    return <Skeleton variant="block" count={4} />;
  }

  if (!originalMatch) {
    return (
      <div className="match-edit-form">
        {error && <p className="match-edit-form__error" role="alert">{error}</p>}
        <div className="match-edit-form__actions">
          <Button variant="secondary" onClick={onCancel}>{t('common.cancel', 'Cancel')}</Button>
        </div>
      </div>
    );
  }

  const lockedEvent = lockedEventId ? events.find((ev) => ev.eventId === lockedEventId) : null;
  const showDesignation = lockedEventId ? true : !!formData.eventId;
  const divisionOptions = (
    <>
      <option value="all">{t('events.forms.allDivisions', 'All Divisions')}</option>
      {divisions.map((d) => (
        <option key={d.divisionId} value={d.divisionId}>
          {d.name}
        </option>
      ))}
      <option value="none">{t('events.forms.noDivision', 'No Division')}</option>
    </>
  );

  return (
    <div className="match-edit-form">
      {error && <p className="match-edit-form__error" role="alert">{error}</p>}

      <form onSubmit={handleSubmit}>
        <div className="match-edit-form__fields">
          <div className="match-edit-form__field">
            <label htmlFor="matchFormat">{t('scheduleMatch.matchFormat', 'Match Format')}</label>
            <select
              id="matchFormat"
              value={formData.matchFormat}
              onChange={(e) => handleMatchFormatChange(e.target.value)}
              required
            >
              <option value="">{t('scheduleMatch.selectMatchFormat', 'Select Match Format')}</option>
              {matchTypes.map((mt) => (
                <option key={mt.matchTypeId} value={mt.name}>
                  {mt.name}
                </option>
              ))}
            </select>
          </div>

          <div className="match-edit-form__field">
            <label htmlFor="stipulation">{t('scheduleMatch.stipulation', 'Stipulation (Optional)')}</label>
            <select
              id="stipulation"
              value={formData.stipulationId}
              onChange={(e) => setFormData({ ...formData, stipulationId: e.target.value })}
            >
              <option value="">{t('scheduleMatch.noStipulation', 'Standard Match (No Stipulation)')}</option>
              {stipulations.map((s) => (
                <option key={s.stipulationId} value={s.stipulationId}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {seasons.length > 0 && (
            <div className="match-edit-form__field">
              <label htmlFor="season">{t('events.admin.season', 'Season')}</label>
              <select
                id="season"
                value={formData.seasonId}
                onChange={(e) => setFormData({ ...formData, seasonId: e.target.value })}
              >
                <option value="">{t('events.forms.noSeason', 'No Season (Exhibition)')}</option>
                {seasons
                  .filter((s) => s.status === 'active')
                  .map((s) => (
                    <option key={s.seasonId} value={s.seasonId}>
                      {s.name} ({t('common.active', 'Active')})
                    </option>
                  ))}
                {seasons
                  .filter((s) => s.status === 'completed')
                  .map((s) => (
                    <option key={s.seasonId} value={s.seasonId}>
                      {s.name} ({t('common.completed', 'Completed')})
                    </option>
                  ))}
              </select>
            </div>
          )}

          {lockedEventId ? (
            lockedEvent && (
              <div className="match-edit-form__field">
                <span className="match-edit-form__label">{t('scheduleMatch.event', 'Event')}</span>
                <p className="match-edit-form__locked">
                  {lockedEvent.name} ({formatCalendarDate(lockedEvent.date)})
                </p>
              </div>
            )
          ) : (
            events.length > 0 && (
              <div className="match-edit-form__field">
                <label htmlFor="event">{t('scheduleMatch.event', 'Add to Event (Optional)')}</label>
                <SearchableSelect
                  id="event"
                  value={formData.eventId}
                  onChange={(value) => setFormData({ ...formData, eventId: value })}
                  placeholder={t('scheduleMatch.noEvent', 'No Event (Standalone Match)')}
                  options={[
                    { value: '', label: t('scheduleMatch.noEvent', 'No Event (Standalone Match)') },
                    ...events.map((ev) => ({
                      value: ev.eventId,
                      label: `${ev.name} (${formatCalendarDate(ev.date)})`,
                    })),
                  ]}
                />
              </div>
            )
          )}

          {showDesignation && (
            <div className="match-edit-form__field">
              <label htmlFor="designation">{t('scheduleMatch.designation', 'Card Position')}</label>
              <select
                id="designation"
                value={formData.designation}
                onChange={(e) =>
                  setFormData({ ...formData, designation: e.target.value as MatchDesignation })
                }
              >
                <option value="pre-show">{t('events.designations.preShow', 'Pre-Show')}</option>
                <option value="opener">{t('events.designations.opener', 'Opener')}</option>
                <option value="midcard">{t('events.designations.midcard', 'Midcard')}</option>
                <option value="co-main">{t('events.designations.coMain', 'Co-Main Event')}</option>
                <option value="main-event">{t('events.designations.mainEvent', 'Main Event')}</option>
              </select>
            </div>
          )}

          {tournaments.length > 0 && (
            <div className="match-edit-form__field">
              <label htmlFor="tournament">{t('events.forms.tournament', 'Tournament (Optional)')}</label>
              <select
                id="tournament"
                value={formData.tournamentId}
                onChange={(e) => setFormData({ ...formData, tournamentId: e.target.value })}
              >
                <option value="">{t('common.none', 'None')}</option>
                {tournaments.map((tr) => (
                  <option key={tr.tournamentId} value={tr.tournamentId}>
                    {tr.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <label className="match-edit-form__check">
          <input
            type="checkbox"
            checked={formData.isChampionship}
            onChange={(e) =>
              setFormData({ ...formData, isChampionship: e.target.checked, championshipId: '' })
            }
          />
          {t('events.forms.championshipMatch', 'Championship Match')}
        </label>

        {formData.isChampionship && (
          <div className="match-edit-form__field">
            <label htmlFor="championship">{t('events.forms.championship', 'Championship')}</label>
            <select
              id="championship"
              value={formData.championshipId}
              onChange={(e) => setFormData({ ...formData, championshipId: e.target.value })}
              required={formData.isChampionship}
            >
              <option value="">{t('events.forms.selectChampionship', 'Select Championship')}</option>
              {championships.map((c) => (
                <option key={c.championshipId} value={c.championshipId}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {isTagTeamMatch ? (
          <fieldset className="match-edit-form__group">
            <legend className="match-edit-form__label">{t('scheduleMatch.tagTeam.selectTeams', 'Select Teams')}</legend>

            <div className="match-edit-form__toolbar">
              <div className="match-edit-form__modes" role="group" aria-label={t('scheduleMatch.tagTeam.selectTeams', 'Select Teams')}>
                <button
                  type="button"
                  className="match-edit-form__mode"
                  aria-pressed={tagTeamSelectionMode === 'tag-teams'}
                  onClick={() => setTagTeamSelectionMode('tag-teams')}
                >
                  {t('scheduleMatch.tagTeam.useTagTeams', 'Use Tag Teams')}
                </button>
                <button
                  type="button"
                  className="match-edit-form__mode"
                  aria-pressed={tagTeamSelectionMode === 'individuals'}
                  onClick={() => setTagTeamSelectionMode('individuals')}
                >
                  {t('scheduleMatch.tagTeam.useIndividuals', 'Pick Individuals')}
                </button>
              </div>

              {divisions.length > 0 && tagTeamSelectionMode === 'individuals' && (
                <div className="match-edit-form__field match-edit-form__division">
                  <label htmlFor="divisionFilterEditTag">{t('events.forms.filterDivision', 'Filter by Division')}</label>
                  <select
                    id="divisionFilterEditTag"
                    value={divisionFilter}
                    onChange={(e) => setDivisionFilter(e.target.value)}
                  >
                    {divisionOptions}
                  </select>
                </div>
              )}
            </div>

            {teams.map((team, teamIndex) => {
              const teamLabel = `${t('scheduleMatch.tagTeam.team', 'Team')} ${teamIndex + 1}`;
              return (
                <div key={teamIndex} className="match-edit-form__team">
                  <div className="match-edit-form__team-header">
                    <h4>
                      {teamLabel}
                      <span className={`match-edit-form__team-count${team.length >= 2 ? ' is-valid' : ''}`}>
                        {team.length} {t('scheduleMatch.tagTeam.members', 'members')}
                      </span>
                    </h4>
                    {teams.length > 2 && (
                      <Button variant="ghost" size="sm" onClick={() => removeTeam(teamIndex)}>
                        {t('common.delete', 'Remove')}
                      </Button>
                    )}
                  </div>

                  {tagTeamSelectionMode === 'tag-teams' && (
                    <select
                      aria-label={`${teamLabel}: ${t('scheduleMatch.tagTeam.selectTagTeam', 'Select a Tag Team...')}`}
                      value={getTagTeamForTeam(teamIndex)}
                      onChange={(e) => handleSelectTagTeam(teamIndex, e.target.value)}
                    >
                      <option value="">
                        {t('scheduleMatch.tagTeam.selectTagTeam', 'Select a Tag Team...')}
                      </option>
                      {activeTagTeams
                        .filter((tt) => {
                          const assignedToOther = teams.some((otherTeam, i) => {
                            if (i === teamIndex) return false;
                            return (
                              otherTeam.includes(tt.player1Id) &&
                              otherTeam.includes(tt.player2Id)
                            );
                          });
                          return !assignedToOther;
                        })
                        .map((tt) => (
                          <option key={tt.tagTeamId} value={tt.tagTeamId}>
                            {tt.name} ({tt.player1Name ?? getPlayerName(tt.player1Id)} &amp;{' '}
                            {tt.player2Name ?? getPlayerName(tt.player2Id)})
                          </option>
                        ))}
                    </select>
                  )}

                  <div className="match-edit-form__members">
                    {team.length > 0 ? (
                      team.map((playerId) => (
                        <span key={playerId} className="match-edit-form__member">
                          {getPlayerName(playerId)}
                          <button
                            type="button"
                            aria-label={t('scheduleMatch.removeParticipant', {
                              name: getPlayerName(playerId),
                              defaultValue: `Remove ${getPlayerName(playerId)}`,
                            })}
                            onClick={() => handleTeamMemberToggle(teamIndex, playerId)}
                          >
                            <X aria-hidden="true" size={16} />
                          </button>
                        </span>
                      ))
                    ) : (
                      <span className="match-edit-form__hint">
                        {t('scheduleMatch.tagTeam.noMembers', 'No members selected')}
                      </span>
                    )}
                  </div>

                  {tagTeamSelectionMode === 'individuals' && (
                    <div className="match-edit-form__players">
                      {filteredPlayers
                        .filter((p) => !team.includes(p.playerId))
                        .map((player) => {
                          const playerTeamIndex = getPlayerTeamIndex(player.playerId);
                          const isInOtherTeam =
                            playerTeamIndex !== -1 && playerTeamIndex !== teamIndex;
                          return (
                            <button
                              key={player.playerId}
                              type="button"
                              className="match-edit-form__player"
                              disabled={isInOtherTeam}
                              onClick={() => handleTeamMemberToggle(teamIndex, player.playerId)}
                            >
                              <span className="match-edit-form__player-name">{player.name}</span>
                              {player.currentWrestler && (
                                <span className="match-edit-form__player-meta">{player.currentWrestler}</span>
                              )}
                              {isInOtherTeam && (
                                <span className="match-edit-form__player-meta">
                                  {t('scheduleMatch.tagTeam.team', 'Team')} {playerTeamIndex + 1}
                                </span>
                              )}
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            })}

            <Button variant="secondary" size="sm" onClick={addTeam}>
              + {t('scheduleMatch.tagTeam.addTeam', 'Add Team')}
            </Button>
          </fieldset>
        ) : (
          <fieldset className="match-edit-form__group">
            <legend className="match-edit-form__label">
              {t('scheduleMatch.participants')} (
              {formData.matchFormat.toLowerCase() === 'singles' ? '2' : '2+'})
            </legend>
            {divisions.length > 0 && (
              <div className="match-edit-form__field match-edit-form__division">
                <label htmlFor="divisionFilterEdit">{t('events.forms.filterDivision', 'Filter by Division')}</label>
                <select
                  id="divisionFilterEdit"
                  value={divisionFilter}
                  onChange={(e) => setDivisionFilter(e.target.value)}
                >
                  {divisionOptions}
                </select>
              </div>
            )}
            <div className="match-edit-form__players">
              {filteredPlayers.map((player) => (
                <button
                  key={player.playerId}
                  type="button"
                  className="match-edit-form__player"
                  aria-pressed={formData.participants.includes(player.playerId)}
                  onClick={() => handleParticipantToggle(player.playerId)}
                >
                  <span className="match-edit-form__player-name">{player.name}</span>
                  {player.currentWrestler && (
                    <span className="match-edit-form__player-meta">{player.currentWrestler}</span>
                  )}
                </button>
              ))}
            </div>
            <p className="match-edit-form__hint">
              {t('scheduleMatch.selected')}: {formData.participants.length}
            </p>
          </fieldset>
        )}

        <div className="match-edit-form__actions">
          <Button variant="secondary" onClick={onCancel} disabled={submitting}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="submit" loading={submitting}>
            {t('events.forms.saveChanges', 'Save Changes')}
          </Button>
        </div>
      </form>
    </div>
  );
}
