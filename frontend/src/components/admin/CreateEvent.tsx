import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { EventType, LeagueEvent } from '../../types/event';
import type { Season, Company } from '../../types';
import { eventsApi, seasonsApi, companiesApi } from '../../services/api';
import './CreateEvent.css';

const eventTypeOptions: { value: EventType; labelKey: string }[] = [
  { value: 'ppv', labelKey: 'events.types.ppv' },
  { value: 'weekly', labelKey: 'events.types.weekly' },
  { value: 'special', labelKey: 'events.types.special' },
  { value: 'house', labelKey: 'events.types.house' },
];

const presetColors = [
  '#d4af37', '#dc2626', '#1e40af', '#a78bfa',
  '#4ade80', '#f59e0b', '#ec4899', '#6b7280',
];

function formatEventDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function canDeleteEvent(event: LeagueEvent): boolean {
  return !event.matchCards || event.matchCards.length === 0;
}

export default function CreateEvent() {
  const { t } = useTranslation();
  const loadEventsErrorFallbackRef = useRef(t('events.admin.loadEventsError'));
  const [name, setName] = useState('');
  const [eventType, setEventType] = useState<EventType>('weekly');
  const [date, setDate] = useState('');
  const [venue, setVenue] = useState('');
  const [description, setDescription] = useState('');
  const [themeColor, setThemeColor] = useState('#d4af37');
  const [seasonId, setSeasonId] = useState('');
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [events, setEvents] = useState<LeagueEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deletableEvents = events.filter(canDeleteEvent);
  const shouldShowExistingEventsSection =
    loadingEvents || !!loadError || !!deleteError || deletableEvents.length > 0;

  useEffect(() => {
    seasonsApi.getAll().then(setSeasons).catch(() => {});
    companiesApi.getAll().then(setCompanies).catch(() => {});
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const loadEvents = async () => {
      try {
        setLoadingEvents(true);
        setLoadError(null);
        setDeleteError(null);
        const data = await eventsApi.getAll(undefined, controller.signal);
        setEvents(data);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setLoadError(err instanceof Error ? err.message : loadEventsErrorFallbackRef.current);
      } finally {
        setLoadingEvents(false);
      }
    };
    loadEvents();
    return () => controller.abort();
  }, []);

  const handleSave = async () => {
    if (!name || !date) return;
    try {
      setSaving(true);
      setError(null);
      setDeleteError(null);
      const created = await eventsApi.create({
        name,
        eventType,
        date: new Date(date).toISOString(),
        venue: venue || undefined,
        description: description || undefined,
        themeColor,
        seasonId: seasonId || undefined,
        companyIds: selectedCompanyIds.length > 0 ? selectedCompanyIds : undefined,
      });
      setSaved(true);
      setEvents((prev) => [created, ...prev]);
      setName('');
      setDate('');
      setVenue('');
      setDescription('');
      setSeasonId('');
      setSelectedCompanyIds([]);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ev: LeagueEvent) => {
    if (!window.confirm(t('events.admin.confirmDeleteEvent', { name: ev.name }))) return;
    try {
      setDeleting(ev.eventId);
      setDeleteError(null);
      await eventsApi.delete(ev.eventId);
      setEvents((prev) => prev.filter((e) => e.eventId !== ev.eventId));
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t('events.admin.deleteEventError'));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="create-event">
      <h3 className="create-event-title">{t('events.admin.createEvent')}</h3>

      {/* Existing events list */}
      {shouldShowExistingEventsSection && (
        <section className="create-event-existing">
          <h4 className="create-event-existing-title">{t('events.admin.existingEvents')}</h4>
          {loadingEvents ? (
            <p className="create-event-loading">{t('events.admin.loadingEvents')}</p>
          ) : (
            <>
              {loadError && (
                <div className="create-event-error-msg" role="alert">
                  {loadError}
                </div>
              )}
              {deleteError && (
                <div className="create-event-error-msg" role="alert">
                  {deleteError}
                </div>
              )}
              {deletableEvents.length > 0 && (
                <ul className="create-event-list">
                  {deletableEvents.map((ev) => (
                    <li key={ev.eventId} className="create-event-list-item">
                      <div className="create-event-list-item-info">
                        <span className="create-event-list-item-name">{ev.name}</span>
                        <span className="create-event-list-item-meta">
                          {t(`events.types.${ev.eventType}`)} · {formatEventDate(ev.date)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="create-event-delete-btn"
                        onClick={() => handleDelete(ev)}
                        disabled={deleting === ev.eventId}
                        title={t('events.admin.deleteEvent')}
                        aria-label={t('events.admin.deleteEvent')}
                      >
                        {deleting === ev.eventId ? t('common.saving') : t('common.delete')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}

      <div className="create-event-form">
        {/* Name */}
        <div className="form-group">
          <label className="form-label">{t('events.admin.name')}</label>
          <input
            type="text"
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('events.admin.namePlaceholder')}
          />
        </div>

        {/* Event Type */}
        <div className="form-group">
          <label className="form-label">{t('events.admin.eventType')}</label>
          <select
            className="form-select"
            value={eventType}
            onChange={(e) => setEventType(e.target.value as EventType)}
          >
            {eventTypeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div className="form-group">
          <label className="form-label">{t('events.admin.date')}</label>
          <input
            type="datetime-local"
            className="form-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {/* Venue */}
        <div className="form-group">
          <label className="form-label">{t('events.admin.venue')}</label>
          <input
            type="text"
            className="form-input"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder={t('events.admin.venuePlaceholder')}
          />
        </div>

        {/* Description */}
        <div className="form-group">
          <label className="form-label">{t('events.admin.description')}</label>
          <textarea
            className="form-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('events.admin.descriptionPlaceholder')}
            rows={3}
          />
        </div>

        {/* Theme Color */}
        <div className="form-group">
          <label className="form-label">{t('events.admin.themeColor')}</label>
          <div className="color-picker-row">
            {presetColors.map((color) => (
              <button
                key={color}
                className={`color-preset ${themeColor === color ? 'selected' : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => setThemeColor(color)}
                type="button"
              />
            ))}
            <input
              type="color"
              className="color-input"
              value={themeColor}
              onChange={(e) => setThemeColor(e.target.value)}
            />
          </div>
        </div>

        {/* Season */}
        <div className="form-group">
          <label className="form-label">{t('events.admin.season')}</label>
          <select
            className="form-select"
            value={seasonId}
            onChange={(e) => setSeasonId(e.target.value)}
          >
            <option value="">{t('events.admin.noSeason')}</option>
            {seasons.map((s) => (
              <option key={s.seasonId} value={s.seasonId}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Companies */}
        {companies.length > 0 && (
          <div className="form-group">
            <label className="form-label">{t('companies.title')}</label>
            <div className="company-checkboxes">
              {companies.map((company) => (
                <label key={company.companyId} className="company-checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedCompanyIds.includes(company.companyId)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedCompanyIds(prev => [...prev, company.companyId]);
                      } else {
                        setSelectedCompanyIds(prev => prev.filter(id => id !== company.companyId));
                      }
                    }}
                  />
                  <span>{company.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Save Button */}
        <button
          className="save-event-btn"
          onClick={handleSave}
          disabled={!name || !date || saving}
        >
          {saving ? t('common.saving', 'Saving...') : t('events.admin.saveEvent')}
        </button>

        {saved && (
          <div className="save-success-msg">
            {t('events.admin.saveSuccess')}
          </div>
        )}

        {error && (
          <div className="save-error-msg" style={{ color: '#f87171', marginTop: '0.5rem' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}