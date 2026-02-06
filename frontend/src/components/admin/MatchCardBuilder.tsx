import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { MatchDesignation, MatchCardEntry, LeagueEvent } from '../../types/event';
import type { Player } from '../../types';
import { matchesApi, playersApi, eventsApi } from '../../services/api';
import './MatchCardBuilder.css';

const designationOptions: { value: MatchDesignation; labelKey: string }[] = [
  { value: 'pre-show', labelKey: 'events.designations.preShow' },
  { value: 'opener', labelKey: 'events.designations.opener' },
  { value: 'midcard', labelKey: 'events.designations.midcard' },
  { value: 'co-main', labelKey: 'events.designations.coMain' },
  { value: 'main-event', labelKey: 'events.designations.mainEvent' },
];

const designationColors: Record<MatchDesignation, string> = {
  'pre-show': '#6b7280',
  'opener': '#60a5fa',
  'midcard': '#a78bfa',
  'co-main': '#f59e0b',
  'main-event': '#d4af37',
};

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

  // Load events and scheduled matches on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [eventsList, matches, players] = await Promise.all([
          eventsApi.getAll(),
          matchesApi.getAll({ status: 'scheduled' }),
          playersApi.getAll(),
        ]);
        const playerMap = new Map<string, Player>(
          players.map((p) => [p.playerId, p])
        );

        setEvents(eventsList);

        const available: AvailableMatch[] = matches.map((match) => {
          const participantNames = match.participants
            .map((id) => playerMap.get(id)?.name ?? 'Unknown')
            .join(' vs ');
          const label = `${participantNames} (${match.matchType})`;
          return {
            matchId: match.matchId,
            label,
            isChampionship: match.isChampionship,
          };
        });
        setAvailableMatches(available);
      } catch {
        // Will show empty list on error
      } finally {
        setLoading(false);
      }
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
        text: err instanceof Error ? err.message : 'Failed to save match card',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="match-card-builder">
        <h3 className="builder-title">{t('events.admin.matchCardBuilder')}</h3>
        <p className="builder-empty">{t('common.loading', 'Loading...')}</p>
      </div>
    );
  }

  return (
    <div className="match-card-builder">
      <h3 className="builder-title">{t('events.admin.matchCardBuilder')}</h3>

      {/* Event Selector */}
      <div className="builder-event-selector" style={{ marginBottom: '1rem' }}>
        <label className="config-label" htmlFor="event-select">
          {t('events.admin.selectEvent', 'Select Event')}
        </label>
        <select
          id="event-select"
          className="config-select"
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
        >
          <option value="">{t('events.admin.chooseEvent', '-- Choose an event --')}</option>
          {events.map((ev) => (
            <option key={ev.eventId} value={ev.eventId}>
              {ev.name} ({new Date(ev.date).toLocaleDateString()})
            </option>
          ))}
        </select>
      </div>

      {!selectedEventId ? (
        <p className="builder-empty">{t('events.admin.selectEventFirst', 'Select an event above to manage its match card.')}</p>
      ) : (
        <>
          {cardMatches.length === 0 ? (
            <p className="builder-empty">{t('events.admin.noMatchesOnCard')}</p>
          ) : (
            <div className="builder-list">
              {cardMatches.map((match, index) => (
                <div
                  key={match.matchId}
                  className={`builder-match-item ${match.designation === 'main-event' ? 'main-event-item' : ''}`}
                >
                  <div className="builder-match-position">#{match.position}</div>

                  <div className="builder-match-content">
                    <div className="builder-match-label">
                      {match.label}
                      {match.isChampionship && (
                        <span className="builder-championship-tag">
                          {t('events.admin.championshipMatch')}
                        </span>
                      )}
                    </div>

                    <div className="builder-match-controls">
                      <select
                        className="designation-select"
                        value={match.designation}
                        onChange={(e) =>
                          handleDesignationChange(index, e.target.value as MatchDesignation)
                        }
                      >
                        {designationOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {t(opt.labelKey)}
                          </option>
                        ))}
                      </select>

                      <span
                        className="designation-indicator"
                        style={{ backgroundColor: designationColors[match.designation] }}
                      >
                        {t(
                          designationOptions.find((d) => d.value === match.designation)
                            ?.labelKey || ''
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="builder-match-actions">
                    <button
                      className="builder-action-btn"
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      title={t('events.admin.moveUp')}
                    >
                      &#9650;
                    </button>
                    <button
                      className="builder-action-btn"
                      onClick={() => handleMoveDown(index)}
                      disabled={index === cardMatches.length - 1}
                      title={t('events.admin.moveDown')}
                    >
                      &#9660;
                    </button>
                    <button
                      className="builder-action-btn remove-btn"
                      onClick={() => handleRemove(index)}
                      title={t('events.admin.removeMatch')}
                    >
                      &#10005;
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Match */}
          {availableToAdd.length > 0 && (
            <div className="builder-add-section">
              <select
                className="add-match-select"
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
              <button
                className="add-match-btn"
                onClick={handleAddMatch}
                disabled={!selectedMatchToAdd}
              >
                {t('events.admin.addMatch')}
              </button>
            </div>
          )}

          {/* Save Button */}
          <div className="config-actions" style={{ marginTop: '1rem' }}>
            <button
              className="btn-save"
              onClick={handleSaveMatchCard}
              disabled={saving}
            >
              {saving
                ? t('common.saving', 'Saving...')
                : t('events.admin.saveMatchCard', 'Save Match Card')}
            </button>
          </div>

          {message && (
            <div
              className={message.type === 'success' ? 'save-success-msg' : 'save-error-msg'}
              style={message.type === 'error' ? { color: '#f87171', marginTop: '0.5rem' } : { marginTop: '0.5rem' }}
            >
              {message.text}
            </div>
          )}
        </>
      )}
    </div>
  );
}
