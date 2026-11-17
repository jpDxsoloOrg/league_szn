import { useState, useEffect, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { divisionsApi } from '../../services/api';
import type { Division } from '../../types';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import DataTable from '../ui/DataTable';
import type { DataTableColumn } from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import Modal from '../ui/Modal';
import PageHeader from '../ui/PageHeader';
import {
  DEFAULT_ZONE_SIZE,
  MAX_DIVISION_TIER,
  MAX_ZONE_SIZE,
  MIN_DIVISION_TIER,
  divisionTierSortValue,
  getDivisionTier,
} from '../../utils/divisionTiers';
import AdminNotice from './AdminNotice';
import ConfirmModal from './ConfirmModal';
import './adminRoster.css';

const FORM_ID = 'division-form';

const EMPTY_FORM = {
  name: '',
  description: '',
  isDevelopmental: false,
  isDefaultForNewWrestlers: false,
  /** Kept as text so the field can be empty (no tier). */
  tier: '',
  /** Kept as text; empty means the default size. */
  promotionZoneSize: '',
  relegationZoneSize: '',
};

/** Empty input means "no tier"; anything else must be a whole number in range. */
function parseTierInput(value: string): { tier: number | null; valid: boolean } {
  const trimmed = value.trim();
  if (trimmed === '') return { tier: null, valid: true };
  const tier = Number(trimmed);
  const valid = Number.isInteger(tier) && tier >= MIN_DIVISION_TIER && tier <= MAX_DIVISION_TIER;
  return { tier: valid ? tier : null, valid };
}

/** Empty input means "use the default size"; otherwise a whole number from 0 to the max. */
function parseZoneSizeInput(value: string): { size: number | null; valid: boolean } {
  const trimmed = value.trim();
  if (trimmed === '') return { size: null, valid: true };
  const size = Number(trimmed);
  const valid = Number.isInteger(size) && size >= 0 && size <= MAX_ZONE_SIZE;
  return { size: valid ? size : null, valid };
}

export default function ManageDivisions() {
  const { t } = useTranslation();
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingDivision, setEditingDivision] = useState<Division | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Division | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [formData, setFormData] = useState(EMPTY_FORM);

  useEffect(() => {
    loadDivisions();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const loadDivisions = async () => {
    try {
      setLoading(true);
      const data = await divisionsApi.getAll();
      setDivisions(data);
    } catch (_err) {
      setError(t('adminRoster.divisions.loadError', 'Failed to load divisions'));
    } finally {
      setLoading(false);
    }
  };

  const closeForm = () => {
    setFormData(EMPTY_FORM);
    setFormError(null);
    setShowForm(false);
    setEditingDivision(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setError(null);
    setSuccess(null);

    const { tier, valid: tierValid } = parseTierInput(formData.tier);
    if (!tierValid) {
      setFormError(t('adminRoster.divisions.tierInvalid', {
        defaultValue: 'Tier must be a whole number from {{min}} to {{max}}, or empty.',
        min: MIN_DIVISION_TIER,
        max: MAX_DIVISION_TIER,
      }));
      return;
    }

    const promotionZone = parseZoneSizeInput(formData.promotionZoneSize);
    const relegationZone = parseZoneSizeInput(formData.relegationZoneSize);
    if (!promotionZone.valid || !relegationZone.valid) {
      setFormError(t('adminRoster.divisions.zoneInvalid', {
        defaultValue: 'Zone sizes must be whole numbers from 0 to {{max}}.',
        max: MAX_ZONE_SIZE,
      }));
      return;
    }

    try {
      if (editingDivision) {
        await divisionsApi.update(editingDivision.divisionId, {
          name: formData.name,
          description: formData.description || undefined,
          isDevelopmental: formData.isDevelopmental,
          isDefaultForNewWrestlers: formData.isDefaultForNewWrestlers,
          tier,
          promotionZoneSize: promotionZone.size,
          relegationZoneSize: relegationZone.size,
        });
        setSuccess(t('adminRoster.divisions.updated', 'Division updated successfully!'));
      } else {
        await divisionsApi.create({
          name: formData.name,
          description: formData.description || undefined,
          isDevelopmental: formData.isDevelopmental,
          isDefaultForNewWrestlers: formData.isDefaultForNewWrestlers,
          ...(tier !== null ? { tier } : {}),
          ...(promotionZone.size !== null ? { promotionZoneSize: promotionZone.size } : {}),
          ...(relegationZone.size !== null ? { relegationZoneSize: relegationZone.size } : {}),
        });
        setSuccess(t('adminRoster.divisions.created', 'Division created successfully!'));
      }

      closeForm();
      await loadDivisions();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('adminRoster.divisions.saveError', 'Failed to save division'));
    }
  };

  const handleEdit = (division: Division) => {
    setEditingDivision(division);
    setFormData({
      name: division.name,
      description: division.description || '',
      isDevelopmental: division.isDevelopmental === true,
      isDefaultForNewWrestlers: division.isDefaultForNewWrestlers === true,
      tier: getDivisionTier(division)?.toString() ?? '',
      promotionZoneSize: division.promotionZoneSize?.toString() ?? '',
      relegationZoneSize: division.relegationZoneSize?.toString() ?? '',
    });
    setShowForm(true);
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setError(null);
    setSuccess(null);

    try {
      await divisionsApi.delete(pendingDelete.divisionId);
      setSuccess(t('adminRoster.divisions.deleted', 'Division deleted successfully!'));
      await loadDivisions();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminRoster.divisions.deleteError', 'Failed to delete division'));
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  const columns: DataTableColumn<Division>[] = [
    {
      key: 'name',
      header: t('adminRoster.divisions.nameColumn', 'Name'),
      render: (division) => (
        <div className="ar-stack">
          <span className="ar-strong">{division.name}</span>
          {(division.isDevelopmental || division.isDefaultForNewWrestlers || getDivisionTier(division) !== undefined) && (
            <div className="ar-badges">
              {!division.isDevelopmental && getDivisionTier(division) !== undefined && (
                <Badge tone="neutral">
                  {t('adminRoster.divisions.tierBadge', { defaultValue: 'Tier {{tier}}', tier: getDivisionTier(division) })}
                </Badge>
              )}
              {division.isDevelopmental && (
                <Badge tone="violet">{t('adminRoster.divisions.developmentalBadge', 'Developmental')}</Badge>
              )}
              {division.isDefaultForNewWrestlers && (
                <Badge tone="primary">{t('adminRoster.divisions.defaultBadge', 'Default')}</Badge>
              )}
            </div>
          )}
        </div>
      ),
      sortValue: (division) => division.name,
    },
    {
      key: 'tier',
      header: t('adminRoster.divisions.tierColumn', 'Tier'),
      // Developmental divisions rank below every tier; their badge already says so.
      render: (division) => (division.isDevelopmental ? '—' : getDivisionTier(division) ?? '—'),
      sortValue: (division) => divisionTierSortValue(division),
    },
    {
      key: 'description',
      header: t('adminRoster.divisions.descriptionColumn', 'Description'),
      render: (division) => division.description || '—',
    },
    {
      key: 'actions',
      header: t('common.actions', 'Actions'),
      align: 'end',
      render: (division) => (
        <div className="ar-row-actions">
          <Button variant="secondary" size="sm" onClick={() => handleEdit(division)}>{t('common.edit', 'Edit')}</Button>
          <Button variant="ghost" size="sm" onClick={() => setPendingDelete(division)}>{t('common.delete', 'Delete')}</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="ar-page manage-divisions">
      <PageHeader
        title={t('adminRoster.divisions.title', 'Manage Divisions')}
        actions={(
          <Button icon={<Plus aria-hidden="true" size={18} />} onClick={() => setShowForm(true)}>
            {t('adminRoster.divisions.create', 'Create Division')}
          </Button>
        )}
      />

      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      {success && <AdminNotice tone="success">{success}</AdminNotice>}

      <h2 className="ar-section-title">
        {t('adminRoster.divisions.all', 'All Divisions')} ({divisions.length})
      </h2>
      <DataTable
        className="ar-table"
        caption={t('adminRoster.divisions.all', 'All Divisions')}
        density="dense"
        columns={columns}
        rows={divisions}
        rowKey={(division) => division.divisionId}
        loading={loading}
        empty={(
          <EmptyState
            title={t('adminRoster.divisions.emptyTitle', 'No divisions yet')}
            description={t('adminRoster.divisions.emptyBody', 'Create your first division to group players.')}
          />
        )}
      />

      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingDivision
          ? t('adminRoster.divisions.editTitle', 'Edit Division')
          : t('adminRoster.divisions.createTitle', 'Create New Division')}
        footer={(
          <>
            <Button variant="ghost" onClick={closeForm}>{t('common.cancel', 'Cancel')}</Button>
            <Button type="submit" form={FORM_ID}>
              {editingDivision
                ? t('adminRoster.divisions.update', 'Update Division')
                : t('adminRoster.divisions.create', 'Create Division')}
            </Button>
          </>
        )}
      >
        <form id={FORM_ID} onSubmit={handleSubmit} className="ar-form">
          {formError && <AdminNotice tone="error">{formError}</AdminNotice>}
          <div className="ar-field">
            <label className="ar-field__label" htmlFor="division-name">
              {t('adminRoster.divisions.nameLabel', 'Division Name')}
            </label>
            <input
              className="ar-input"
              type="text"
              id="division-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder={t('adminRoster.divisions.namePlaceholder', 'e.g., Heavyweight, Cruiserweight, Main Event')}
            />
          </div>
          <div className="ar-field">
            <label className="ar-field__label" htmlFor="division-description">
              {t('adminRoster.divisions.descriptionLabel', 'Description (Optional)')}
            </label>
            <textarea
              className="ar-input"
              id="division-description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder={t('adminRoster.divisions.descriptionPlaceholder', 'Brief description of this division')}
              rows={3}
            />
          </div>
          <div className="ar-field">
            <label className="ar-field__label" htmlFor="division-tier">
              {t('adminRoster.divisions.tierLabel', 'Tier (Optional)')}
            </label>
            <input
              className="ar-input ar-input--tier"
              type="number"
              id="division-tier"
              inputMode="numeric"
              min={MIN_DIVISION_TIER}
              max={MAX_DIVISION_TIER}
              step={1}
              value={formData.tier}
              onChange={(e) => setFormData({ ...formData, tier: e.target.value })}
              aria-describedby="division-tier-hint"
            />
            <p className="ar-field__hint" id="division-tier-hint">
              {t(
                'adminRoster.divisions.tierHint',
                '1 is the top. Divisions on the same tier are siblings. Leave empty for no tier. Developmental divisions always rank below every tier.',
              )}
            </p>
          </div>
          <div className="ar-field-row">
            <div className="ar-field">
              <label className="ar-field__label" htmlFor="division-promotion-zone">
                {t('adminRoster.divisions.promotionZoneLabel', 'Promotion zone size')}
              </label>
              <input
                className="ar-input ar-input--tier"
                type="number"
                id="division-promotion-zone"
                inputMode="numeric"
                min={0}
                max={MAX_ZONE_SIZE}
                step={1}
                placeholder={String(DEFAULT_ZONE_SIZE)}
                value={formData.promotionZoneSize}
                onChange={(e) => setFormData({ ...formData, promotionZoneSize: e.target.value })}
                aria-describedby="division-zone-hint"
              />
            </div>
            <div className="ar-field">
              <label className="ar-field__label" htmlFor="division-relegation-zone">
                {t('adminRoster.divisions.relegationZoneLabel', 'Relegation zone size')}
              </label>
              <input
                className="ar-input ar-input--tier"
                type="number"
                id="division-relegation-zone"
                inputMode="numeric"
                min={0}
                max={MAX_ZONE_SIZE}
                step={1}
                placeholder={String(DEFAULT_ZONE_SIZE)}
                value={formData.relegationZoneSize}
                onChange={(e) => setFormData({ ...formData, relegationZoneSize: e.target.value })}
                aria-describedby="division-zone-hint"
              />
            </div>
          </div>
          <p className="ar-field__hint" id="division-zone-hint">
            {t(
              'adminRoster.divisions.zoneHint',
              'Places shown as the promotion (top) and relegation (bottom) zones when standings are filtered to this division. 0 turns a zone off. The top tier never shows a promotion zone, and the lowest division never shows a relegation zone.',
            )}
          </p>
          <div className="ar-field">
            <label className="ar-check" htmlFor="division-developmental">
              <input
                type="checkbox"
                id="division-developmental"
                checked={formData.isDevelopmental}
                onChange={(e) => setFormData({ ...formData, isDevelopmental: e.target.checked })}
                aria-describedby="division-developmental-hint"
              />
              {t('adminRoster.divisions.developmentalLabel', 'Developmental division')}
            </label>
            <p className="ar-field__hint" id="division-developmental-hint">
              {t('adminRoster.divisions.developmentalHint', 'A feeder division, like Young Boys. Call-ups move wrestlers out of it.')}
            </p>
          </div>
          <div className="ar-field">
            <label className="ar-check" htmlFor="division-default">
              <input
                type="checkbox"
                id="division-default"
                checked={formData.isDefaultForNewWrestlers}
                onChange={(e) => setFormData({ ...formData, isDefaultForNewWrestlers: e.target.checked })}
                aria-describedby="division-default-hint"
              />
              {t('adminRoster.divisions.defaultLabel', 'Default for new wrestlers')}
            </label>
            <p className="ar-field__hint" id="division-default-hint">
              {t(
                'adminRoster.divisions.defaultHint',
                'New sign-ups land here. Only one division can be the default; turning this on removes it from the current default.',
              )}
            </p>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={pendingDelete !== null}
        title={t('adminRoster.divisions.deleteTitle', 'Delete division')}
        message={t('adminRoster.divisions.deleteConfirm', 'Are you sure you want to delete this division?')}
        confirmLabel={t('common.delete', 'Delete')}
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
