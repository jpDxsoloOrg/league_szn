import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowLeft, ArrowUp, CalendarClock, Lock, LockOpen, Mic, Pencil, Plus, Trash2, Trophy } from 'lucide-react';
import { eventsApi, isApiError, matchesApi, playersApi, tagTeamsApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/toastContext';
import type {
  MatchDesignation,
  EventStatus,
  EventWithMatches,
  EventCheckIn as EventCheckInRow,
  EventCheckInStatus,
  EventCheckInSummary,
  EventCheckInRoster,
} from '../../types/event';
import type { Match, Player, MatchStatus, PlayerBookingInfo } from '../../types';
import type { TagTeam } from '../../types/tagTeam';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import Modal from '../ui/Modal';
import PageHeader from '../ui/PageHeader';
import Select from '../ui/Select';
import Skeleton from '../ui/Skeleton';
import MatchResultForm from './MatchResultForm';
import MatchEditForm from './MatchEditForm';
import EventCheckIn from './EventCheckIn';
import EventCheckInRosterPanel from './EventCheckInRosterPanel';
import MatchSides from './MatchSides';
import type { MatchSideParticipant } from './MatchSides';
import MatchSlots from './MatchSlots';
import SlotEditDialog from './SlotEditDialog';
import { buildCheckInStatusMap } from '../../utils/checkInStatus';
import type { HydratedMatchSlot } from '../../types';
import { StarRating } from '../matches/StarRating';
import { RateMatchWidget } from '../matches/RateMatchWidget';
import { MotnToggleButton } from '../matches/MotnToggleButton';
import { formatCalendarDate, toCalendarDate } from '../../utils/dateUtils';
import { describeSides, formatMatchType, groupMatchSides } from '../../utils/matchDisplay';
import { DESIGNATION_LABEL_KEYS, EVENT_STATUS_TONES, EVENT_TYPE_TONES } from './eventDisplay';
import { findMoveTarget, isPreShowCard, swapCards } from './cardOrder';
import type { CardMoveDirection } from './cardOrder';
import '../posterHero.css';
import './EventDetail.css';

const EVENT_STATUSES: EventStatus[] = ['upcoming', 'in-progress', 'completed', 'cancelled'];

type HydratedTagTeam = TagTeam & { player1Name?: string; player2Name?: string };

/** A new card list to show at once and save. */
interface CardListEdit {
  matchCards: EventWithMatches['matchCards'];
  enrichedMatches: EventWithMatches['enrichedMatches'];
  errorMessage: string;
  moveFocus?: { matchId: string; direction: CardMoveDirection };
}

/** What the delete confirmation is currently asking about. */
type PendingDelete =
  | { kind: 'event'; message: string }
  | { kind: 'match'; matchId: string; message: string };

export default function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const {
    isAdminOrModerator,
    isAuthenticated,
    isWrestler,
    playerId,
    currentWrestler,
    alternateWrestler,
  } = useAuth();
  const [eventData, setEventData] = useState<EventWithMatches | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [dateDraft, setDateDraft] = useState('');
  const [venueDraft, setVenueDraft] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [togglingLock, setTogglingLock] = useState(false);

  // Staff-only data for the record, edit and delete flows
  const [scheduledMatches, setScheduledMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [tagTeams, setTagTeams] = useState<HydratedTagTeam[]>([]);
  const [recordingMatchId, setRecordingMatchId] = useState<string | null>(null);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [matchActionError, setMatchActionError] = useState<string | null>(null);
  const [deletingMatchId, setDeletingMatchId] = useState<string | null>(null);

  // Card order saves. The refs are read outside render: one blocks a second
  // save and holds back event reads, the other two put focus back after a move.
  const [savingCardOrder, setSavingCardOrder] = useState(false);
  const cardSaveRef = useRef<Promise<void> | null>(null);
  const cardSaveCountRef = useRef(0);
  const moveControlsRef = useRef(new Map<string, HTMLButtonElement>());
  const moveFocusRef = useRef<{ matchId: string; direction: CardMoveDirection } | null>(null);

  // Check-in state
  const [myCheckIn, setMyCheckIn] = useState<EventCheckInRow | null>(null);
  const [checkInSummary, setCheckInSummary] = useState<EventCheckInSummary | null>(null);
  const [checkInError, setCheckInError] = useState<string | null>(null);

  const loadEvent = useCallback(async (signal?: AbortSignal) => {
    if (!eventId) return;
    try {
      setLoading(true);
      // A read that overlaps a card save can return the old order and undo the
      // move on screen, so wait the save out and read again if one started.
      let data: EventWithMatches;
      let savesSeen: number;
      do {
        while (cardSaveRef.current) await cardSaveRef.current;
        savesSeen = cardSaveCountRef.current;
        data = await eventsApi.getById(eventId, signal);
      } while (savesSeen !== cardSaveCountRef.current || cardSaveRef.current);
      setEventData(data);
      setError(null);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Failed to load event');
      }
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  // Last-booked / streak for the slot picker. Loaded once per admin visit —
  // it changes rarely and the current card's own bookings are already
  // covered by bookedPlayerIds. Optional: without it the picker sorts by name.
  useEffect(() => {
    if (!isAdminOrModerator) return;
    let mounted = true;
    playersApi
      .getBookingSummary()
      .then((summary) => { if (mounted) setBookingInfo(new Map(Object.entries(summary))); })
      .catch(() => { if (mounted) setBookingInfo(undefined); });
    return () => { mounted = false; };
  }, [isAdminOrModerator]);

  const loadAdminData = useCallback(async () => {
    if (!isAdminOrModerator) return;
    try {
      const [scheduled, playersData, tagTeamsData, rosterData] = await Promise.all([
        matchesApi.getAll({ status: 'scheduled' }),
        // The full roster, so names on this card resolve for hidden players.
        playersApi.getAllIncludingHidden(),
        tagTeamsApi.getAll({ status: 'active' }).catch(() => [] as TagTeam[]),
        // Drives the colour-coded slot picker. A failure here only costs the
        // check-in grouping, so fall back to an unfiltered picker.
        eventId
          ? eventsApi.getCheckIns(eventId).catch(() => null)
          : Promise.resolve(null),
      ]);
      setScheduledMatches(scheduled);
      setPlayers(playersData);
      setTagTeams(tagTeamsData as HydratedTagTeam[]);
      setCheckInRoster(rosterData);
    } catch (err) {
      console.error('Failed to load admin data for event:', err);
    }
  }, [isAdminOrModerator, eventId]);

  const refreshAfterMutation = useCallback(async () => {
    await Promise.all([loadEvent(), loadAdminData()]);
    setRecordingMatchId(null);
    setEditingMatchId(null);
    setMatchActionError(null);
  }, [loadEvent, loadAdminData]);

  // ── Slot signups ──────────────────────────────────────────────────────────
  // Non-optimistic: the per-slot button shows "Claiming…/Releasing…" while the
  // request is in flight, and we refetch the event on both success and failure.
  // The refetch on failure acts as the rollback (per MSL-02 spec).
  // Slot mutations can flip a match's status between 'open-signups' and
  // 'scheduled' (filling the last slot or releasing one), so we have to
  // refresh BOTH eventData and the admin scheduledMatches list. Without the
  // admin refresh, clicking Record Result on a freshly-scheduled match shows
  // the inline "Match data is not available" error because scheduledMatches
  // didn't include this match when it was last fetched.
  const handleClaimSlot = useCallback(async (
    matchId: string,
    slotId: string,
    options?: { wrestlerChoice?: 'main' | 'alternate' },
  ) => {
    setMatchActionError(null);
    try {
      await matchesApi.claimSlot(matchId, slotId, options);
    } catch (err) {
      setMatchActionError(err instanceof Error ? err.message : 'Failed to claim slot');
    } finally {
      await Promise.all([loadEvent(), loadAdminData()]);
    }
  }, [loadEvent, loadAdminData]);

  const handleReleaseSlot = useCallback(async (matchId: string, slotId: string) => {
    setMatchActionError(null);
    try {
      await matchesApi.releaseSlot(matchId, slotId);
    } catch (err) {
      setMatchActionError(err instanceof Error ? err.message : 'Failed to release slot');
    } finally {
      await Promise.all([loadEvent(), loadAdminData()]);
    }
  }, [loadEvent, loadAdminData]);

  const handleLoginRequired = useCallback(() => {
    if (!eventId) return;
    const returnUrl = encodeURIComponent(`/events/${eventId}`);
    navigate(`/login?returnUrl=${returnUrl}`);
  }, [eventId, navigate]);

  // ── Admin slot-edit dialog ────────────────────────────────────────────────
  const [editingSlot, setEditingSlot] = useState<{ matchId: string; slot: HydratedMatchSlot } | null>(null);
  const [checkInRoster, setCheckInRoster] = useState<EventCheckInRoster | null>(null);
  const [bookingInfo, setBookingInfo] = useState<Map<string, PlayerBookingInfo> | undefined>(undefined);

  const handleAdminEditSlot = useCallback((matchId: string, slot: HydratedMatchSlot) => {
    setEditingSlot({ matchId, slot });
  }, []);

  const handleSlotEditSave = useCallback(async (
    patch: {
      playerId?: string | null;
      lockedByAdmin?: boolean;
      teamLabel?: string | null;
      wrestlerChoice?: 'main' | 'alternate';
    },
  ) => {
    if (!editingSlot) return;
    try {
      await matchesApi.adminUpdateSlot(editingSlot.matchId, editingSlot.slot.slotId, patch);
    } finally {
      // adminUpdateSlot can also flip the match's status (filling the last
      // slot, clearing one, etc.), so refresh admin data too.
      await Promise.all([loadEvent(), loadAdminData()]);
    }
  }, [editingSlot, loadEvent, loadAdminData]);

  const handleStatusChange = async (newStatus: string) => {
    if (!eventData || !eventId || newStatus === eventData.status) return;
    setUpdatingStatus(true);
    setManageError(null);
    try {
      await eventsApi.update(eventId, { status: newStatus as EventStatus });
      // Functional: a card move can land while this request is pending.
      setEventData((current) => current && { ...current, status: newStatus as EventStatus });
    } catch (err) {
      setManageError(err instanceof Error ? err.message : t('events.detail.statusError', 'Failed to update status.'));
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleOpenDetails = () => {
    if (!eventData) return;
    setDateDraft(toCalendarDate(eventData.date));
    setVenueDraft(eventData.venue ?? '');
    setDetailsError(null);
    setDetailsOpen(true);
  };

  const handleSaveDetails = async () => {
    if (!eventData || !eventId || savingDetails) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDraft)) {
      setDetailsError(t('events.admin.editDate.invalid', 'Pick a valid date.'));
      return;
    }
    const venue = venueDraft.trim();
    const updates: { date?: string; venue?: string } = {};
    if (dateDraft !== toCalendarDate(eventData.date)) updates.date = dateDraft;
    if (venue !== (eventData.venue ?? '')) updates.venue = venue;
    if (Object.keys(updates).length === 0) {
      setDetailsOpen(false);
      return;
    }
    setSavingDetails(true);
    setDetailsError(null);
    try {
      const updated = await eventsApi.update(eventId, updates);
      setEventData({ ...eventData, date: updated.date, venue: updated.venue });
      setDetailsOpen(false);
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : t('events.detail.detailsError', 'Failed to update event details.'));
    } finally {
      setSavingDetails(false);
    }
  };

  const handleToggleSignupLock = async () => {
    if (!eventData || !eventId || togglingLock) return;
    const next = !eventData.checkInsLocked;
    setTogglingLock(true);
    setManageError(null);
    try {
      const updated = await eventsApi.update(eventId, { checkInsLocked: next });
      setEventData((current) => current && { ...current, checkInsLocked: updated.checkInsLocked });
    } catch (err) {
      setManageError(err instanceof Error ? err.message : t('events.admin.lockSignups.error', 'Failed to update sign-ups.'));
    } finally {
      setTogglingLock(false);
    }
  };

  /**
   * Saves an edited card list. matchCards replaces the whole stored list, so the
   * list this edit started from goes with it and the server refuses the write if
   * another staff member or tab has changed the card since.
   */
  const saveCardList = async ({ matchCards, enrichedMatches, errorMessage, moveFocus }: CardListEdit) => {
    if (!eventData || !eventId) return;
    const { matchCards: previousCards, enrichedMatches: previousMatches } = eventData;
    let cardChanged = false;

    const saveOrder = async () => {
      try {
        await eventsApi.update(eventId, { matchCards, expectedMatchCards: previousCards });
      } catch (err) {
        if (moveFocus) moveFocusRef.current = moveFocus;
        if (isApiError(err, 409)) {
          // The list on screen is the stale one, so reload it rather than restore it.
          cardChanged = true;
          showToast(t('events.detail.cardChanged', 'The card changed. Reloaded the latest order; try again.'), 'error');
          return;
        }
        setEventData((current) => current && {
          ...current,
          matchCards: previousCards,
          enrichedMatches: previousMatches,
        });
        showToast(errorMessage, 'error');
      }
    };

    if (moveFocus) moveFocusRef.current = moveFocus;
    setSavingCardOrder(true);
    setEventData((current) => current && { ...current, matchCards, enrichedMatches });
    cardSaveCountRef.current += 1;
    const pendingSave = saveOrder();
    cardSaveRef.current = pendingSave;
    await pendingSave;
    cardSaveRef.current = null;
    setSavingCardOrder(false);
    // After the ref clears: loadEvent waits on it, so calling this inside the
    // save would deadlock.
    if (cardChanged) await loadEvent();
  };

  const handleMoveMatch = async (index: number, direction: CardMoveDirection) => {
    if (!eventData || !eventId || cardSaveRef.current) return;
    const { matchCards: previousCards, enrichedMatches: previousMatches } = eventData;
    const movedMatch = previousMatches[index];
    const targetIndex = findMoveTarget(previousMatches, index, direction);
    if (!movedMatch || targetIndex === null) return;

    // enrichedMatches is built 1:1 from matchCards, so indexes line up. The save
    // starts from the stored cards: matchCards replaces the whole list, and the
    // enriched rows carry match data that must not be written back.
    const matchCards = swapCards(previousCards, index, targetIndex);
    await saveCardList({
      matchCards,
      enrichedMatches: swapCards(previousMatches, index, targetIndex),
      errorMessage: t('events.detail.moveMatchError', 'Could not save the new match order.'),
      moveFocus: { matchId: movedMatch.matchId, direction },
    });
  };

  /**
   * Takes a card off the event without touching any match, for a card whose
   * match is gone. deleteMatch cannot help: it returns 404 for these.
   */
  const handleRemoveCard = async (index: number) => {
    if (!eventData || cardSaveRef.current) return;
    const renumber = <T extends { position: number }>(cards: T[]): T[] => cards
      .filter((_card, cardIndex) => cardIndex !== index)
      .map((card, cardIndex) => ({ ...card, position: cardIndex + 1 }));
    await saveCardList({
      matchCards: renumber(eventData.matchCards),
      enrichedMatches: renumber(eventData.enrichedMatches),
      errorMessage: t('events.detail.removeCardError', 'Could not remove the match from the card.'),
    });
  };

  const handleRequestDeleteEvent = () => {
    if (!eventData) return;
    setManageError(null);
    setPendingDelete({ kind: 'event', message: t('events.admin.confirmDeleteEvent', { name: eventData.name }) });
  };

  const handleRequestDeleteMatch = (matchId: string) => {
    const targetMatch = scheduledMatches.find(m => m.matchId === matchId)
      ?? eventData?.enrichedMatches.find(em => em.matchId === matchId)?.matchData;
    if (!targetMatch) return;

    const isCompleted = (targetMatch as { status?: string }).status === 'completed';
    const isChampionship = 'isChampionship' in targetMatch && targetMatch.isChampionship && 'championshipId' in targetMatch && targetMatch.championshipId;
    const isTournament = 'tournamentId' in targetMatch && !!(targetMatch as { tournamentId?: string }).tournamentId;
    const matchFormat = 'matchFormat' in targetMatch ? (targetMatch as { matchFormat: string }).matchFormat : 'match';

    let message: string;
    if (!isCompleted) {
      message = t('events.detail.deleteMatchConfirm.scheduled', {
        format: matchFormat,
        defaultValue: `Delete this ${matchFormat} match? This cannot be undone.`,
      });
    } else if (isChampionship) {
      message = t('events.detail.deleteMatchConfirm.championship', 'Delete this completed championship match? Player stats and championship history will be rolled back. This cannot be undone.');
    } else if (isTournament) {
      message = t('events.detail.deleteMatchConfirm.tournament', 'Delete this completed tournament match? Player stats and tournament progression will be rolled back. This cannot be undone.');
    } else {
      message = t('events.detail.deleteMatchConfirm.completed', {
        format: matchFormat,
        defaultValue: `Delete this completed ${matchFormat} match? Player stats (wins/losses/draws) will be rolled back. This cannot be undone.`,
      });
    }

    setMatchActionError(null);
    setPendingDelete({ kind: 'match', matchId, message });
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    if (pendingDelete.kind === 'event') {
      if (!eventId || deleting) return;
      setDeleting(true);
      setPendingDelete(null);
      try {
        await eventsApi.delete(eventId);
        navigate('/events');
      } catch (err) {
        setManageError(err instanceof Error ? err.message : t('events.admin.deleteEventError'));
        setDeleting(false);
      }
      return;
    }

    const { matchId } = pendingDelete;
    setPendingDelete(null);
    setDeletingMatchId(matchId);
    setMatchActionError(null);
    try {
      await matchesApi.delete(matchId);
      await refreshAfterMutation();
    } catch (err) {
      setMatchActionError(err instanceof Error ? err.message : t('events.detail.deleteMatchError', 'Failed to delete match.'));
    } finally {
      setDeletingMatchId(null);
    }
  };

  useEffect(() => {
    if (!eventId) return;
    const controller = new AbortController();
    loadEvent(controller.signal);
    return () => controller.abort();
  }, [eventId, loadEvent]);

  useEffect(() => {
    if (!isAdminOrModerator) return;
    loadAdminData();
  }, [isAdminOrModerator, loadAdminData]);

  useEffect(() => {
    if (!eventId || !isAuthenticated || !isWrestler || !playerId) {
      setMyCheckIn(null);
      setCheckInSummary(null);
      return;
    }
    let ignore = false;
    (async () => {
      try {
        const [mine, summary] = await Promise.all([
          eventsApi.getMyCheckIn(eventId),
          eventsApi.getCheckInSummary(eventId),
        ]);
        if (ignore) return;
        setMyCheckIn(mine);
        setCheckInSummary(summary);
        setCheckInError(null);
      } catch (err) {
        if (ignore) return;
        setCheckInError(err instanceof Error ? err.message : 'events.checkIn.error');
      }
    })();
    return () => {
      ignore = true;
    };
  }, [eventId, isAuthenticated, isWrestler, playerId]);

  const handleCheckInChange = useCallback(
    async (status: EventCheckInStatus | null) => {
      if (!eventId) return;
      const prevStatus: EventCheckInStatus | null = myCheckIn?.status ?? null;
      const prevSummary = checkInSummary;
      const prevCheckIn = myCheckIn;

      // Optimistic update
      if (prevSummary) {
        const nextSummary: EventCheckInSummary = { ...prevSummary };
        if (prevStatus) {
          nextSummary[prevStatus] = Math.max(0, nextSummary[prevStatus] - 1);
        }
        if (status) {
          nextSummary[status] = nextSummary[status] + 1;
        }
        // Total: if we previously had no response and now set one, +1.
        // If we previously had a response and now clear it, -1.
        // Otherwise (transitioning between buckets), unchanged.
        if (!prevStatus && status) {
          nextSummary.total = nextSummary.total + 1;
        } else if (prevStatus && !status) {
          nextSummary.total = Math.max(0, nextSummary.total - 1);
        }
        setCheckInSummary(nextSummary);
      }
      setCheckInError(null);

      try {
        if (status === null) {
          await eventsApi.deleteCheckIn(eventId);
          setMyCheckIn(null);
        } else {
          const row = await eventsApi.checkIn(eventId, status);
          setMyCheckIn(row);
        }
      } catch {
        // Revert
        setMyCheckIn(prevCheckIn);
        setCheckInSummary(prevSummary);
        setCheckInError('events.checkIn.error');
      }
    },
    [eventId, myCheckIn, checkInSummary]
  );

  // A swap can re-insert the focused row, and a match that reaches the end of
  // its section disables the control just used, so focus is set explicitly.
  useLayoutEffect(() => {
    const pendingFocus = moveFocusRef.current;
    if (!pendingFocus) return;
    moveFocusRef.current = null;
    const { matchId, direction } = pendingFocus;
    const usedControl = moveControlsRef.current.get(`${matchId}:${direction}`);
    const otherControl = moveControlsRef.current.get(`${matchId}:${direction === 'up' ? 'down' : 'up'}`);
    (usedControl && !usedControl.disabled ? usedControl : otherControl)?.focus();
  }, [eventData]);

  const scheduledMatchesById = useMemo(() => {
    const map = new Map<string, Match>();
    for (const m of scheduledMatches) {
      map.set(m.matchId, m);
    }
    return map;
  }, [scheduledMatches]);

  const bookedPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    const matches = eventData?.enrichedMatches ?? [];
    for (const match of matches) {
      for (const participant of match.matchData?.participants ?? []) {
        if (participant.playerId) {
          ids.add(participant.playerId);
        }
      }
    }
    return ids;
  }, [eventData?.enrichedMatches]);

  const checkInStatusByPlayerId = useMemo(
    () => buildCheckInStatusMap(checkInRoster),
    [checkInRoster],
  );

  // Refetches keep the current page on screen so open forms and slots survive.
  if (loading && eventData?.eventId !== eventId) {
    return (
      <div className="event-detail-page">
        <Skeleton variant="block" count={4} />
      </div>
    );
  }

  if (error || !eventData) {
    return (
      <div className="event-detail-page">
        <EmptyState
          title={error || t('events.detail.notFound')}
          actionLabel={t('events.detail.backToEvents')}
          onAction={() => navigate('/events')}
        />
      </div>
    );
  }

  const formattedDate = formatCalendarDate(eventData.date, undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Separate pre-show and main card matches
  const enrichedMatches = eventData.enrichedMatches || [];
  const preShowMatches = enrichedMatches.filter(isPreShowCard);
  const mainCardMatches = enrichedMatches.filter((m) => !isPreShowCard(m));

  // MSL-04: a wrestler can only hold one slot across the whole event card.
  // If the viewing user already occupies a slot in any match on this event,
  // we record that matchId so we can disable the Claim button on every
  // OTHER match. The user's own match keeps Claim enabled (idempotent
  // re-claim is a no-op, and matters for the rare case where they want to
  // move within the same match — though MSL-01 already prevents that).
  const userOccupiedMatchId: string | null = playerId
    ? (enrichedMatches.find((m) =>
        m.matchData?.slots?.some((s) => s.playerId === playerId),
      )?.matchId ?? null)
    : null;

  const handleRecordResult = (matchId: string) => {
    setRecordingMatchId(matchId);
    setEditingMatchId(null);
    setMatchActionError(null);
  };

  const handleEditMatch = (matchId: string) => {
    setEditingMatchId(matchId);
    setRecordingMatchId(null);
    setMatchActionError(null);
  };

  const handleCloseMatchForm = () => {
    setRecordingMatchId(null);
    setEditingMatchId(null);
    setMatchActionError(null);
  };

  const canAddMatch = isAdminOrModerator && (eventData.status === 'upcoming' || eventData.status === 'in-progress');

  const describeMatch = (match: typeof enrichedMatches[number]) => {
    if (!match.matchData) return t('events.detail.matchTBA', 'Match TBA');
    const { matchFormat, participants, teams } = match.matchData;
    if (participants.length === 0) return formatMatchType(matchFormat, t);
    const sides = groupMatchSides(participants, (participant) => participant.playerId, teams, matchFormat);
    return describeSides(
      sides.map((side) => side.map((participant) => participant.wrestlerName)),
      t('common.vs'),
    );
  };

  const renderMoveControls = (match: typeof enrichedMatches[number]) => {
    const index = enrichedMatches.indexOf(match);
    // Saves replace the whole list, so one must not overlap a match delete.
    const locked = savingCardOrder || !!deletingMatchId;
    const matchName = describeMatch(match);
    const renderControl = (direction: CardMoveDirection) => {
      const controlKey = `${match.matchId}:${direction}`;
      return (
        <Button
          ref={(control) => {
            if (control) moveControlsRef.current.set(controlKey, control);
            else moveControlsRef.current.delete(controlKey);
          }}
          className="event-match__move"
          variant="secondary"
          size="sm"
          icon={direction === 'up' ? <ArrowUp aria-hidden="true" size={18} /> : <ArrowDown aria-hidden="true" size={18} />}
          aria-label={direction === 'up'
            ? t('events.detail.moveMatchUp', { match: matchName, defaultValue: 'Move {{match}} up' })
            : t('events.detail.moveMatchDown', { match: matchName, defaultValue: 'Move {{match}} down' })}
          disabled={findMoveTarget(enrichedMatches, index, direction) === null}
          // Not the native attribute: that would drop keyboard focus mid-save.
          aria-disabled={locked || undefined}
          onClick={locked ? undefined : () => void handleMoveMatch(index, direction)}
        />
      );
    };
    return (
      <div className="event-match__order">
        {renderControl('up')}
        {renderControl('down')}
      </div>
    );
  };

  const renderMatchEntry = (
    match: typeof enrichedMatches[number],
  ) => {
    const slots = match.matchData?.slots;
    const isScheduled = match.matchData?.status === 'scheduled';

    return (
      <MatchEntry
        key={match.matchId}
        match={match}
        isCompleted={match.matchData?.status === 'completed'}
        isAdmin={isAdminOrModerator}
        isDeleting={deletingMatchId === match.matchId}
        isSavingOrder={savingCardOrder}
        orderControls={canAddMatch ? renderMoveControls(match) : undefined}
        onRecordResult={isAdminOrModerator && isScheduled ? () => handleRecordResult(match.matchId) : undefined}
        onEdit={isAdminOrModerator && isScheduled ? () => handleEditMatch(match.matchId) : undefined}
        onDelete={isAdminOrModerator ? () => handleRequestDeleteMatch(match.matchId) : undefined}
        onRemoveCard={isAdminOrModerator && !deletingMatchId
          ? () => void handleRemoveCard(enrichedMatches.indexOf(match))
          : undefined}
        onMatchUpdated={refreshAfterMutation}
      >
        {slots && slots.length > 0 && match.matchData && (
          <MatchSlots
            matchId={match.matchId}
            slots={slots}
            matchStatus={match.matchData.status}
            currentPlayerId={playerId ?? undefined}
            isAdmin={isAdminOrModerator}
            isAuthenticated={isAuthenticated}
            onClaim={(slotId, options) => handleClaimSlot(match.matchId, slotId, options)}
            onRelease={(slotId) => handleReleaseSlot(match.matchId, slotId)}
            onLoginRequired={handleLoginRequired}
            onAdminEdit={isAdminOrModerator
              ? (slot) => handleAdminEditSlot(match.matchId, slot)
              : undefined}
            claimDisabled={
              !!eventData.checkInsLocked ||
              (!!userOccupiedMatchId && userOccupiedMatchId !== match.matchId)
            }
            disableClaimReason={
              eventData.checkInsLocked
                ? t('events.checkIn.lockedByAdmin', {
                    defaultValue: 'Sign-ups are closed for this event.',
                  })
                : t('matches.slots.alreadyBookedTooltip', {
                    defaultValue: 'You already have a slot in another match on this event',
                  })
            }
            currentPlayerCurrentWrestler={currentWrestler}
            currentPlayerAlternateWrestler={alternateWrestler}
            winnerPlayerIds={match.matchData.losers?.length ? match.matchData.winners : undefined}
            loserPlayerIds={match.matchData.losers}
          />
        )}
      </MatchEntry>
    );
  };

  const goToSchedule = () => navigate('/admin/schedule', {
    state: { fromEvent: { eventId: eventData.eventId, name: eventData.name, date: eventData.date } },
  });
  const recordingMatch = recordingMatchId ? scheduledMatchesById.get(recordingMatchId) : undefined;
  const lockLabel = eventData.checkInsLocked
    ? t('events.admin.lockSignups.unlock', 'Unlock sign-ups')
    : t('events.admin.lockSignups.lock', 'Lock sign-ups');
  const hasCompletedMatch = enrichedMatches.some((match) => match.matchData?.status === 'completed');
  const subtitle = [formattedDate, eventData.venue].filter(Boolean).join(' · ');

  return (
    <div className="event-detail-page">
      <Button className="event-detail-back" variant="ghost" size="sm" to="/events" icon={<ArrowLeft aria-hidden="true" size={18} />}>
        {t('events.detail.backToEvents')}
      </Button>

      <section className="poster-hero event-hero">
        <div className="event-hero__content">
          <div className="event-hero__badges">
            <Badge tone={EVENT_STATUS_TONES[eventData.status]}>{t(`events.status.${eventData.status}`)}</Badge>
            <Badge tone={EVENT_TYPE_TONES[eventData.eventType]}>{t(`events.types.${eventData.eventType}`)}</Badge>
          </div>
          <PageHeader
            title={eventData.name}
            subtitle={subtitle}
            actions={(
              <>
                {hasCompletedMatch && (
                  <Button to={`/events/${eventData.eventId}/results`} icon={<Trophy aria-hidden="true" size={18} />}>
                    {t('events.detail.viewResults')}
                  </Button>
                )}
                {enrichedMatches.length > 0 && (
                  <Button variant="secondary" to={`/events/${eventData.eventId}/commentary`} icon={<Mic aria-hidden="true" size={18} />}>
                    {t('events.detail.openCommentary')}
                  </Button>
                )}
              </>
            )}
          />
          {eventData.description && <p className="event-hero__description">{eventData.description}</p>}
          {(eventData.attendance || eventData.rating) && (
            <dl className="event-hero__facts">
              {eventData.attendance && (
                <div>
                  <dt>{t('events.detail.attendance')}</dt>
                  <dd>{eventData.attendance.toLocaleString()}</dd>
                </div>
              )}
              {eventData.rating && (
                <div>
                  <dt>{t('events.detail.rating')}</dt>
                  <dd>{eventData.rating}/5</dd>
                </div>
              )}
            </dl>
          )}
        </div>
        {eventData.imageUrl && (
          <div className="poster-hero__frame">
            <img src={eventData.imageUrl} alt="" className="poster-hero__image" />
          </div>
        )}
      </section>

      {isAdminOrModerator && (
        <section className="event-manage" aria-label={t('events.detail.manage', 'Manage event')}>
          <Select
            className="event-manage__status"
            label={t('events.detail.statusLabel', 'Event status')}
            value={eventData.status}
            onValueChange={handleStatusChange}
            disabled={updatingStatus}
            options={EVENT_STATUSES.map((status) => ({ value: status, label: t(`events.status.${status}`) }))}
          />
          <Button variant="secondary" size="sm" icon={<CalendarClock aria-hidden="true" size={18} />} onClick={handleOpenDetails}>
            {t('events.detail.editDetails', 'Edit date and venue')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={eventData.checkInsLocked ? <LockOpen aria-hidden="true" size={18} /> : <Lock aria-hidden="true" size={18} />}
            onClick={handleToggleSignupLock}
            loading={togglingLock}
            aria-pressed={!!eventData.checkInsLocked}
          >
            {lockLabel}
          </Button>
          <Button
            className="event-manage__delete"
            variant="danger"
            size="sm"
            icon={<Trash2 aria-hidden="true" size={18} />}
            onClick={handleRequestDeleteEvent}
            loading={deleting}
          >
            {t('events.admin.deleteEvent')}
          </Button>
          {manageError && <p className="event-detail-error" role="alert">{manageError}</p>}
        </section>
      )}

      {isAuthenticated && isWrestler && playerId && checkInSummary && (
        <Card className="event-rsvp">
          <h2 className="event-section-title">{t('events.checkIn.title')}</h2>
          <EventCheckIn
            eventStatus={eventData.status}
            currentStatus={myCheckIn?.status ?? null}
            summary={checkInSummary}
            onChange={handleCheckInChange}
            signupsLocked={!!eventData.checkInsLocked}
          />
          {checkInError && (
            <p className="event-detail-error" role="alert">
              {t(checkInError, { defaultValue: 'Failed to update check-in.' })}
            </p>
          )}
        </Card>
      )}

      <section className="event-card-section">
        <div className="event-card-section__header">
          <h2 className="event-section-title">{t('events.detail.matchCard')}</h2>
          {canAddMatch && enrichedMatches.length > 0 && (
            <Button variant="secondary" size="sm" icon={<Plus aria-hidden="true" size={18} />} onClick={goToSchedule}>
              {t('events.detail.addMatch', 'Add Match')}
            </Button>
          )}
        </div>

        {matchActionError && <p className="event-detail-error" role="alert">{matchActionError}</p>}

        {enrichedMatches.length === 0 ? (
          <EmptyState
            title={t('events.detail.noMatches')}
            actionLabel={canAddMatch ? t('events.detail.scheduleFirstMatch', 'Schedule First Match') : undefined}
            onAction={canAddMatch ? goToSchedule : undefined}
          />
        ) : (
          <>
            {preShowMatches.length > 0 && (
              <>
                <h3 className="event-card-section__divider">{t('events.detail.preShow')}</h3>
                <div className="event-match-list">{preShowMatches.map(renderMatchEntry)}</div>
              </>
            )}
            {mainCardMatches.length > 0 && (
              <>
                {preShowMatches.length > 0 && (
                  <h3 className="event-card-section__divider">{t('events.detail.mainCard')}</h3>
                )}
                <div className="event-match-list">{mainCardMatches.map(renderMatchEntry)}</div>
              </>
            )}
          </>
        )}
      </section>

      {isAdminOrModerator && eventId && (
        <EventCheckInRosterPanel eventId={eventId} bookedPlayerIds={bookedPlayerIds} />
      )}

      <Modal
        open={!!recordingMatchId}
        onClose={handleCloseMatchForm}
        title={t('events.detail.recordResult', 'Record Result')}
      >
        {recordingMatch ? (
          <MatchResultForm
            match={recordingMatch}
            players={players}
            tagTeams={tagTeams}
            onSuccess={refreshAfterMutation}
            onCancel={handleCloseMatchForm}
          />
        ) : (
          <p className="event-detail-error" role="alert">
            {t('events.detail.matchNotFound', 'Match data is not available. Try refreshing the page.')}
          </p>
        )}
      </Modal>

      <Modal
        open={!!editingMatchId}
        onClose={handleCloseMatchForm}
        title={t('events.detail.editMatchTitle', 'Edit match')}
        size="lg"
      >
        {editingMatchId && (
          <MatchEditForm
            matchId={editingMatchId}
            lockedEventId={eventData.eventId}
            onSuccess={refreshAfterMutation}
            onCancel={handleCloseMatchForm}
          />
        )}
      </Modal>

      <Modal
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        title={t('events.detail.editDetails', 'Edit date and venue')}
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setDetailsOpen(false)} disabled={savingDetails}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleSaveDetails} loading={savingDetails}>{t('common.save', 'Save')}</Button>
          </>
        )}
      >
        <div className="event-details-form">
          {detailsError && <p className="event-detail-error" role="alert">{detailsError}</p>}
          <label className="event-details-form__field">
            <span>{t('events.admin.editDate.label', 'Event date')}</span>
            <input type="date" value={dateDraft} onChange={(e) => setDateDraft(e.target.value)} disabled={savingDetails} />
          </label>
          <label className="event-details-form__field">
            <span>{t('events.admin.editVenue.label', 'Event location')}</span>
            <input
              type="text"
              value={venueDraft}
              onChange={(e) => setVenueDraft(e.target.value)}
              disabled={savingDetails}
              maxLength={120}
              placeholder={t('events.admin.editVenue.placeholder', 'e.g., Madison Square Garden, New York')}
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title={t('events.detail.confirmDeleteTitle', 'Confirm delete')}
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setPendingDelete(null)}>{t('common.cancel', 'Cancel')}</Button>
            <Button variant="danger" onClick={handleConfirmDelete}>{t('common.delete', 'Delete')}</Button>
          </>
        )}
      >
        <p>{pendingDelete?.message}</p>
      </Modal>

      <SlotEditDialog
        slot={editingSlot?.slot ?? null}
        players={players}
        checkInStatusByPlayerId={checkInStatusByPlayerId}
        bookedPlayerIds={bookedPlayerIds}
        bookingInfoByPlayerId={bookingInfo}
        onSave={handleSlotEditSave}
        onClose={() => setEditingSlot(null)}
      />
    </div>
  );
}

interface MatchEntryProps {
  match: {
    position: number;
    matchId: string;
    designation: MatchDesignation;
    notes?: string;
    matchData: {
      matchId: string;
      matchFormat: string;
      stipulationId?: string;
      stipulationName?: string;
      participants: MatchSideParticipant[];
      teams?: string[][];
      winners?: string[];
      losers?: string[];
      isChampionship: boolean;
      championshipName?: string;
      status: MatchStatus;
      starRating?: number;
      ratingsCount?: number;
      userHasRated?: boolean;
      userRating?: number | null;
      matchOfTheNight?: boolean;
    } | null;
  };
  isCompleted: boolean;
  isAdmin?: boolean;
  isDeleting?: boolean;
  /** True while the card order saves. A delete or edit must not overlap that write. */
  isSavingOrder?: boolean;
  /** Staff controls for moving this match up and down the card. */
  orderControls?: ReactNode;
  onRecordResult?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Offered on a card whose match no longer exists. */
  onRemoveCard?: () => void;
  /** Invoked after a rating submission or a MOTN toggle so the parent can
   *  refetch the event and propagate the new aggregate / state. */
  onMatchUpdated?: () => void;
  /** Slot list, shown inside the match row so it does not read as a second card. */
  children?: ReactNode;
}

function MatchEntry({
  match,
  isCompleted,
  isAdmin = false,
  isDeleting = false,
  isSavingOrder = false,
  orderControls,
  onRecordResult,
  onEdit,
  onDelete,
  onRemoveCard,
  onMatchUpdated,
  children,
}: MatchEntryProps) {
  const { t } = useTranslation();
  const { designation, matchData } = match;
  const isMainEvent = designation === 'main-event';
  const entryClass = `event-match${isMainEvent ? ' event-match--main' : ''}`;
  const designationBadge = (
    <Badge tone={isMainEvent ? 'pink' : 'neutral'}>{t(DESIGNATION_LABEL_KEYS[designation])}</Badge>
  );

  if (!matchData) {
    return (
      <article className={entryClass}>
        <div className="event-match__header">
          {designationBadge}
          <span className="event-match__type">{t('events.detail.matchTBA', 'Match TBA')}</span>
          {orderControls}
          {onRemoveCard && (
            <Button variant="secondary" size="sm" disabled={isSavingOrder} onClick={onRemoveCard}>
              {t('events.detail.removeFromCard', 'Remove from card')}
            </Button>
          )}
        </div>
      </article>
    );
  }

  const isDraw = isCompleted && (matchData.winners?.length ?? 0) > 0 && (matchData.losers?.length ?? 0) === 0;

  return (
    <article className={entryClass}>
      <div className="event-match__header">
        {designationBadge}
        <span className="event-match__type">
          {formatMatchType(matchData.matchFormat, t)}
          {matchData.stipulationName && ` · ${matchData.stipulationName}`}
        </span>
        {matchData.isChampionship && (
          <Badge tone="warning">{matchData.championshipName || t('events.detail.championshipMatch')}</Badge>
        )}
        {isCompleted && matchData.matchOfTheNight && (
          <Badge tone="violet">{t('match.matchOfTheNightBadge')}</Badge>
        )}
        {isCompleted && matchData.starRating != null && (
          <StarRating starRating={matchData.starRating} ratingsCount={matchData.ratingsCount} size="sm" />
        )}
        {orderControls}
      </div>

      <MatchSides
        participants={matchData.participants}
        teams={matchData.teams}
        matchFormat={matchData.matchFormat}
        winners={isCompleted && !isDraw ? matchData.winners : undefined}
        losers={isCompleted ? matchData.losers : undefined}
      />

      {match.notes && <p className="event-match__notes">{match.notes}</p>}

      {children}

      {isCompleted && (
        <div className="event-match__rating">
          <RateMatchWidget
            matchId={matchData.matchId}
            matchStatus={matchData.status}
            userHasRated={matchData.userHasRated ?? false}
            userRating={matchData.userRating ?? null}
            onRated={onMatchUpdated}
          />
          {isAdmin && (
            <MotnToggleButton
              matchId={matchData.matchId}
              matchOfTheNight={!!matchData.matchOfTheNight}
              onToggled={onMatchUpdated}
            />
          )}
        </div>
      )}

      {isAdmin && (onRecordResult || onEdit || onDelete) && (
        <div className="event-match__actions">
          {onRecordResult && (
            <Button size="sm" onClick={onRecordResult} disabled={isDeleting || isSavingOrder}>
              {t('events.detail.recordResult', 'Record Result')}
            </Button>
          )}
          {onEdit && (
            <Button variant="secondary" size="sm" icon={<Pencil aria-hidden="true" size={16} />} onClick={onEdit} disabled={isDeleting || isSavingOrder}>
              {t('events.detail.editMatch', 'Edit')}
            </Button>
          )}
          {onDelete && (
            <Button variant="ghost" size="sm" icon={<Trash2 aria-hidden="true" size={16} />} onClick={onDelete} loading={isDeleting} disabled={isSavingOrder}>
              {t('events.detail.deleteMatch', 'Delete')}
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
