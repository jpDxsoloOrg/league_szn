import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import type { MatchDesignation, MatchCardEntry, LeagueEvent } from '../../types/event';
import type { Player } from '../../types';
import { matchesApi, playersApi, eventsApi } from '../../services/api';
import { formatCalendarDate } from '../../utils/dateUtils';
import SearchableSelect from './SearchableSelect';
import EventCheckInRosterPanel from '../events/EventCheckInRosterPanel';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import AdminNotice from './AdminNotice';
import './adminRoster.css';
import './MatchCardBuilder.css';

const designationOptions: { value: MatchDesignation; labelKey: string }[] = [
  { value: 'pre-show', labelKey: 'events.designations.preShow' },
  { value: 'opener', labelKey: 'events.designations.opener' },
  { value: 'midcard', labelKey: 'events.designations.midcard' },
  { value: 'co-main', labelKey: 'events.designations.coMain' },
  { value: 'main-event', labelKey: 'events.designations.mainEvent' },
];

interface AvailableMatch {
  matchId: string;
  label: string;
  isChampionship: boolean;
}

interface CardMatch extends MatchCardEntry {
  label: string;
  isChampionship: boolean;
}

export default function MatchCardBuilder() {
  const { t } = useTranslation();

  const [events, setEvents] = useState<LeagueEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [cardMatches, setCardMatches] = useState<CardMatch[]>([]);
  const [availableMatches, setAvailableMatches] = useState<AvailableMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load events and scheduled matches on mount
  useEffect(() => {
    const loadData = async () => {
      const errors: string[] = [];

      const [eventsResult, matchesResult, playersResult] = await Promise.allSettled([
        eventsApi.getAll(),
        matchesApi.getAll({ status: 'scheduled' }),
        playersApi.getAllIncludingHidden(),
      ]);

      if (eventsResult.status === 'fulfilled') {
        setEvents(eventsResult.value);
      } else {
        errors.push(`Events: ${eventsResult.reason}`);
      }

      const players = playersResult.status === 'fulfilled' ? playersResult.value : [];
      if (playersResult.status === 'rejected') {
        errors.push(`Players: ${playersResult.reason}`);
      }

      const playerMap = new Map<string, Player>(
        players.map((p) => [p.playerId, p])
      );

      if (matchesResult.status === 'fulfilled') {
        const available: AvailableMatch[] = matchesResult.value.map((match) => {
          const participantNames = match.participants
            .map((id) => playerMap.get(id)?.name ?? 'Unknown')
            .join(' vs ');
          const label = `${participantNames} (${match.matchFormat})`;
          return {
            matchId: match.matchId,
            label,
            isChampionship: match.isChampionship,
          };
        });
        setAvailableMatches(available);
      } else {
        errors.push(`Matches: ${matchesResult.reason}`);
      }

      if (errors.length > 0) {
        setLoadError(errors.join('; '));
      }
      setLoading(false);
    };
    loadData();
  }, []);

  // When event selection changes, load its existing match cards
  useEffect(() => {
    if (!selectedEventId) {
      setCardMatches([]);
      return;
    }
    const selectedEvent = events.find((e) => e.eventId === selectedEventId);
    if (!selectedEvent) {
      setCardMatches([]);
      return;
    }

    const existingCards: CardMatch[] = (selectedEvent.matchCards || []).map((card) => {
      const matchInfo = availableMatches.find((m) => m.matchId === card.matchId);
      return {
        ...card,
        label: matchInfo?.label ?? card.matchId,
        isChampionship: matchInfo?.isChampionship ?? false,
      };
    });
    setCardMatches(existingCards);
  }, [selectedEventId, events, availableMatches]);

  const [selectedMatchToAdd, setSelectedMatchToAdd] = useState('');

  const usedMatchIds = new Set(cardMatches.map((m) => m.matchId));
  const availableToAdd = availableMatches.filter(
    (m) => !usedMatchIds.has(m.matchId)
  );
  const selectedEvent = events.find((event) => event.eventId === selectedEventId);

  const handleDesignationChange = (index: number, designation: MatchDesignation) => {
    setCardMatches((prev) =>
      prev.map((m, i) => (i === index ? { ...m, designation } : m))
    );
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setCardMatches((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
      return next.map((m, i) => ({ ...m, position: i + 1 }));
    });
  };

  const handleMoveDown = (index: number) => {
    if (index === cardMatches.length - 1) return;
    setCardMatches((prev) => {
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
      return next.map((m, i) => ({ ...m, position: i + 1 }));
    });
  };

  const handleRemove = (index: number) => {
    setCardMatches((prev) =>
      prev.filter((_, i) => i !== index).map((m, i) => ({ ...m, position: i + 1 }))
    );
  };

  const handleAddMatch = () => {
    if (!selectedMatchToAdd) return;
    const match = availableMatches.find((m) => m.matchId === selectedMatchToAdd);
    if (!match) return;

    setCardMatches((prev) => [
      ...prev,
      {
        position: prev.length + 1,
        matchId: match.matchId,
        designation: 'midcard' as MatchDesignation,
        label: match.label,
        isChampionship: match.isChampionship,
      },
    ]);
    setSelectedMatchToAdd('');
  };

  const handleSaveMatchCard = async () => {
    if (!selectedEventId) return;
    try {
      setSaving(true);
      setMessage(null);
      const matchCards: MatchCardEntry[] = cardMatches.map(({ position, matchId, designation, notes }) => ({
        position,
        matchId,
        designation,
        notes,
      }));
      const updated = await eventsApi.update(selectedEventId, { matchCards });
      // Update local events list with the saved data
      setEvents((prev) =>
        prev.map((e) => (e.eventId === selectedEventId ? updated : e))
      );
      setMessage({ type: 'success', text: t('events.admin.matchCardSaved', 'Match card saved successfully!') });
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : t('adminRoster.matchCard.saveError', 'Failed to save match card'),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ar-page match-card-builder">
      <PageHeader
        title={t('events.admin.matchCardBuilder')}
        subtitle={t('events.admin.matchCardBuilderHint', 'Reorder matches, change designations, or add unassigned matches to an event card. Matches can be assigned to events when scheduling them.')}
      />

      {loadError && <AdminNotice tone="error">{loadError}</AdminNotice>}

      {loading ? <Skeleton variant="block" count={3} /> : (
        <>
          <div className="ar-field builder-event-selector">
            <label className="ar-field__label" htmlFor="event-select">
              {t('events.admin.selectEvent', 'Select Event')}
            </label>
            <SearchableSelect
              id="event-select"
              value={selectedEventId}
              onChange={(value) => setSelectedEventId(value)}
              placeholder={t('events.admin.chooseEvent', '-- Choose an event --')}
              options={[
                { value: '', label: t('events.admin.chooseEvent', '-- Choose an event --') },
                ...events.map((ev) => ({
                  value: ev.eventId,
                  label: `${ev.name} (${formatCalendarDate(ev.date)})`,
                })),
              ]}
            />
            {selectedEvent && (
              <p className="ar-hint">
                {t(`events.status.${selectedEvent.status}`)}
                {selectedEvent.venue ? ` · ${selectedEvent.venue}` : ''}
              </p>
            )}
          </div>

          {!selectedEventId ? (
            <EmptyState title={t('events.admin.selectEventFirst', 'Select an event above to manage its match card.')} />
          ) : (
            <div className="builder-layout">
              <div className="ar-page">
                {cardMatches.length === 0 ? (
                  <EmptyState title={t('events.admin.noMatchesOnCard')} />
                ) : (
                  <ol className="ar-list">
                    {cardMatches.map((match, index) => (
                      <li
                        key={match.matchId}
                        className={`ar-list__row builder-match-item builder-match-item--${match.designation}`}
                      >
                        <span className="builder-match-position">#{match.position}</span>

                        <div className="builder-match-content">
                          <span className="ar-strong">{match.label}</span>
                          {match.isChampionship && (
                            <Badge tone="warning">{t('events.admin.championshipMatch')}</Badge>
                          )}
                        </div>

                        <select
                          className="ar-input designation-select"
                          aria-label={`${t('adminRoster.matchCard.designationFor', 'Card position for')} ${match.label}`}
                          value={match.designation}
                          onChange={(e) => handleDesignationChange(index, e.target.value as MatchDesignation)}
                        >
                          {designationOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {t(opt.labelKey)}
                            </option>
                          ))}
                        </select>

                        <div className="ar-row-actions builder-match-actions">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMoveUp(index)}
                            disabled={index === 0}
                            title={t('events.admin.moveUp')}
                            aria-label={t('events.admin.moveUp')}
                            icon={<ArrowUp aria-hidden="true" size={16} />}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMoveDown(index)}
                            disabled={index === cardMatches.length - 1}
                            title={t('events.admin.moveDown')}
                            aria-label={t('events.admin.moveDown')}
                            icon={<ArrowDown aria-hidden="true" size={16} />}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemove(index)}
                            title={t('events.admin.removeMatch')}
                            aria-label={t('events.admin.removeMatch')}
                            icon={<X aria-hidden="true" size={16} />}
                          />
                        </div>
                      </li>
                    ))}
                  </ol>
                )}

                {availableToAdd.length > 0 && (
                  <div className="builder-add-section">
                    <select
                      className="ar-input add-match-select"
                      aria-label={t('events.admin.selectMatch')}
                      value={selectedMatchToAdd}
                      onChange={(e) => setSelectedMatchToAdd(e.target.value)}
                    >
                      <option value="">{t('events.admin.selectMatch')}</option>
                      {availableToAdd.map((m) => (
                        <option key={m.matchId} value={m.matchId}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <Button variant="secondary" onClick={handleAddMatch} disabled={!selectedMatchToAdd}>
                      {t('events.admin.addMatch')}
                    </Button>
                  </div>
                )}

                {message && (
                  <AdminNotice tone={message.type === 'success' ? 'success' : 'error'}>{message.text}</AdminNotice>
                )}

                <div>
                  <Button onClick={handleSaveMatchCard} loading={saving}>
                    {saving
                      ? t('common.saving', 'Saving...')
                      : t('events.admin.saveMatchCard', 'Save Match Card')}
                  </Button>
                </div>
              </div>
              <aside className="builder-sidebar">
                <EventCheckInRosterPanel eventId={selectedEventId} compact />
              </aside>
            </div>
          )}
        </>
      )}
    </div>
  );
}
