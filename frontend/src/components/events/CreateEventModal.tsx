import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Company, Season, Show } from '../../types';
import type { CreateEventInput, EventType } from '../../types/event';
import { eventsApi, seasonsApi } from '../../services/api';
import { dateToCalendarDate } from '../../utils/dateUtils';
import { getPlannedShows } from '../../utils/showSchedule';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Select from '../ui/Select';
import './CreateEventModal.css';

const EVENT_TYPES: EventType[] = ['ppv', 'weekly', 'special', 'house'];

/** Values a calendar show or a picked calendar day pre-fills. */
export interface CreateEventPreset {
  name?: string;
  eventType?: EventType;
  date: string;
  showId?: string;
  companyId?: string;
}

interface CreateEventModalProps {
  open: boolean;
  onClose: () => void;
  shows: Show[];
  companies: Company[];
  preset?: CreateEventPreset | null;
  /** Events already booked, so picking a show suggests its next open date. */
  existingEvents?: { showId?: string; date: string }[];
}

interface EventDraft {
  name: string;
  eventType: EventType;
  date: string;
  venue: string;
  description: string;
  showId: string;
  companyId: string;
  seasonId: string;
}

function emptyDraft(preset?: CreateEventPreset | null): EventDraft {
  return {
    name: preset?.name ?? '',
    eventType: preset?.eventType ?? 'ppv',
    date: preset?.date ?? dateToCalendarDate(new Date()),
    venue: '',
    description: '',
    showId: preset?.showId ?? '',
    companyId: preset?.companyId ?? '',
    seasonId: '',
  };
}

/** Staff form that creates an event of any type and opens its match card. */
export default function CreateEventModal({
  open,
  onClose,
  shows,
  companies,
  preset,
  existingEvents = [],
}: CreateEventModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<EventDraft>(() => emptyDraft(preset));
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A date that came from the calendar or was typed is never overwritten.
  const [dateChosen, setDateChosen] = useState(false);
  const [seasonChosen, setSeasonChosen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(emptyDraft(preset));
    setDateChosen(!!preset?.date);
    setSeasonChosen(false);
    setError(null);
  }, [open, preset]);

  // New events belong to the running season unless staff pick otherwise.
  const activeSeasonId = seasons.find((season) => season.status === 'active')?.seasonId ?? '';
  useEffect(() => {
    if (!open || seasonChosen || !activeSeasonId) return;
    setDraft((previous) => (previous.seasonId ? previous : { ...previous, seasonId: activeSeasonId }));
  }, [open, seasonChosen, activeSeasonId]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const loadSeasons = async () => {
      try {
        const seasonData = await seasonsApi.getAll(controller.signal);
        if (!controller.signal.aborted) setSeasons(seasonData);
      } catch {
        // Season is optional, so the form still works without the list.
        if (!controller.signal.aborted) setSeasons([]);
      }
    };
    void loadSeasons();
    return () => controller.abort();
  }, [open]);

  const updateDraft = (changes: Partial<EventDraft>) => {
    setDraft((previous) => ({ ...previous, ...changes }));
  };

  const handleShowChange = (showId: string) => {
    const show = shows.find((candidate) => candidate.showId === showId);
    if (!show) {
      updateDraft({ showId: '' });
      return;
    }
    const nextShowDate = dateChosen ? undefined : getPlannedShows([show], existingEvents, new Date())[0]?.date;
    setDraft((previous) => ({
      ...previous,
      showId,
      name: previous.name.trim() ? previous.name : show.name,
      companyId: show.companyId,
      eventType: show.schedule ?? previous.eventType,
      date: nextShowDate ?? previous.date,
    }));
  };

  const showOptions = useMemo(
    () => [
      { value: '', label: t('events.create.noShow', 'No show') },
      ...shows.map((show) => ({ value: show.showId, label: show.name })),
    ],
    [shows, t],
  );
  const companyOptions = useMemo(
    () => [
      { value: '', label: t('events.create.noCompany', 'No company') },
      ...companies.map((company) => ({ value: company.companyId, label: company.name })),
    ],
    [companies, t],
  );
  const seasonOptions = useMemo(
    () => [
      { value: '', label: t('events.admin.noSeason', 'No Season') },
      ...seasons.map((season) => ({ value: season.seasonId, label: season.name })),
    ],
    [seasons, t],
  );

  const handleSubmit = async (submitEvent: FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    if (saving) return;
    const name = draft.name.trim();
    if (!name) {
      setError(t('events.create.nameRequired', 'Enter an event name.'));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) {
      setError(t('events.admin.editDate.invalid', 'Pick a valid date.'));
      return;
    }

    const input: CreateEventInput = { name, eventType: draft.eventType, date: draft.date };
    const venue = draft.venue.trim();
    const description = draft.description.trim();
    const show = shows.find((candidate) => candidate.showId === draft.showId);
    if (venue) input.venue = venue;
    if (description) input.description = description;
    if (draft.seasonId) input.seasonId = draft.seasonId;
    if (draft.companyId) input.companyIds = [draft.companyId];
    if (show) {
      input.showId = show.showId;
      if (show.imageUrl) input.imageUrl = show.imageUrl;
    }

    setSaving(true);
    setError(null);
    try {
      const created = await eventsApi.create(input);
      navigate(`/events/${created.eventId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('events.create.error', 'Failed to create event.'));
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('events.calendar.createEvent', 'Create Event')}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>{t('common.cancel', 'Cancel')}</Button>
          <Button type="submit" form="create-event-form" loading={saving}>
            {t('events.calendar.createEvent', 'Create Event')}
          </Button>
        </>
      )}
    >
      <form id="create-event-form" className="create-event" onSubmit={handleSubmit} noValidate>
        {error && <p className="create-event__error" role="alert">{error}</p>}

        <fieldset className="create-event__types">
          <legend className="create-event__label">{t('events.admin.eventType', 'Event Type')}</legend>
          <div className="create-event__type-options">
            {EVENT_TYPES.map((eventType) => (
              <label key={eventType} className="create-event__type">
                <input
                  type="radio"
                  name="create-event-type"
                  value={eventType}
                  checked={draft.eventType === eventType}
                  onChange={() => updateDraft({ eventType })}
                />
                <span>{t(`events.types.${eventType}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="create-event__field">
          <label className="create-event__label" htmlFor="create-event-name">{t('events.admin.name', 'Event Name')}</label>
          <input
            id="create-event-name"
            className="create-event__input"
            type="text"
            maxLength={120}
            value={draft.name}
            onChange={(changeEvent) => updateDraft({ name: changeEvent.target.value })}
            placeholder={t('events.admin.namePlaceholder', 'e.g., WrestleMania 41, Monday Night Raw')}
          />
        </div>

        <div className="create-event__field">
          <label className="create-event__label" htmlFor="create-event-date">{t('events.detail.date', 'Date')}</label>
          <input
            id="create-event-date"
            className="create-event__input"
            type="date"
            value={draft.date}
            onChange={(changeEvent) => {
              setDateChosen(true);
              updateDraft({ date: changeEvent.target.value });
            }}
          />
        </div>

        <div className="create-event__field">
          <label className="create-event__label" htmlFor="create-event-venue">{t('events.admin.venue', 'Venue')}</label>
          <input
            id="create-event-venue"
            className="create-event__input"
            type="text"
            maxLength={120}
            value={draft.venue}
            onChange={(changeEvent) => updateDraft({ venue: changeEvent.target.value })}
            placeholder={t('events.admin.venuePlaceholder', 'e.g., Madison Square Garden, New York, NY')}
            aria-describedby="create-event-venue-hint"
          />
          <p id="create-event-venue-hint" className="create-event__hint">
            {t('events.create.venueHint', 'Leave blank to pick a saved location at random.')}
          </p>
        </div>

        <div className="create-event__columns">
          {shows.length > 0 && (
            <div className="create-event__field">
              <span className="create-event__label">{t('events.create.show', 'Show')}</span>
              <Select label={t('events.create.show', 'Show')} value={draft.showId} onValueChange={handleShowChange} options={showOptions} />
            </div>
          )}
          {companies.length > 0 && (
            <div className="create-event__field">
              <span className="create-event__label">{t('events.create.company', 'Company')}</span>
              <Select
                label={t('events.create.company', 'Company')}
                value={draft.companyId}
                onValueChange={(companyId) => updateDraft({ companyId })}
                options={companyOptions}
              />
            </div>
          )}
          {seasons.length > 0 && (
            <div className="create-event__field">
              <span className="create-event__label">{t('events.admin.season', 'Season')}</span>
              <Select
                label={t('events.admin.season', 'Season')}
                value={draft.seasonId}
                onValueChange={(seasonId) => {
                  setSeasonChosen(true);
                  updateDraft({ seasonId });
                }}
                options={seasonOptions}
              />
            </div>
          )}
        </div>

        <div className="create-event__field">
          <label className="create-event__label" htmlFor="create-event-description">{t('events.admin.description', 'Description')}</label>
          <textarea
            id="create-event-description"
            className="create-event__input"
            rows={3}
            value={draft.description}
            onChange={(changeEvent) => updateDraft({ description: changeEvent.target.value })}
            placeholder={t('events.admin.descriptionPlaceholder', 'Enter a description for this event...')}
          />
        </div>
      </form>
    </Modal>
  );
}
