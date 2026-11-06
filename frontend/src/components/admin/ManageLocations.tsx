import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Plus, Upload } from 'lucide-react';
import { locationsApi } from '../../services/api';
import type {
  Location,
  CreateLocationInput,
  BulkImportResult,
} from '../../types/location';
import Button from '../ui/Button';
import DataTable from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import Modal from '../ui/Modal';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import AdminFormModal from './AdminFormModal';
import AdminNotice from './AdminNotice';
import useAdminConfirm from './useAdminConfirm';
import './adminContent.css';

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
  const { confirm, confirmDialog } = useAdminConfirm();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
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

  const loadLocations = useCallback(async () => {
    try {
      setLocations(await locationsApi.list());
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  const handleFieldChange = (field: keyof FormState) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setShowAddForm(false);
    setEditingLocation(null);
    setFormError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setFormError(null);

    const built = buildInputFromForm(formData);
    if (typeof built === 'string') {
      setFormError(built);
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
      setFormError(err instanceof Error ? err.message : t('admin.locations.saveFailed'));
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
    const confirmed = await confirm({
      title: t('admin.locations.confirmDelete', { name: location.name }),
      confirmLabel: t('common.delete'),
    });
    if (!confirmed) return;

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

  const title = t('admin.locations.title');

  if (loading) {
    return (
      <div className="ac-page">
        <PageHeader title={title} />
        <Skeleton variant="table" />
      </div>
    );
  }

  return (
    <div className="ac-page">
      <PageHeader
        title={title}
        subtitle={t('admin.locations.subtitle')}
        actions={(
          <>
            <Button variant="secondary" icon={<Upload aria-hidden="true" size={18} />} onClick={() => setShowBulkImport(true)}>
              {t('admin.locations.bulkImport')}
            </Button>
            <Button icon={<Plus aria-hidden="true" size={18} />} onClick={() => setShowAddForm(true)}>
              {t('admin.locations.add')}
            </Button>
          </>
        )}
      />

      {loadFailed && <AdminNotice tone="error">{t('admin.locations.loadFailed')}</AdminNotice>}
      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      {success && <AdminNotice tone="success">{success}</AdminNotice>}

      <DataTable
        caption={title}
        density="dense"
        rows={locations}
        rowKey={(location) => location.locationId}
        empty={(
          <EmptyState
            icon={<MapPin aria-hidden="true" size={32} />}
            title={t('admin.locations.emptyTitle')}
            description={t('admin.locations.emptyHelp')}
          />
        )}
        columns={[
          {
            key: 'name',
            header: t('admin.locations.fields.name'),
            render: (location) => <span className="ac-cell__title">{location.name}</span>,
            sortValue: (location) => location.name,
          },
          { key: 'city', header: t('admin.locations.fields.city'), render: (location) => location.city ?? '—', sortValue: (location) => location.city ?? '' },
          { key: 'state', header: t('admin.locations.fields.state'), render: (location) => location.state ?? '—' },
          { key: 'country', header: t('admin.locations.fields.country'), render: (location) => location.country ?? '—', sortValue: (location) => location.country ?? '' },
          {
            key: 'capacity',
            header: t('admin.locations.fields.capacity'),
            align: 'end',
            render: (location) => (location.capacity !== undefined ? location.capacity.toLocaleString() : '—'),
            sortValue: (location) => location.capacity ?? 0,
          },
          {
            key: 'actions',
            header: t('common.actions'),
            align: 'end',
            render: (location) => (
              <div className="ac-actions ac-actions--end">
                <Button variant="ghost" size="sm" onClick={() => handleEdit(location)}>{t('common.edit')}</Button>
                <Button variant="ghost" size="sm" loading={deleting === location.locationId} onClick={() => handleDelete(location)}>
                  {t('common.delete')}
                </Button>
              </div>
            ),
          },
        ]}
      />

      <AdminFormModal
        open={showAddForm}
        onClose={resetForm}
        title={editingLocation ? t('admin.locations.edit') : t('admin.locations.add')}
        size="lg"
        submitLabel={editingLocation ? t('admin.locations.edit') : t('admin.locations.add')}
        onSubmit={handleSubmit}
        busy={submitting}
        error={formError}
      >
        <div className="ac-form__row">
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="loc-name">{t('admin.locations.fields.name')} *</label>
            <input type="text" id="loc-name" value={formData.name} onChange={handleFieldChange('name')} required placeholder="Madison Square Garden" />
          </div>
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="loc-city">{t('admin.locations.fields.city')}</label>
            <input type="text" id="loc-city" value={formData.city} onChange={handleFieldChange('city')} placeholder="New York" />
          </div>
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="loc-state">{t('admin.locations.fields.state')}</label>
            <input type="text" id="loc-state" value={formData.state} onChange={handleFieldChange('state')} placeholder="NY" />
          </div>
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="loc-country">{t('admin.locations.fields.country')}</label>
            <input type="text" id="loc-country" value={formData.country} onChange={handleFieldChange('country')} placeholder="USA" />
          </div>
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="loc-capacity">{t('admin.locations.fields.capacity')}</label>
            <input type="number" id="loc-capacity" value={formData.capacity} onChange={handleFieldChange('capacity')} min={0} placeholder="20789" />
          </div>
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="loc-lat">{t('admin.locations.fields.latitude')}</label>
            <input type="number" id="loc-lat" value={formData.latitude} onChange={handleFieldChange('latitude')} step="any" placeholder="40.7505" />
          </div>
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="loc-lng">{t('admin.locations.fields.longitude')}</label>
            <input type="number" id="loc-lng" value={formData.longitude} onChange={handleFieldChange('longitude')} step="any" placeholder="-73.9934" />
          </div>
        </div>
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="loc-imageUrl">{t('admin.locations.fields.imageUrl')}</label>
          <input type="url" id="loc-imageUrl" value={formData.imageUrl} onChange={handleFieldChange('imageUrl')} placeholder="https://example.com/venue.jpg" />
        </div>
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="loc-notes">{t('admin.locations.fields.notes')}</label>
          <textarea id="loc-notes" value={formData.notes} onChange={handleFieldChange('notes')} rows={3} />
        </div>
      </AdminFormModal>

      <Modal
        open={showBulkImport}
        onClose={() => {
          if (!bulkSubmitting) handleBulkClose();
        }}
        title={t('admin.locations.bulk.title')}
        size="lg"
        footer={(
          <>
            <Button variant="ghost" onClick={handleBulkClose} disabled={bulkSubmitting}>{t('common.close')}</Button>
            <Button onClick={handleBulkImport} loading={bulkSubmitting} disabled={bulkText.trim().length === 0}>
              {t('admin.locations.bulk.import')}
            </Button>
          </>
        )}
      >
        <div className="ac-form">
          <p className="ac-section__text">{t('admin.locations.bulk.helper')}</p>
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="bulk-text">{t('admin.locations.bulk.inputLabel')}</label>
            <textarea
              id="bulk-text"
              value={bulkText}
              onChange={(event) => setBulkText(event.target.value)}
              rows={8}
              placeholder={'[\n  { "name": "Madison Square Garden", "city": "New York" }\n]'}
            />
          </div>

          {bulkParseError && <AdminNotice tone="error">{bulkParseError}</AdminNotice>}

          {bulkResult && (
            <div className="ac-section">
              <h3 className="ac-section__title">{t('admin.locations.bulk.resultTitle')}</h3>
              <p className="ac-section__text">
                {t('admin.locations.bulk.summary', { created: bulkResult.created, skipped: bulkResult.skipped })}
              </p>
              {bulkResult.skippedNames.length > 0 && (
                <div className="ac-actions">
                  <Button variant="ghost" size="sm" onClick={() => setShowSkippedNames((shown) => !shown)}>
                    {showSkippedNames
                      ? t('admin.locations.bulk.hideSkipped')
                      : t('admin.locations.bulk.showSkipped', { count: bulkResult.skippedNames.length })}
                  </Button>
                </div>
              )}
              {showSkippedNames && (
                <ul className="ac-section__text">
                  {bulkResult.skippedNames.map((name, index) => (
                    <li key={index}>{name}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </Modal>

      {confirmDialog}
    </div>
  );
}
