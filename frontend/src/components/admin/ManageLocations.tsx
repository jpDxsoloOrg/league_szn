import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { locationsApi } from '../../services/api';
import type {
  Location,
  CreateLocationInput,
  BulkImportResult,
} from '../../types/location';
import Skeleton from '../ui/Skeleton';
import './ManageLocations.css';

type FormState = {
  name: string;
  city: string;
  state: string;
  country: string;
  capacity: string;
  latitude: string;
  longitude: string;
  imageUrl: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  city: '',
  state: '',
  country: '',
  capacity: '',
  latitude: '',
  longitude: '',
  imageUrl: '',
  notes: '',
};

function parseOptionalNumber(raw: string): number | undefined | 'invalid' {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  if (Number.isNaN(n)) return 'invalid';
  return n;
}

function buildInputFromForm(form: FormState): CreateLocationInput | string {
  const name = form.name.trim();
  if (!name) return 'name is required';

  const capacity = parseOptionalNumber(form.capacity);
  if (capacity === 'invalid') return 'capacity must be a number';
  if (typeof capacity === 'number' && capacity < 0) return 'capacity must be ≥ 0';

  const latitude = parseOptionalNumber(form.latitude);
  if (latitude === 'invalid') return 'latitude must be a number';
  const longitude = parseOptionalNumber(form.longitude);
  if (longitude === 'invalid') return 'longitude must be a number';

  const input: CreateLocationInput = { name };
  if (form.city.trim()) input.city = form.city.trim();
  if (form.state.trim()) input.state = form.state.trim();
  if (form.country.trim()) input.country = form.country.trim();
  if (typeof capacity === 'number') input.capacity = capacity;
  if (typeof latitude === 'number') input.latitude = latitude;
  if (typeof longitude === 'number') input.longitude = longitude;
  if (form.imageUrl.trim()) input.imageUrl = form.imageUrl.trim();
  if (form.notes.trim()) input.notes = form.notes.trim();
  return input;
}

function formFromLocation(loc: Location): FormState {
  return {
    name: loc.name,
    city: loc.city ?? '',
    state: loc.state ?? '',
    country: loc.country ?? '',
    capacity: loc.capacity !== undefined ? String(loc.capacity) : '',
    latitude: loc.latitude !== undefined ? String(loc.latitude) : '',
    longitude: loc.longitude !== undefined ? String(loc.longitude) : '',
    imageUrl: loc.imageUrl ?? '',
    notes: loc.notes ?? '',
  };
}

/**
 * CSV parser with no quoted-comma support — matches the helper text shown to admins.
 * First non-empty line is the header. Unknown columns are ignored. Empty cells become undefined.
 */
function parseCsv(raw: string): { rows: CreateLocationInput[]; error?: string } {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const headerLine = lines[0];
  if (!headerLine) return { rows: [], error: 'CSV is empty' };

  const header = headerLine.split(',').map((h) => h.trim().toLowerCase());
  const nameIdx = header.indexOf('name');
  if (nameIdx === -1) return { rows: [], error: 'CSV header must include a "name" column' };

  const rows: CreateLocationInput[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cells = line.split(',').map((c) => c.trim());
    const name = cells[nameIdx] ?? '';
    if (!name) return { rows: [], error: `row ${i + 1}: name is required` };
    const row: CreateLocationInput = { name };
    header.forEach((col, idx) => {
      const value = cells[idx];
      if (value === undefined || value === '') return;
      if (col === 'city') row.city = value;
      else if (col === 'state') row.state = value;
      else if (col === 'country') row.country = value;
      else if (col === 'capacity') {
        const n = Number(value);
        if (Number.isNaN(n)) {
          rows.push({ name: '__INVALID__' });
          return;
        }
        row.capacity = n;
      } else if (col === 'latitude') {
        const n = Number(value);
        if (!Number.isNaN(n)) row.latitude = n;
      } else if (col === 'longitude') {
        const n = Number(value);
        if (!Number.isNaN(n)) row.longitude = n;
      } else if (col === 'imageurl') {
        row.imageUrl = value;
      } else if (col === 'notes') {
        row.notes = value;
      }
    });
    rows.push(row);
  }

  const invalid = rows.find((r) => r.name === '__INVALID__');
  if (invalid) return { rows: [], error: 'CSV contains a non-numeric capacity value' };
  return { rows };
}

function parseBulkInput(raw: string): { rows: CreateLocationInput[]; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { rows: [], error: 'Input is empty' };

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!Array.isArray(parsed)) return { rows: [], error: 'JSON must be an array' };
      const rows: CreateLocationInput[] = [];
      for (let i = 0; i < parsed.length; i++) {
        const entry = parsed[i];
        if (entry === null || typeof entry !== 'object') {
          return { rows: [], error: `row ${i + 1}: must be an object` };
        }
        const obj = entry as Record<string, unknown>;
        const objName = obj['name'];
        if (typeof objName !== 'string' || objName.trim() === '') {
          return { rows: [], error: `row ${i + 1}: name is required` };
        }
        rows.push(obj as unknown as CreateLocationInput);
      }
      return { rows };
    } catch (err) {
      return {
        rows: [],
        error: err instanceof Error ? `Invalid JSON: ${err.message}` : 'Invalid JSON',
      };
    }
  }

  return parseCsv(trimmed);
}

export default function ManageLocations() {
  const { t } = useTranslation();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);

  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkParseError, setBulkParseError] = useState<string | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkImportResult | null>(null);
  const [showSkippedNames, setShowSkippedNames] = useState(false);

  const loadLocations = async () => {
    try {
      setLoading(true);
      const data = await locationsApi.list();
      setLocations(data);
    } catch (_err) {
      setError(t('admin.locations.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFieldChange = (field: keyof FormState) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setShowAddForm(false);
    setEditingLocation(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const built = buildInputFromForm(formData);
    if (typeof built === 'string') {
      setError(built);
      return;
    }

    setSubmitting(true);
    try {
      if (editingLocation) {
        await locationsApi.update(editingLocation.locationId, built);
        setSuccess(t('admin.locations.updated'));
      } else {
        await locationsApi.create(built);
        setSuccess(t('admin.locations.created'));
      }
      resetForm();
      await loadLocations();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.locations.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (location: Location) => {
    setEditingLocation(location);
    setFormData(formFromLocation(location));
    setShowAddForm(true);
  };

  const handleDelete = async (location: Location) => {
    if (!confirm(t('admin.locations.confirmDelete', { name: location.name }))) {
      return;
    }
    setDeleting(location.locationId);
    setError(null);
    setSuccess(null);
    try {
      await locationsApi.delete(location.locationId);
      setSuccess(t('admin.locations.deleted'));
      await loadLocations();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.locations.deleteFailed'));
    } finally {
      setDeleting(null);
    }
  };

  const handleBulkImport = async () => {
    setBulkParseError(null);
    setBulkResult(null);
    const { rows, error: parseError } = parseBulkInput(bulkText);
    if (parseError) {
      setBulkParseError(parseError);
      return;
    }
    if (rows.length === 0) {
      setBulkParseError(t('admin.locations.bulk.noRows'));
      return;
    }

    setBulkSubmitting(true);
    try {
      const result = await locationsApi.bulkImport({ locations: rows });
      setBulkResult(result);
      setShowSkippedNames(false);
      setSuccess(
        t('admin.locations.bulk.summary', {
          created: result.created,
          skipped: result.skipped,
        }),
      );
      await loadLocations();
    } catch (err) {
      setBulkParseError(
        err instanceof Error ? err.message : t('admin.locations.bulk.importFailed'),
      );
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleBulkClose = () => {
    setShowBulkImport(false);
    setBulkText('');
    setBulkParseError(null);
    setBulkResult(null);
    setShowSkippedNames(false);
  };

  if (loading) {
    return <Skeleton variant="block" count={4} />;
  }

  return (
    <div className="manage-locations">
      <div className="locations-header">
        <div>
          <h2>{t('admin.locations.title')}</h2>
          <p className="locations-subtitle">{t('admin.locations.subtitle')}</p>
        </div>
        <div className="locations-header-actions">
          {!showAddForm && (
            <button onClick={() => setShowAddForm(true)} className="am-fab">
              {t('admin.locations.add')}
            </button>
          )}
          <button
            className="locations-bulk-btn"
            onClick={() => setShowBulkImport(true)}
          >
            {t('admin.locations.bulkImport')}
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {showAddForm && (
        <div className="location-form-container">
          <h3>
            {editingLocation
              ? t('admin.locations.edit')
              : t('admin.locations.add')}
          </h3>
          <form onSubmit={handleSubmit} className="location-form">
            <div className="location-form-grid">
              <div className="form-group">
                <label htmlFor="loc-name">
                  {t('admin.locations.fields.name')} *
                </label>
                <input
                  type="text"
                  id="loc-name"
                  value={formData.name}
                  onChange={handleFieldChange('name')}
                  required
                  placeholder="Madison Square Garden"
                />
              </div>
              <div className="form-group">
                <label htmlFor="loc-city">
                  {t('admin.locations.fields.city')}
                </label>
                <input
                  type="text"
                  id="loc-city"
                  value={formData.city}
                  onChange={handleFieldChange('city')}
                  placeholder="New York"
                />
              </div>
              <div className="form-group">
                <label htmlFor="loc-state">
                  {t('admin.locations.fields.state')}
                </label>
                <input
                  type="text"
                  id="loc-state"
                  value={formData.state}
                  onChange={handleFieldChange('state')}
                  placeholder="NY"
                />
              </div>
              <div className="form-group">
                <label htmlFor="loc-country">
                  {t('admin.locations.fields.country')}
                </label>
                <input
                  type="text"
                  id="loc-country"
                  value={formData.country}
                  onChange={handleFieldChange('country')}
                  placeholder="USA"
                />
              </div>
              <div className="form-group">
                <label htmlFor="loc-capacity">
                  {t('admin.locations.fields.capacity')}
                </label>
                <input
                  type="number"
                  id="loc-capacity"
                  value={formData.capacity}
                  onChange={handleFieldChange('capacity')}
                  min={0}
                  placeholder="20789"
                />
              </div>
              <div className="form-group">
                <label htmlFor="loc-lat">
                  {t('admin.locations.fields.latitude')}
                </label>
                <input
                  type="number"
                  id="loc-lat"
                  value={formData.latitude}
                  onChange={handleFieldChange('latitude')}
                  step="any"
                  placeholder="40.7505"
                />
              </div>
              <div className="form-group">
                <label htmlFor="loc-lng">
                  {t('admin.locations.fields.longitude')}
                </label>
                <input
                  type="number"
                  id="loc-lng"
                  value={formData.longitude}
                  onChange={handleFieldChange('longitude')}
                  step="any"
                  placeholder="-73.9934"
                />
              </div>
              <div className="form-group form-group-full">
                <label htmlFor="loc-imageUrl">
                  {t('admin.locations.fields.imageUrl')}
                </label>
                <input
                  type="url"
                  id="loc-imageUrl"
                  value={formData.imageUrl}
                  onChange={handleFieldChange('imageUrl')}
                  placeholder="https://example.com/venue.jpg"
                />
              </div>
              <div className="form-group form-group-full">
                <label htmlFor="loc-notes">
                  {t('admin.locations.fields.notes')}
                </label>
                <textarea
                  id="loc-notes"
                  value={formData.notes}
                  onChange={handleFieldChange('notes')}
                  rows={3}
                />
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" disabled={submitting}>
                {submitting
                  ? t('common.saving')
                  : editingLocation
                  ? t('admin.locations.edit')
                  : t('admin.locations.add')}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="cancel-btn"
                disabled={submitting}
              >
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="locations-list">
        <h3>
          {t('admin.locations.title')} ({locations.length})
        </h3>
        {locations.length === 0 ? (
          <div className="empty-state">
            <p>{t('admin.locations.emptyTitle')}</p>
            <p>{t('admin.locations.emptyHelp')}</p>
          </div>
        ) : (
          <div className="locations-table-wrap">
            <table className="locations-table">
              <thead>
                <tr>
                  <th>{t('admin.locations.fields.name')}</th>
                  <th>{t('admin.locations.fields.city')}</th>
                  <th>{t('admin.locations.fields.state')}</th>
                  <th>{t('admin.locations.fields.country')}</th>
                  <th className="locations-col-num">
                    {t('admin.locations.fields.capacity')}
                  </th>
                  <th className="locations-col-actions">
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {locations.map((loc) => (
                  <tr key={loc.locationId}>
                    <td className="locations-col-name">{loc.name}</td>
                    <td>{loc.city ?? '—'}</td>
                    <td>{loc.state ?? '—'}</td>
                    <td>{loc.country ?? '—'}</td>
                    <td className="locations-col-num">
                      {loc.capacity !== undefined
                        ? loc.capacity.toLocaleString()
                        : '—'}
                    </td>
                    <td className="locations-col-actions">
                      <button
                        onClick={() => handleEdit(loc)}
                        className="locations-edit-btn"
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        onClick={() => handleDelete(loc)}
                        className="locations-delete-btn"
                        disabled={deleting === loc.locationId}
                      >
                        {deleting === loc.locationId
                          ? t('common.saving')
                          : t('common.delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showBulkImport && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleBulkClose();
          }}
        >
          <div className="modal-content">
            <h3>{t('admin.locations.bulk.title')}</h3>
            <p className="import-help">{t('admin.locations.bulk.helper')}</p>

            <div className="form-group">
              <label htmlFor="bulk-text">
                {t('admin.locations.bulk.inputLabel')}
              </label>
              <textarea
                id="bulk-text"
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={8}
                placeholder={'[\n  { "name": "Madison Square Garden", "city": "New York" }\n]'}
              />
            </div>

            {bulkParseError && (
              <div className="error-message">{bulkParseError}</div>
            )}

            {bulkResult && (
              <div className="import-result">
                <h4>{t('admin.locations.bulk.resultTitle')}</h4>
                <p>
                  {t('admin.locations.bulk.summary', {
                    created: bulkResult.created,
                    skipped: bulkResult.skipped,
                  })}
                </p>
                {bulkResult.skippedNames.length > 0 && (
                  <div>
                    <button
                      type="button"
                      className="bulk-toggle-btn"
                      onClick={() => setShowSkippedNames((v) => !v)}
                    >
                      {showSkippedNames
                        ? t('admin.locations.bulk.hideSkipped')
                        : t('admin.locations.bulk.showSkipped', {
                            count: bulkResult.skippedNames.length,
                          })}
                    </button>
                    {showSkippedNames && (
                      <ul className="import-error-list">
                        {bulkResult.skippedNames.map((name, idx) => (
                          <li key={idx}>{name}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="form-actions">
              <button
                type="button"
                onClick={handleBulkImport}
                disabled={bulkSubmitting || bulkText.trim().length === 0}
              >
                {bulkSubmitting
                  ? t('common.saving')
                  : t('admin.locations.bulk.import')}
              </button>
              <button
                type="button"
                onClick={handleBulkClose}
                className="cancel-btn"
                disabled={bulkSubmitting}
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
