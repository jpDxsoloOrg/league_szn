import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarRange, Plus } from 'lucide-react';
import { seasonsApi } from '../../services/api';
import type { Season } from '../../types';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import DataTable from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import AdminFormModal from './AdminFormModal';
import AdminNotice from './AdminNotice';
import useAdminConfirm from './useAdminConfirm';
import './adminContent.css';
import './ManageSeasons.css';

const EMPTY_FORM = { name: '', startDate: '', endDate: '' };

function formatDate(value?: string): string {
  return value ? new Date(value).toLocaleDateString() : '—';
}

export default function ManageSeasons() {
  const { t } = useTranslation();
  const { confirm, confirmDialog } = useAdminConfirm();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const loadSeasons = useCallback(async () => {
    try {
      setSeasons(await seasonsApi.getAll());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSeasons();
  }, [loadSeasons]);

  const closeForm = () => {
    setShowForm(false);
    setFormData(EMPTY_FORM);
    setFormError(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setFormError(null);

    if (!formData.name || !formData.startDate) {
      setFormError(t('adminContent.seasons.required', 'Season name and start date are required'));
      return;
    }

    setSaving(true);
    try {
      await seasonsApi.create({
        name: formData.name,
        startDate: new Date(formData.startDate).toISOString(),
        endDate: formData.endDate ? new Date(formData.endDate).toISOString() : undefined,
      });
      setSuccess(t('adminContent.seasons.created', 'Season created successfully!'));
      closeForm();
      await loadSeasons();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('adminContent.seasons.createFailed', 'Failed to create season'));
    } finally {
      setSaving(false);
    }
  };

  const handleEndSeason = async (season: Season) => {
    const confirmed = await confirm({
      title: t('adminContent.seasons.endTitle', 'End {{name}}?', { name: season.name }),
      description: t('adminContent.seasons.endText', 'This marks the season as completed.'),
      confirmLabel: t('adminContent.seasons.end', 'End Season'),
    });
    if (!confirmed) return;

    setError(null);
    setSuccess(null);
    try {
      await seasonsApi.update(season.seasonId, { status: 'completed' });
      setSuccess(t('adminContent.seasons.ended', 'Season ended successfully!'));
      await loadSeasons();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminContent.seasons.endFailed', 'Failed to end season'));
    }
  };

  const handleDelete = async (season: Season) => {
    const confirmed = await confirm({
      title: t('adminContent.seasons.deleteTitle', 'Delete {{name}}?', { name: season.name }),
      description: t('adminContent.seasons.deleteText', 'This also deletes all standings for this season. This cannot be undone.'),
      confirmLabel: t('common.delete', 'Delete'),
    });
    if (!confirmed) return;

    setDeleting(season.seasonId);
    setError(null);
    setSuccess(null);
    try {
      await seasonsApi.delete(season.seasonId);
      setSuccess(t('adminContent.seasons.deleted', 'Season deleted successfully!'));
      await loadSeasons();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminContent.seasons.deleteFailed', 'Failed to delete season'));
    } finally {
      setDeleting(null);
    }
  };

  const activeSeason = seasons.find((season) => season.status === 'active');
  const title = t('adminContent.seasons.title', 'Manage Seasons');

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
        actions={!activeSeason && (
          <Button icon={<Plus aria-hidden="true" size={18} />} onClick={() => setShowForm(true)}>
            {t('adminContent.seasons.createNew', 'Create New Season')}
          </Button>
        )}
      />

      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      {success && <AdminNotice tone="success">{success}</AdminNotice>}

      {activeSeason && (
        <Card variant="raised" className="seasons-active">
          <div className="seasons-active__text">
            <Badge tone="live">{t('adminContent.seasons.activeSeason', 'Active Season')}</Badge>
            <h2 className="seasons-active__name">{activeSeason.name}</h2>
            <p className="ac-section__text">
              {t('adminContent.seasons.started', 'Started {{date}}', { date: formatDate(activeSeason.startDate) })}
            </p>
          </div>
          <Button variant="danger" onClick={() => handleEndSeason(activeSeason)}>
            {t('adminContent.seasons.end', 'End Season')}
          </Button>
        </Card>
      )}

      <section className="ac-section">
        <h2 className="ac-section__title">{t('adminContent.seasons.all', 'All Seasons')}</h2>
        <DataTable
          caption={t('adminContent.seasons.all', 'All Seasons')}
          density="dense"
          rows={seasons}
          rowKey={(season) => season.seasonId}
          empty={(
            <EmptyState
              icon={<CalendarRange aria-hidden="true" size={32} />}
              title={t('adminContent.seasons.emptyTitle', 'No seasons yet')}
              description={t('adminContent.seasons.emptyText', 'Create a season to start tracking season standings.')}
            />
          )}
          columns={[
            {
              key: 'name',
              header: t('adminContent.seasons.name', 'Season Name'),
              render: (season) => <span className="ac-cell__title">{season.name}</span>,
              sortValue: (season) => season.name,
            },
            {
              key: 'status',
              header: t('adminContent.status', 'Status'),
              render: (season) => (
                <Badge tone={season.status === 'active' ? 'win' : 'neutral'}>
                  {season.status === 'active' ? t('common.active', 'Active') : t('common.completed', 'Completed')}
                </Badge>
              ),
            },
            {
              key: 'start',
              header: t('adminContent.seasons.startDate', 'Start Date'),
              render: (season) => formatDate(season.startDate),
              sortValue: (season) => season.startDate,
            },
            {
              key: 'end',
              header: t('adminContent.seasons.endDate', 'End Date'),
              render: (season) => formatDate(season.endDate),
            },
            {
              key: 'actions',
              header: t('common.actions', 'Actions'),
              align: 'end',
              render: (season) => (
                <div className="ac-actions ac-actions--end">
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={deleting === season.seasonId}
                    onClick={() => handleDelete(season)}
                  >
                    {t('common.delete', 'Delete')}
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </section>

      <AdminFormModal
        open={showForm}
        onClose={closeForm}
        title={t('adminContent.seasons.createNew', 'Create New Season')}
        submitLabel={t('adminContent.seasons.create', 'Create Season')}
        onSubmit={handleSubmit}
        busy={saving}
        error={formError}
      >
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="season-name">{t('adminContent.seasons.name', 'Season Name')}</label>
          <input
            type="text"
            id="season-name"
            value={formData.name}
            onChange={(event) => setFormData({ ...formData, name: event.target.value })}
            placeholder={t('adminContent.seasons.namePlaceholder', 'e.g., Season 1, Spring 2024')}
            required
          />
        </div>
        <div className="ac-form__row">
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="season-start">{t('adminContent.seasons.startDate', 'Start Date')}</label>
            <input
              type="date"
              id="season-start"
              value={formData.startDate}
              onChange={(event) => setFormData({ ...formData, startDate: event.target.value })}
              required
            />
          </div>
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="season-end">{t('adminContent.seasons.endDateOptional', 'End Date (Optional)')}</label>
            <input
              type="date"
              id="season-end"
              value={formData.endDate}
              onChange={(event) => setFormData({ ...formData, endDate: event.target.value })}
            />
          </div>
        </div>
      </AdminFormModal>

      {confirmDialog}
    </div>
  );
}
