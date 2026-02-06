import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EventType } from '../../types/event';
import { mockEventSeasons } from '../../mocks/eventMockData';
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

export default function CreateEvent() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [eventType, setEventType] = useState<EventType>('weekly');
  const [date, setDate] = useState('');
  const [venue, setVenue] = useState('');
  const [description, setDescription] = useState('');
  const [themeColor, setThemeColor] = useState('#d4af37');
  const [seasonId, setSeasonId] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (!name || !date) return;
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="create-event">
      <h3 className="create-event-title">{t('events.admin.createEvent')}</h3>

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
            {mockEventSeasons.map((s) => (
              <option key={s.seasonId} value={s.seasonId}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Save Button */}
        <button
          className="save-event-btn"
          onClick={handleSave}
          disabled={!name || !date}
        >
          {t('events.admin.saveEvent')}
        </button>

        {saved && (
          <div className="save-success-msg">
            {t('events.admin.saveSuccess')}
          </div>
        )}
      </div>
    </div>
  );
}
