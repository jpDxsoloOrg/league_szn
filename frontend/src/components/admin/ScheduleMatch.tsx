import { useState, useEffect, useMemo, useRef, FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus, X } from 'lucide-react';
import { challengesApi, matchesApi, playersApi, championshipsApi, tournamentsApi, seasonsApi, eventsApi, stipulationsApi, matchTypesApi, tagTeamsApi, divisionsApi } from '../../services/api';
import type { Player, Championship, Tournament, Season, Stipulation, MatchType, Division, PlayerBookingInfo } from '../../types';
import type { EventCheckInRoster } from '../../types/event';
import PlayerBookingPicker from '../events/PlayerBookingPicker';
import {
  type CheckInStatus,
  buildCheckInStatusMap,
} from '../../utils/checkInStatus';
import type { TagTeam } from '../../types/tagTeam';
import type { LeagueEvent, MatchDesignation } from '../../types/event';
import type { ChallengeWithPlayers, TagTeamChallengeInfo } from '../../types/challenge';
import type { PromoWithContext } from '../../types/promo';
import { findChallengeToBook } from '../challenges/challengeUtils';
import { isNeedsWrestler } from '../../utils/needsWrestler';
import { pickablePlayers, pickableTagTeams } from '../../utils/pickablePlayers';
import { nameOrUnnamed } from '../../utils/playerName';
import SearchableSelect from './SearchableSelect';
import Button from '../ui/Button';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import AdminNotice from './AdminNotice';
import SourceLoadNotice from './SourceLoadNotice';
import { settleSources } from './loadSources';
import './adminRoster.css';
import './ScheduleMatch.css';

type ScheduleLocationState = {
  fromChallenge?: ChallengeWithPlayers;
  fromPromo?: PromoWithContext;
  fromEvent?: { eventId: string; name: string; date: string };
};

const SCHEDULE_SOURCES = {
  players: () => playersApi.getAllIncludingHidden(),
  championships: () => championshipsApi.getAll(),
  tournaments: () => tournamentsApi.getAll(),
  seasons: () => seasonsApi.getAll(),
  events: () => eventsApi.getAll(),
  stipulations: () => stipulationsApi.getAll(),
  matchTypes: () => matchTypesApi.getAll(),
  tagTeams: () => tagTeamsApi.getAll({ status: 'active' }),
  divisions: () => divisionsApi.getAll(),
};

type ScheduleSource = keyof typeof SCHEDULE_SOURCES;

/** The API's wording for the booking refusals, so they can show translated. */
const SCHEDULE_ERROR_KEYS: Record<string, string> = {
  'A title match from a challenge must include the current champion. Add them, or book it as a non-title match.': 'scheduleMatch.challengeNeedsChampion',
  'This call-out or challenge already has a match booked': 'scheduleMatch.alreadyBooked',
};

const isTagFormat = (matchFormat: string) => matchFormat.toLowerCase().includes('tag');

/** A team's members from a challenge, or just its named player if the team has gone. */
const challengeTeamMembers = (team: TagTeamChallengeInfo | undefined, fallbackPlayerId: string): string[] => {
  const members = [team?.player1.playerId, team?.player2.playerId].filter((id): id is string => Boolean(id));
  return members.length > 0 ? members : [fallbackPlayerId];
};

export default function ScheduleMatch() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state as ScheduleLocationState | undefined) ?? undefined;
  const preFillApplied = useRef(false);
  const [linkChallengeId, setLinkChallengeId] = useState<string | null>(null);
  const [linkPromoId, setLinkPromoId] = useState<string | null>(null);
  const [linkedTitleGone, setLinkedTitleGone] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [bookingInfo, setBookingInfo] = useState<Map<string, PlayerBookingInfo> | undefined>(undefined);
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [events, setEvents] = useState<LeagueEvent[]>([]);
  const [stipulations, setStipulations] = useState<Stipulation[]>([]);
  const [matchTypes, setMatchTypes] = useState<MatchType[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [divisionFilter, setDivisionFilter] = useState<string>('all');
  // Check-in roster for the selected event. Booking pickers use it to lead
  // with the people who said they can wrestle. Null until an event is picked
  // (check-ins are per-event), and on any fetch failure.
  const [checkInRoster, setCheckInRoster] = useState<EventCheckInRoster | null>(null);
  const [activeTagTeams, setActiveTagTeams] = useState<(TagTeam & { player1Name?: string; player2Name?: string })[]>([]);
  const [tagTeamSelectionMode, setTagTeamSelectionMode] = useState<'tag-teams' | 'individuals'>('tag-teams');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [failedSources, setFailedSources] = useState<ScheduleSource[]>([]);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Tag team state: array of teams, each team is an array of player IDs
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

  // ── Slot mode (MSL-02) ────────────────────────────────────────────────────
  // When enabled, the form submits { slots, slotsRequired } instead of
  // participants[]. Each slot row may be open (no playerId), pre-assigned, or
  // pre-assigned + locked to that player.
  type SlotRow = { playerId: string; lockedByAdmin: boolean; teamLabel: string };
  const [slotMode, setSlotMode] = useState(false);
  const [slotsRequired, setSlotsRequired] = useState(2);
  const [slotRows, setSlotRows] = useState<SlotRow[]>(() =>
    Array.from({ length: 2 }, () => ({ playerId: '', lockedByAdmin: false, teamLabel: '' })),
  );

  // Keep slotRows length in sync with slotsRequired (preserve as much data as possible).
  useEffect(() => {
    setSlotRows((prev) => {
      if (prev.length === slotsRequired) return prev;
      if (prev.length < slotsRequired) {
        const extra = Array.from(
          { length: slotsRequired - prev.length },
          () => ({ playerId: '', lockedByAdmin: false, teamLabel: '' }),
        );
        return [...prev, ...extra];
      }
      return prev.slice(0, slotsRequired);
    });
  }, [slotsRequired]);

  const updateSlotRow = (index: number, patch: Partial<SlotRow>) => {
    setSlotRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  // Check-ins are per-event, so the roster only loads once an event is
  // chosen. A failure leaves the map empty and every picker falls back to
  // listing the whole roster — booking never depends on this succeeding.
  useEffect(() => {
    const eventId = formData.eventId;
    if (!eventId) {
      setCheckInRoster(null);
      return;
    }
    let cancelled = false;
    eventsApi
      .getCheckIns(eventId)
      .then((roster) => {
        if (!cancelled) setCheckInRoster(roster);
      })
      .catch(() => {
        if (!cancelled) setCheckInRoster(null);
      });
    return () => {
      cancelled = true;
    };
  }, [formData.eventId]);

  const checkInStatusByPlayerId = useMemo(
    () => buildCheckInStatusMap(checkInRoster),
    [checkInRoster],
  );

  const statusOf = (playerId: string): CheckInStatus =>
    checkInStatusByPlayerId.get(playerId) ?? 'noResponse';

  /** Players already placed in a slot row, so the picker can flag repeats. */
  const slotRowPlayerIds = useMemo(
    () => new Set(slotRows.map((row) => row.playerId).filter(Boolean)),
    [slotRows],
  );

  useEffect(() => {
    void loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount to load options and apply pre-fill from location state
  }, []);

  /**
   * The title fields for a linked title. One that no longer exists books as a
   * non-title match and says so, rather than opening on a blank required field.
   * With no list to check against, the title is kept.
   */
  const linkedTitleFields = (championshipId: string | undefined, championshipsData: Championship[] | undefined) => {
    const titleGone = Boolean(championshipId)
      && championshipsData !== undefined
      && !championshipsData.some((championship) => championship.championshipId === championshipId);
    setLinkedTitleGone(titleGone);
    return titleGone
      ? { isChampionship: false, championshipId: '' }
      : { isChampionship: Boolean(championshipId), championshipId: championshipId ?? '' };
  };

  /** A challenge's terms. Names resolve against these lists. */
  const applyChallengePreFill = (
    ch: ChallengeWithPlayers,
    matchTypesData: MatchType[],
    stipulationsData: Stipulation[],
    championshipsData: Championship[] | undefined,
  ) => {
    const isTagChallenge = ch.challengeMode === 'tag_team';
    const fallbackFormat = (isTagChallenge ? matchTypesData.find((mt) => isTagFormat(mt.name)) : undefined)
      ?? matchTypesData[0];
    const matchFormat = matchTypesData.some((mt) => mt.name === ch.matchType)
      ? ch.matchType
      : fallbackFormat?.name ?? 'Singles';
    const stipulationId = ch.stipulation
      ? (stipulationsData.find((s) => s.name === ch.stipulation)?.stipulationId ?? '')
      : '';
    // A tag format books teams rather than participants.
    const bookTeams = isTagFormat(matchFormat);
    const titleFields = linkedTitleFields(ch.championshipId, championshipsData);
    setFormData((prev) => ({
      ...prev,
      participants: bookTeams ? [] : [ch.challengerId, ch.challengedId],
      matchFormat,
      stipulationId,
      ...titleFields,
    }));
    if (bookTeams) {
      setTeams([
        challengeTeamMembers(ch.challengerTagTeam, ch.challengerId),
        challengeTeamMembers(ch.challengedTagTeam, ch.challengedId),
      ]);
    }
    setLinkChallengeId(ch.challengeId);
  };

  /**
   * The promo's challenge, or null if there isn't one or it can't be read. The
   * form then falls back to the promo alone, and the API still finds the link.
   */
  const loadPromoChallenge = async (promo: PromoWithContext): Promise<ChallengeWithPlayers | null> => {
    try {
      return findChallengeToBook(await challengesApi.getAll({ playerId: promo.playerId }), promo);
    } catch {
      return null;
    }
  };

  const applyLinkedPreFill = async (
    matchTypesData: MatchType[],
    stipulationsData: Stipulation[],
    championshipsData: Championship[] | undefined,
  ) => {
    if (state?.fromChallenge) {
      applyChallengePreFill(state.fromChallenge, matchTypesData, stipulationsData, championshipsData);
    } else if (state?.fromPromo && (state.fromPromo.targetPlayerId || state.fromPromo.challengeId)) {
      const promo = state.fromPromo;
      setLinkPromoId(promo.promoId);
      const challenge = await loadPromoChallenge(promo);
      if (challenge) {
        applyChallengePreFill(challenge, matchTypesData, stipulationsData, championshipsData);
        return;
      }
      // A tag call-out's teams are only on its challenge, so staff pick them.
      const targetId = promo.targetPlayerId;
      if (!targetId) return;
      const defaultFormat = matchTypesData.find((mt) => mt.name === 'Singles')?.name ?? matchTypesData[0]?.name ?? 'Singles';
      const titleFields = linkedTitleFields(promo.championshipId, championshipsData);
      setFormData((prev) => ({
        ...prev,
        participants: [promo.playerId, targetId],
        matchFormat: defaultFormat,
        ...titleFields,
      }));
    }
  };

  /**
   * Each list loads on its own, so one failed read leaves the rest of the form
   * working. `only` limits a retry to the lists that failed, which keeps what
   * the admin has already entered.
   */
  const loadData = async (only?: readonly ScheduleSource[]) => {
    const { values, failed } = await settleSources(SCHEDULE_SOURCES, only);

    if (values.players) setPlayers(values.players);
    if (values.championships) setChampionships(values.championships);
    if (values.tournaments) setTournaments(values.tournaments.filter(tournament => tournament.status !== 'completed'));
    if (values.events) setEvents(values.events.filter(e => e.status === 'upcoming' || e.status === 'in-progress'));
    if (values.stipulations) setStipulations(values.stipulations);
    if (values.matchTypes) setMatchTypes(values.matchTypes);
    if (values.tagTeams) setActiveTagTeams(values.tagTeams as (TagTeam & { player1Name?: string; player2Name?: string })[]);
    if (values.divisions) setDivisions(values.divisions);
    if (values.seasons) {
      setSeasons(values.seasons);
      // Set active season as default if one exists
      const activeSeason = values.seasons.find(s => s.status === 'active');
      if (activeSeason) {
        setFormData(prev => (prev.seasonId ? prev : { ...prev, seasonId: activeSeason.seasonId }));
      }
    }
    setFailedSources(failed);

    // Pre-fill from event, challenge, or promo (once per navigation). Linked
    // pre-fill waits for its lookups, so a retry can finish it.
    if (state && !preFillApplied.current) {
      if (state.fromEvent) {
        const eventId = state.fromEvent.eventId;
        setFormData((prev) => ({ ...prev, eventId }));
      }
      if (!failed.includes('matchTypes') && !failed.includes('stipulations')) {
        preFillApplied.current = true;
        await applyLinkedPreFill(values.matchTypes ?? matchTypes, values.stipulations ?? stipulations, values.championships);
      }
    }
  };

  /** Optional last-booked and streak detail, so a failure only drops that detail. */
  const loadBookingInfo = async () => {
    try {
      const summary = await playersApi.getBookingSummary();
      setBookingInfo(new Map(Object.entries(summary)));
    } catch {
      setBookingInfo(undefined);
    }
  };

  const loadInitialData = async () => {
    void loadBookingInfo();
    await loadData();
    setLoading(false);
  };

  const retryFailedSources = async () => {
    setRetrying(true);
    await loadData(failedSources);
    setRetrying(false);
  };

  const isTagTeamMatch = isTagFormat(formData.matchFormat);

  /** The participant half of the request, or null after reporting a validation error. */
  const buildParticipantPayload = () => {
    if (isTagTeamMatch) {
      const validTeams = teams.filter(team => team.length >= 2);
      if (validTeams.length < 2) {
        setError(t('scheduleMatch.tagTeam.minTeamsError'));
        return null;
      }
      return { participants: teams.flat(), teams: validTeams };
    }

    if (slotMode) {
      const filledIds = slotRows.map((r) => r.playerId).filter(Boolean);
      if (new Set(filledIds).size !== filledIds.length) {
        setError(t('scheduleMatch.slotDuplicatePlayerError', {
          defaultValue: 'A player can only occupy one slot in this match.',
        }));
        return null;
      }
      const slots = slotRows.map((row, i) => {
        const slot: { position: number; playerId?: string; lockedByAdmin?: boolean; teamLabel?: string } = {
          position: i + 1,
        };
        if (row.playerId) slot.playerId = row.playerId;
        if (row.lockedByAdmin && row.playerId) slot.lockedByAdmin = true;
        if (row.teamLabel.trim()) slot.teamLabel = row.teamLabel.trim();
        return slot;
      });
      return { slots, slotsRequired };
    }

    if (formData.participants.length < 2) {
      setError(t('scheduleMatch.minParticipantsError'));
      return null;
    }
    return { participants: formData.participants };
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return; // Prevent double submission

    setError(null);
    setSuccess(null);

    const participantPayload = buildParticipantPayload();
    if (!participantPayload) return;

    setSubmitting(true);

    // Resolve date: use event date if an event is selected, otherwise today
    const selectedEvent = formData.eventId ? events.find(ev => ev.eventId === formData.eventId) : undefined;
    const matchDate = selectedEvent?.date || state?.fromEvent?.date || new Date().toISOString();

    try {
      await matchesApi.schedule({
        date: matchDate,
        matchFormat: formData.matchFormat,
        stipulationId: formData.stipulationId || undefined,
        ...participantPayload,
        isChampionship: formData.isChampionship,
        championshipId: formData.championshipId || undefined,
        tournamentId: formData.tournamentId || undefined,
        seasonId: formData.seasonId || undefined,
        eventId: formData.eventId || undefined,
        designation: formData.eventId ? formData.designation : undefined,
        status: 'scheduled',
        ...(linkChallengeId ? { challengeId: linkChallengeId } : {}),
        ...(linkPromoId ? { promoId: linkPromoId } : {}),
      });

      setSuccess(t('scheduleMatch.success'));
      setLinkChallengeId(null);
      setLinkPromoId(null);
      setLinkedTitleGone(false);
      preFillApplied.current = false;
      if (state?.fromEvent) {
        navigate(`/events/${state.fromEvent.eventId}`, { replace: true });
      } else {
        navigate('/admin/schedule', { replace: true, state: {} });
      }
      resetForm();
    } catch (err) {
      const translationKey = err instanceof Error ? SCHEDULE_ERROR_KEYS[err.message] : undefined;
      if (translationKey) setError(t(translationKey));
      else setError(err instanceof Error ? err.message : t('scheduleMatch.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    const activeSeason = seasons.find(s => s.status === 'active');
    setFormData({
      matchFormat: '',
      stipulationId: '',
      participants: [],
      isChampionship: false,
      championshipId: '',
      tournamentId: '',
      seasonId: activeSeason?.seasonId || '',
      eventId: '',
      designation: 'midcard',
    });
    setTeams([[], []]);
    setSlotMode(false);
    setSlotsRequired(2);
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
      const currentTeam = newTeams[teamIndex];
      const team = currentTeam ? [...currentTeam] : [];

      if (team.includes(playerId)) {
        // Remove from this team
        newTeams[teamIndex] = team.filter(id => id !== playerId);
      } else {
        // Remove from other teams first
        newTeams.forEach((t, i) => {
          if (i !== teamIndex && t) {
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

  const displayName = (player: Player): string => nameOrUnnamed(player.name, t('common.unnamedPlayer', 'Unnamed player'));

  const getPlayerName = (playerId: string): string => {
    const player = players.find(p => p.playerId === playerId);
    return player ? displayName(player) : t('common.unknown');
  };

  // A challenge or promo can pre-fill someone who has since become hidden.
  const selectedPlayerIds = [...formData.participants, ...teams.flat(), ...slotRowPlayerIds];
  // A deactivated entrant stays bookable, so a tournament can still finish.
  const tournamentEntrantIds = tournaments.find(
    (tournament) => tournament.tournamentId === formData.tournamentId,
  )?.participants ?? [];
  const keptPlayerIds = [...selectedPlayerIds, ...tournamentEntrantIds];
  const bookablePlayers = pickablePlayers(players, keptPlayerIds);
  const bookableTagTeams = pickableTagTeams(activeTagTeams, players, keptPlayerIds);
  const selectedPlayers = players.filter((player) => selectedPlayerIds.includes(player.playerId));
  const signupBlockedPicks = selectedPlayers.filter((player) => player.discipline?.status === 'signup-blocked');
  const deactivatedEntrantPicks = selectedPlayers.filter(
    (player) => player.discipline?.status === 'deactivated' && tournamentEntrantIds.includes(player.playerId),
  );

  const filteredPlayers = divisionFilter === 'all'
    ? bookablePlayers
    : divisionFilter === 'none'
      ? bookablePlayers.filter(p => !p.divisionId)
      : bookablePlayers.filter(p => p.divisionId === divisionFilter);

  /** Selection set for the participants picker. */
  const selectedParticipantIds = useMemo(
    () => new Set(formData.participants),
    [formData.participants],
  );

  const handleMatchFormatChange = (newFormat: string) => {
    setFormData(prev => ({ ...prev, matchFormat: newFormat, participants: [] }));
    setTeams([[], []]);
    setTagTeamSelectionMode('tag-teams');
    // Slot mode is incompatible with tag-team formats (out of scope for v1).
    if (isTagFormat(newFormat)) {
      setSlotMode(false);
    }
  };

  const handleSelectTagTeam = (teamIndex: number, tagTeamId: string) => {
    const tt = activeTagTeams.find(t => t.tagTeamId === tagTeamId);
    if (!tt) return;

    setTeams(prev => {
      const newTeams = [...prev];
      // Remove these players from any other team first
      const playerIds = [tt.player1Id, tt.player2Id];
      newTeams.forEach((team, i) => {
        if (i !== teamIndex && team) {
          newTeams[i] = team.filter(id => !playerIds.includes(id));
        }
      });
      // Set both members on the target team
      newTeams[teamIndex] = [tt.player1Id, tt.player2Id];
      return newTeams;
    });
  };

  const getTagTeamForTeam = (teamIndex: number): string => {
    const team = teams[teamIndex];
    if (!team || team.length !== 2) return '';
    // Check if the two members match an active tag team
    const found = activeTagTeams.find(
      tt => (tt.player1Id === team[0] && tt.player2Id === team[1])
        || (tt.player1Id === team[1] && tt.player2Id === team[0])
    );
    return found?.tagTeamId ?? '';
  };

  if (loading) {
    return <Skeleton variant="block" count={4} />;
  }

  const seasonsUnavailable = failedSources.includes('seasons');

  const statusLabel = (status: CheckInStatus) => t(`adminRoster.schedule.checkIn.${status}`, status);

  const divisionFilterControl = (controlId: string) => (
    <div className="division-filter">
      <label htmlFor={controlId}>{t('adminRoster.schedule.filterByDivision', 'Filter by Division')}</label>
      <select
        id={controlId}
        value={divisionFilter}
        onChange={(e) => setDivisionFilter(e.target.value)}
        className="division-filter-select"
      >
        <option value="all">{t('adminRoster.schedule.allDivisions', 'All Divisions')}</option>
        {divisions.map(d => (
          <option key={d.divisionId} value={d.divisionId}>{d.name}</option>
        ))}
        <option value="none">{t('adminRoster.players.noDivision', 'No Division')}</option>
      </select>
    </div>
  );

  return (
    <div className="ar-page ar-page--narrow schedule-match">
      {state?.fromEvent && (
        <Link to={`/events/${state.fromEvent.eventId}`} className="back-to-event-link">
          <ArrowLeft aria-hidden="true" size={16} />
          {t('events.detail.backToEvent', { name: state.fromEvent.name })}
        </Link>
      )}
      <PageHeader
        title={state?.fromEvent
          ? t('scheduleMatch.addMatchToEvent', { event: state.fromEvent.name })
          : t('scheduleMatch.title', 'Schedule Match')}
        actions={(
          <Button variant="ghost" to="/guide/wiki/admin-schedule-match">
            {t('adminRoster.schedule.guide', 'Open schedule guide')}
          </Button>
        )}
      />

      <SourceLoadNotice
        failed={failedSources}
        onRetry={retryFailedSources}
        retrying={retrying}
        detail={seasonsUnavailable
          ? t('adminRoster.schedule.seasonsRequired', 'Scheduling is paused until seasons load, so the match is not left out of the active season.')
          : undefined}
      />
      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      {success && <AdminNotice tone="success">{success}</AdminNotice>}
      {linkedTitleGone && <AdminNotice tone="warning">{t('scheduleMatch.linkedTitleGone')}</AdminNotice>}
      {signupBlockedPicks.length > 0 && (
        <AdminNotice tone="warning">
          {t('discipline.admin.bookingWarning', { names: signupBlockedPicks.map((player) => player.name).join(', ') })}
        </AdminNotice>
      )}
      {deactivatedEntrantPicks.length > 0 && (
        <AdminNotice tone="warning">
          {t('discipline.admin.tournamentForfeitWarning', { names: deactivatedEntrantPicks.map((player) => player.name).join(', ') })}
        </AdminNotice>
      )}

      <form onSubmit={handleSubmit} className="match-form am-form">
        <fieldset className="match-form__section">
          <legend className="match-form__legend">{t('adminRoster.schedule.sectionMatch', 'Match')}</legend>
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
          </div>

          <div className="form-group">
            <label className="am-toggle-row">
              <input
                type="checkbox"
                className="am-toggle"
                checked={formData.isChampionship}
                onChange={(e) => setFormData({ ...formData, isChampionship: e.target.checked, championshipId: '' })}
              />
              {t('adminRoster.schedule.championshipMatch', 'Championship Match')}
            </label>
          </div>

          {formData.isChampionship && (
            <div className="form-group">
              <label htmlFor="championship">{t('adminRoster.schedule.championship', 'Championship')}</label>
              <select
                id="championship"
                value={formData.championshipId}
                onChange={(e) => setFormData({ ...formData, championshipId: e.target.value })}
                required={formData.isChampionship}
              >
                <option value="">{t('adminRoster.schedule.selectChampionship', 'Select Championship')}</option>
                {championships.map(c => (
                  <option key={c.championshipId} value={c.championshipId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </fieldset>

        {(seasons.length > 0 || events.length > 0 || tournaments.length > 0) && (
          <fieldset className="match-form__section">
            <legend className="match-form__legend">{t('adminRoster.schedule.sectionPlacement', 'Placement')}</legend>

            {seasons.length > 0 && (
              <div className="form-group">
                <label htmlFor="season">{t('adminRoster.schedule.season', 'Season')}</label>
                <select
                  id="season"
                  value={formData.seasonId}
                  onChange={(e) => setFormData({ ...formData, seasonId: e.target.value })}
                >
                  <option value="">{t('adminRoster.schedule.noSeason', 'No Season (Exhibition)')}</option>
                  {seasons.filter(s => s.status === 'active').map(s => (
                    <option key={s.seasonId} value={s.seasonId}>
                      {s.name} ({t('common.active', 'Active')})
                    </option>
                  ))}
                  {seasons.filter(s => s.status === 'completed').map(s => (
                    <option key={s.seasonId} value={s.seasonId}>
                      {s.name} ({t('common.completed', 'Completed')})
                    </option>
                  ))}
                </select>
                <small className="form-hint">
                  {t('adminRoster.schedule.seasonHint', "Match results count towards the selected season's standings")}
                </small>
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
                <small className="form-hint">{t('scheduleMatch.eventHint', 'Match will be automatically added to the event\'s card')}</small>
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

            {tournaments.length > 0 && (
              <div className="form-group">
                <label htmlFor="tournament">{t('adminRoster.schedule.tournament', 'Tournament (Optional)')}</label>
                <select
                  id="tournament"
                  value={formData.tournamentId}
                  onChange={(e) => setFormData({ ...formData, tournamentId: e.target.value })}
                >
                  <option value="">{t('common.none', 'None')}</option>
                  {tournaments.map(tournament => (
                    <option key={tournament.tournamentId} value={tournament.tournamentId}>
                      {tournament.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </fieldset>
        )}

        <fieldset className="match-form__section">
          <legend className="match-form__legend">{t('adminRoster.schedule.sectionCompetitors', 'Competitors')}</legend>

          {/* Slot-mode toggle (MSL-02) — incompatible with tag-team formats */}
          {!isTagTeamMatch && formData.matchFormat && (
            <div className="form-group slot-mode-toggle">
              <label className="slot-mode-toggle-label am-toggle-row">
                <input
                  type="checkbox"
                  className="am-toggle"
                  checked={slotMode}
                  onChange={(e) => setSlotMode(e.target.checked)}
                />
                {t('matches.slots.signupModeToggle', { defaultValue: 'Open match for signups' })}
              </label>
              {slotMode && (
                <div className="slot-mode-required-row">
                  <label htmlFor="slotsRequired">
                    {t('matches.slots.slotsRequiredLabel', { defaultValue: 'Number of spots' })}
                  </label>
                  <input
                    id="slotsRequired"
                    type="number"
                    min={2}
                    max={8}
                    value={slotsRequired}
                    onChange={(e) => {
                      const next = Number.parseInt(e.target.value, 10);
                      if (Number.isFinite(next)) setSlotsRequired(Math.min(8, Math.max(2, next)));
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {isTagTeamMatch ? (
            /* Tag Team Selection UI */
            <div className="form-group" role="group" aria-labelledby="schedule-teams-label">
              <span id="schedule-teams-label" className="ar-field__label">
                {t('scheduleMatch.tagTeam.selectTeams', 'Select Teams')}
              </span>

              {/* Selection mode toggle */}
              <div className="tag-team-mode-toggle">
                <button
                  type="button"
                  aria-pressed={tagTeamSelectionMode === 'tag-teams'}
                  className={`tag-team-mode-btn ${tagTeamSelectionMode === 'tag-teams' ? 'tag-team-mode-btn--active' : ''}`}
                  onClick={() => setTagTeamSelectionMode('tag-teams')}
                >
                  {t('scheduleMatch.tagTeam.useTagTeams', 'Use Tag Teams')}
                </button>
                <button
                  type="button"
                  aria-pressed={tagTeamSelectionMode === 'individuals'}
                  className={`tag-team-mode-btn ${tagTeamSelectionMode === 'individuals' ? 'tag-team-mode-btn--active' : ''}`}
                  onClick={() => setTagTeamSelectionMode('individuals')}
                >
                  {t('scheduleMatch.tagTeam.useIndividuals', 'Pick Individuals')}
                </button>
              </div>

              {divisions.length > 0 && tagTeamSelectionMode === 'individuals' && divisionFilterControl('divisionFilterTag')}

              <div className="tag-team-container">
                {teams.map((team, teamIndex) => {
                  const teamName = `${t('scheduleMatch.tagTeam.team', 'Team')} ${teamIndex + 1}`;
                  return (
                    <div key={teamIndex} className="team-section">
                      <div className="team-header">
                        <h3>{teamName}</h3>
                        {teams.length > 2 && (
                          <button
                            type="button"
                            className="remove-team-btn"
                            aria-label={`${t('common.delete', 'Remove')}: ${teamName}`}
                            onClick={() => removeTeam(teamIndex)}
                          >
                            {t('common.delete', 'Remove')}
                          </button>
                        )}
                      </div>

                      {/* Tag Team dropdown mode */}
                      {tagTeamSelectionMode === 'tag-teams' && (
                        <div className="team-tag-team-select">
                          <select
                            aria-label={`${teamName}: ${t('scheduleMatch.tagTeam.selectTagTeam', 'Select a Tag Team...')}`}
                            value={getTagTeamForTeam(teamIndex)}
                            onChange={(e) => handleSelectTagTeam(teamIndex, e.target.value)}
                            className="tag-team-dropdown"
                          >
                            <option value="">{t('scheduleMatch.tagTeam.selectTagTeam', 'Select a Tag Team...')}</option>
                            {bookableTagTeams
                              .filter(tt => {
                                // Hide tag teams already assigned to other teams
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

                      {/* Show selected members */}
                      <div className="team-members">
                        {team.length > 0 ? (
                          team.map(playerId => (
                            <span key={playerId} className="team-member-tag am-chip">
                              {getPlayerName(playerId)}
                              <button
                                type="button"
                                className="remove-member-btn am-chip-remove"
                                aria-label={t('scheduleMatch.removeParticipant', {
                                  name: getPlayerName(playerId),
                                  defaultValue: `Remove ${getPlayerName(playerId)}`,
                                })}
                                onClick={() => handleTeamMemberToggle(teamIndex, playerId)}
                              >
                                <X aria-hidden="true" size={14} />
                              </button>
                            </span>
                          ))
                        ) : (
                          <span className="no-members">{t('scheduleMatch.tagTeam.noMembers', 'No members selected')}</span>
                        )}
                      </div>

                      {/* Individual picker mode */}
                      {tagTeamSelectionMode === 'individuals' && (
                        <div className="team-players-grid">
                          {filteredPlayers.filter(p => !team.includes(p.playerId)).map(player => {
                            const playerTeamIndex = getPlayerTeamIndex(player.playerId);
                            const isInOtherTeam = playerTeamIndex !== -1 && playerTeamIndex !== teamIndex;
                            const status = statusOf(player.playerId);
                            return (
                              <button
                                key={player.playerId}
                                type="button"
                                aria-pressed={false}
                                disabled={isInOtherTeam}
                                className={`participant-card participant-card--${status} ${isInOtherTeam ? 'in-other-team' : ''}`}
                                onClick={() => handleTeamMemberToggle(teamIndex, player.playerId)}
                              >
                                <span className="participant-name">
                                  <span className={`participant-status-dot participant-status-dot--${status}`} aria-hidden="true" />
                                  {displayName(player)}
                                  <span className="sr-only"> ({statusLabel(status)})</span>
                                </span>
                                {!isNeedsWrestler(player.currentWrestler) && (
                                  <span className="participant-wrestler">{player.currentWrestler}</span>
                                )}
                                {isInOtherTeam && (
                                  <span className="other-team-label">
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
                <Button variant="secondary" size="sm" icon={<Plus aria-hidden="true" size={16} />} onClick={addTeam}>
                  {t('scheduleMatch.tagTeam.addTeam', 'Add Team')}
                </Button>
              </div>
              <div className="teams-summary">
                {teams.map((team, i) => (
                  <span key={i} className={`team-count ${team.length >= 2 ? 'valid' : 'invalid'}`}>
                    {t('scheduleMatch.tagTeam.team', 'Team')} {i + 1}: {team.length} {t('scheduleMatch.tagTeam.members', 'members')}
                  </span>
                ))}
              </div>
            </div>
          ) : slotMode ? (
            /* Slot-mode editor (MSL-02) — replaces the participants picker */
            <div className="form-group slot-mode-editor" role="group" aria-labelledby="schedule-slots-label">
              <span id="schedule-slots-label" className="ar-field__label">
                {t('matches.slots.editorLabel', { defaultValue: 'Slots' })}
              </span>
              <div className="slot-mode-rows">
                {slotRows.map((row, index) => (
                  <div key={index} className="slot-mode-row">
                    <span className="slot-mode-row-position">{index + 1}</span>
                    <div className="slot-mode-row-player">
                      <PlayerBookingPicker
                        players={bookablePlayers}
                        value={row.playerId}
                        onChange={(playerId) => updateSlotRow(index, { playerId })}
                        checkInStatusByPlayerId={checkInStatusByPlayerId}
                        bookedPlayerIds={slotRowPlayerIds}
                        bookingInfoByPlayerId={bookingInfo}
                      />
                    </div>
                    <label className="slot-mode-row-lock">
                      <input
                        type="checkbox"
                        checked={row.lockedByAdmin}
                        disabled={!row.playerId}
                        onChange={(e) => updateSlotRow(index, { lockedByAdmin: e.target.checked })}
                      />
                      {t('matches.slots.lockToggle', { defaultValue: 'Lock' })}
                    </label>
                    <input
                      className="slot-mode-row-team"
                      type="text"
                      aria-label={`${t('matches.slots.teamLabelPlaceholder', { defaultValue: 'Team (optional)' })} ${index + 1}`}
                      placeholder={t('matches.slots.teamLabelPlaceholder', { defaultValue: 'Team (optional)' })}
                      value={row.teamLabel}
                      onChange={(e) => updateSlotRow(index, { teamLabel: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Standard Participant Selection UI */
            <div className="form-group" role="group" aria-labelledby="schedule-participants-label">
              <span id="schedule-participants-label" className="ar-field__label">
                {t('scheduleMatch.participants')} ({formData.matchFormat.toLowerCase() === 'singles' ? '2' : '2+'})
              </span>
              {divisions.length > 0 && divisionFilterControl('divisionFilter')}
              <PlayerBookingPicker
                mode="multi"
                players={filteredPlayers}
                selectedPlayerIds={selectedParticipantIds}
                onToggle={handleParticipantToggle}
                checkInStatusByPlayerId={checkInStatusByPlayerId}
                bookingInfoByPlayerId={bookingInfo}
                placeholder={t('matches.slots.picker.addParticipants', {
                  defaultValue: 'Add participants…',
                })}
              />
              {formData.participants.length > 0 && (
                <ul className="selected-participants">
                  {formData.participants.map(playerId => {
                    const player = players.find(p => p.playerId === playerId);
                    const status = statusOf(playerId);
                    const hidden = player ? isNeedsWrestler(player.currentWrestler) : false;
                    return (
                      <li
                        key={playerId}
                        className={`selected-participant selected-participant--${status}`}
                      >
                        <span
                          className={`participant-status-dot participant-status-dot--${status}`}
                          aria-hidden="true"
                        />
                        <span className="selected-participant-text">
                          {player && !hidden && `${player.currentWrestler} (${displayName(player)})`}
                          {player && hidden && displayName(player)}
                          {!player && playerId}
                        </span>
                        <button
                          type="button"
                          className="selected-participant-remove"
                          onClick={() => handleParticipantToggle(playerId)}
                          aria-label={t('scheduleMatch.removeParticipant', {
                            name: player ? displayName(player) : playerId,
                            defaultValue: `Remove ${player ? displayName(player) : playerId}`,
                          })}
                        >
                          <X aria-hidden="true" size={14} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="selected-count">
                {t('scheduleMatch.selected')}: {formData.participants.length}
              </div>
            </div>
          )}
        </fieldset>

        <div className="am-actionbar">
          <Button type="submit" fullWidth loading={submitting} disabled={seasonsUnavailable}>
            {submitting ? t('adminRoster.schedule.scheduling', 'Scheduling...') : t('scheduleMatch.submit')}
          </Button>
        </div>
      </form>
    </div>
  );
}
