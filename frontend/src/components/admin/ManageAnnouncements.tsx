import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Megaphone, Plus, Sparkles } from 'lucide-react';
import { announcementsApi } from '../../services/api';
import type { Announcement } from '../../types';
import { sanitizeHtml } from '../../utils/sanitizeHtml';
import Badge from '../ui/Badge';
import type { BadgeTone } from '../ui/Badge';
import Button from '../ui/Button';
import DataTable from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import AdminFormModal from './AdminFormModal';
import AdminNotice from './AdminNotice';
import AnnouncementWizard from './AnnouncementWizard';
import useAdminConfirm from './useAdminConfirm';
import './adminContent.css';
import './ManageAnnouncements.css';

const PRIORITY_KEYS: Record<number, string> = { 1: 'low', 2: 'medium', 3: 'high' };

type AnnouncementStatus = 'active' | 'inactive' | 'expired';

const STATUS_TONES: Record<AnnouncementStatus, BadgeTone> = {
  active: 'win',
  inactive: 'neutral',
  expired: 'warning',
};

function getStatusLabel(announcement: Announcement): AnnouncementStatus {
  if (announcement.expiresAt && new Date(announcement.expiresAt) < new Date()) return 'expired';
  return announcement.isActive ? 'active' : 'inactive';
}

const DEFAULT_FORM = {
  title: '',
  body: '',
  priority: 1,
  expiresAt: '',
  isActive: true,
  videoUrl: '',
};

export default function ManageAnnouncements() {
  const { t } = useTranslation();
  const { confirm, confirmDialog } = useAdminConfirm();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [showWizard, setShowWizard] = useState(false);

  const loadAnnouncements = useCallback(async (signal?: AbortSignal) => {
    try {
      setAnnouncements(await announcementsApi.getAll(signal));
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadAnnouncements(controller.signal);
    return () => controller.abort();
  }, [loadAnnouncements]);

  const closeForm = () => {
    setFormData(DEFAULT_FORM);
    setShowForm(false);
    setEditing(null);
    setShowPreview(false);
    setFormError(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setFormError(null);

    if (!formData.title.trim() || !formData.body.trim()) {
      setFormError(t('announcements.fieldsRequired'));
      return;
    }

    const payload = {
      title: formData.title,
      body: formData.body,
      priority: formData.priority,
      isActive: formData.isActive,
      expiresAt: formData.expiresAt ? new Date(formData.expiresAt).toISOString() : undefined,
      videoUrl: formData.videoUrl.trim() || undefined,
    };

    setSaving(true);
    try {
      if (editing) {
        await announcementsApi.update(editing.announcementId, payload);
        setSuccess(t('announcements.updateSuccess'));
      } else {
        await announcementsApi.create(payload);
        setSuccess(t('announcements.createSuccess'));
      }
      closeForm();
      await loadAnnouncements();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('announcements.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (announcement: Announcement) => {
    setEditing(announcement);
    setFormData({
      title: announcement.title,
      body: announcement.body,
      priority: announcement.priority,
      expiresAt: announcement.expiresAt ? announcement.expiresAt.slice(0, 10) : '',
      isActive: announcement.isActive,
      videoUrl: announcement.videoUrl || '',
    });
    setShowForm(true);
    setShowPreview(false);
  };

  const handleDelete = async (announcementId: string) => {
    const confirmed = await confirm({ title: t('announcements.confirmDelete'), confirmLabel: t('common.delete') });
    if (!confirmed) return;

    setDeleting(announcementId);
    setError(null);
    setSuccess(null);
    try {
      await announcementsApi.delete(announcementId);
      setSuccess(t('announcements.deleteSuccess'));
      await loadAnnouncements();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('announcements.deleteError'));
    } finally {
      setDeleting(null);
    }
  };

  const title = t('announcements.title');

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
        actions={(
          <>
            <Button variant="secondary" icon={<Sparkles aria-hidden="true" size={18} />} onClick={() => setShowWizard(true)}>
              {t('adminContent.announcements.gmWizard', 'GM Wizard')}
            </Button>
            <Button icon={<Plus aria-hidden="true" size={18} />} onClick={() => setShowForm(true)}>
              {t('announcements.create')}
            </Button>
          </>
        )}
      />

      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      {success && <AdminNotice tone="success">{success}</AdminNotice>}

      <section className="ac-section">
        <h2 className="ac-section__title">{t('announcements.allAnnouncements')} ({announcements.length})</h2>
        <DataTable
          caption={t('announcements.allAnnouncements')}
          density="dense"
          rows={announcements}
          rowKey={(announcement) => announcement.announcementId}
          empty={<EmptyState icon={<Megaphone aria-hidden="true" size={32} />} title={t('announcements.noAnnouncements')} />}
          columns={[
            {
              key: 'title',
              header: t('announcements.fields.title'),
              render: (announcement) => <span className="ac-cell__title">{announcement.title}</span>,
              sortValue: (announcement) => announcement.title,
            },
            {
              key: 'status',
              header: t('adminContent.status', 'Status'),
              render: (announcement) => {
                const status = getStatusLabel(announcement);
                return <Badge tone={STATUS_TONES[status]}>{t(`announcements.status.${status}`)}</Badge>;
              },
            },
            {
              key: 'priority',
              header: t('announcements.fields.priority'),
              render: (announcement) => t(`announcements.priority.${PRIORITY_KEYS[announcement.priority] ?? 'low'}`),
              sortValue: (announcement) => announcement.priority,
            },
            {
              key: 'created',
              header: t('adminContent.created', 'Created'),
              render: (announcement) => new Date(announcement.createdAt).toLocaleDateString(),
              sortValue: (announcement) => announcement.createdAt,
            },
            {
              key: 'expires',
              header: t('announcements.fields.expiresAt'),
              render: (announcement) => (announcement.expiresAt ? new Date(announcement.expiresAt).toLocaleDateString() : '—'),
            },
            {
              key: 'actions',
              header: t('common.actions'),
              align: 'end',
              render: (announcement) => (
                <div className="ac-actions ac-actions--end">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(announcement)}>{t('common.edit')}</Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={deleting === announcement.announcementId}
                    onClick={() => handleDelete(announcement.announcementId)}
                  >
                    {t('common.delete')}
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
        title={editing ? t('announcements.edit') : t('announcements.create')}
        size="lg"
        submitLabel={editing ? t('announcements.edit') : t('announcements.create')}
        onSubmit={handleSubmit}
        busy={saving}
        error={formError}
        extraAction={(
          <Button variant="secondary" onClick={() => setShowPreview(!showPreview)}>
            {showPreview ? t('announcements.hidePreview') : t('announcements.showPreview')}
          </Button>
        )}
      >
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="ann-title">{t('announcements.fields.title')}</label>
          <input
            type="text"
            id="ann-title"
            value={formData.title}
            onChange={(event) => setFormData({ ...formData, title: event.target.value })}
            required
            placeholder={t('announcements.fields.titlePlaceholder')}
          />
        </div>
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="ann-body">{t('announcements.fields.body')}</label>
          <textarea
            id="ann-body"
            value={formData.body}
            onChange={(event) => setFormData({ ...formData, body: event.target.value })}
            required
            placeholder={t('announcements.fields.bodyPlaceholder')}
            rows={6}
          />
        </div>
        {showPreview && (
          <div className="ac-field">
            <span className="ac-field__label">{t('announcements.preview')}</span>
            <div className="announcement-preview" dangerouslySetInnerHTML={{ __html: sanitizeHtml(formData.body) }} />
          </div>
        )}
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="ann-video">{t('announcements.fields.videoUrl')}</label>
          <input
            type="url"
            id="ann-video"
            value={formData.videoUrl}
            onChange={(event) => setFormData({ ...formData, videoUrl: event.target.value })}
            placeholder={t('announcements.fields.videoUrlPlaceholder')}
          />
        </div>
        <div className="ac-form__row">
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="ann-priority">{t('announcements.fields.priority')}</label>
            <select
              id="ann-priority"
              value={formData.priority}
              onChange={(event) => setFormData({ ...formData, priority: Number(event.target.value) })}
            >
              <option value={1}>{t('announcements.priority.low')}</option>
              <option value={2}>{t('announcements.priority.medium')}</option>
              <option value={3}>{t('announcements.priority.high')}</option>
            </select>
          </div>
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="ann-expires">{t('announcements.fields.expiresAt')}</label>
            <input
              type="date"
              id="ann-expires"
              value={formData.expiresAt}
              onChange={(event) => setFormData({ ...formData, expiresAt: event.target.value })}
            />
          </div>
        </div>
        <label className="ac-check">
          <input
            type="checkbox"
            checked={formData.isActive}
            onChange={(event) => setFormData({ ...formData, isActive: event.target.checked })}
          />
          {t('announcements.fields.active')}
        </label>
      </AdminFormModal>

      {showWizard && (
        <AnnouncementWizard
          onClose={() => setShowWizard(false)}
          onPublished={() => {
            setShowWizard(false);
            void loadAnnouncements();
          }}
        />
      )}

      {confirmDialog}
    </div>
  );
}
