import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { announcementsApi } from '../../services/api';
import type { Announcement } from '../../types';
import Skeleton from '../ui/Skeleton';
import './ManageAnnouncements.css';

const PRIORITY_LABELS: Record<number, string> = { 1: 'Low', 2: 'Medium', 3: 'High' };

function getStatusLabel(a: Announcement): 'active' | 'inactive' | 'expired' {
  if (a.expiresAt && new Date(a.expiresAt) < new Date()) return 'expired';
  return a.isActive ? 'active' : 'inactive';
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
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [formData, setFormData] = useState(DEFAULT_FORM);

  const loadAnnouncements = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      const data = await announcementsApi.getAll(signal);
      setAnnouncements(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : t('announcements.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    loadAnnouncements(controller.signal);
    return () => controller.abort();
  }, [loadAnnouncements]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!formData.title.trim() || !formData.body.trim()) {
      setError(t('announcements.fieldsRequired'));
      return;
    }

    try {
      const payload = {
        title: formData.title,
        body: formData.body,
        priority: formData.priority,
        isActive: formData.isActive,
        expiresAt: formData.expiresAt ? new Date(formData.expiresAt).toISOString() : undefined,
        videoUrl: formData.videoUrl.trim() || undefined,
      };

      if (editing) {
        await announcementsApi.update(editing.announcementId, payload);
        setSuccess(t('announcements.updateSuccess'));
      } else {
        await announcementsApi.create(payload);
        setSuccess(t('announcements.createSuccess'));
      }

      setFormData(DEFAULT_FORM);
      setShowForm(false);
      setEditing(null);
      setShowPreview(false);
      await loadAnnouncements();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('announcements.saveError'));
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

  const handleDelete = async (id: string) => {
    if (!confirm(t('announcements.confirmDelete'))) return;

    setDeleting(id);
    setError(null);
    setSuccess(null);

    try {
      await announcementsApi.delete(id);
      setSuccess(t('announcements.deleteSuccess'));
      await loadAnnouncements();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('announcements.deleteError'));
    } finally {
      setDeleting(null);
    }
  };

  const handleCancel = () => {
    setFormData(DEFAULT_FORM);
    setShowForm(false);
    setEditing(null);
    setShowPreview(false);
  };

  if (loading) {
    return <Skeleton variant="block" count={4} />;
  }

  return (
    <div className="manage-announcements">
      <div className="announcements-header">
        <h2>{t('announcements.title')}</h2>
        {!showForm && (
          <button onClick={() => setShowForm(true)}>
            {t('announcements.create')}
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {showForm && (
        <div className="announcement-form-container">
          <h3>{editing ? t('announcements.edit') : t('announcements.create')}</h3>
          <form onSubmit={handleSubmit} className="announcement-form">
            <div className="form-group">
              <label htmlFor="ann-title">{t('announcements.fields.title')}</label>
              <input
                type="text"
                id="ann-title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                placeholder={t('announcements.fields.titlePlaceholder')}
              />
            </div>

            <div className="form-group">
              <label htmlFor="ann-body">{t('announcements.fields.body')}</label>
              <textarea
                id="ann-body"
                value={formData.body}
                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                required
                placeholder={t('announcements.fields.bodyPlaceholder')}
                rows={6}
              />
            </div>

            <div className="form-group">
              <label htmlFor="ann-video">{t('announcements.fields.videoUrl')}</label>
              <input
                type="url"
                id="ann-video"
                value={formData.videoUrl}
                onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
                placeholder={t('announcements.fields.videoUrlPlaceholder')}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="ann-priority">{t('announcements.fields.priority')}</label>
                <select
                  id="ann-priority"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: Number(e.target.value) })}
                >
                  <option value={1}>{t('announcements.priority.low')}</option>
                  <option value={2}>{t('announcements.priority.medium')}</option>
                  <option value={3}>{t('announcements.priority.high')}</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="ann-expires">{t('announcements.fields.expiresAt')}</label>
                <input
                  type="date"
                  id="ann-expires"
                  value={formData.expiresAt}
                  onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group form-checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
                {t('announcements.fields.active')}
              </label>
            </div>

            <div className="form-actions">
              <button type="submit">
                {editing ? t('announcements.edit') : t('announcements.create')}
              </button>
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="preview-btn"
              >
                {showPreview ? t('announcements.hidePreview') : t('announcements.showPreview')}
              </button>
              <button type="button" onClick={handleCancel} className="cancel-btn">
                {t('common.cancel')}
              </button>
            </div>
          </form>

          {showPreview && (
            <div className="announcement-preview">
              <h4>{t('announcements.preview')}</h4>
              <div
                className="preview-content"
                dangerouslySetInnerHTML={{ __html: formData.body }}
              />
            </div>
          )}
        </div>
      )}

      <div className="announcements-list">
        <h3>{t('announcements.allAnnouncements')} ({announcements.length})</h3>
        {announcements.length === 0 ? (
          <div className="empty-state">
            <p>{t('announcements.noAnnouncements')}</p>
          </div>
        ) : (
          <div className="announcements-grid">
            {announcements.map((ann) => {
              const status = getStatusLabel(ann);
              return (
                <div key={ann.announcementId} className="announcement-card">
                  <div className="announcement-card-header">
                    <h4>{ann.title}</h4>
                    <span className={`status-badge ${status}`}>
                      {t(`announcements.status.${status}`)}
                    </span>
                  </div>
                  <div className="announcement-meta">
                    <span className={`priority-label priority-${ann.priority}`}>
                      {t(`announcements.priority.${PRIORITY_LABELS[ann.priority]?.toLowerCase() ?? 'low'}`)}
                    </span>
                    <span className="announcement-date">
                      {new Date(ann.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {ann.expiresAt && (
                    <p className="announcement-expires">
                      {t('announcements.fields.expiresAt')}: {new Date(ann.expiresAt).toLocaleDateString()}
                    </p>
                  )}
                  <div className="announcement-actions">
                    <button
                      onClick={() => handleEdit(ann)}
                      className="announcement-edit-btn"
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      onClick={() => handleDelete(ann.announcementId)}
                      className="announcement-delete-btn"
                      disabled={deleting === ann.announcementId}
                    >
                      {deleting === ann.announcementId ? t('common.saving') : t('common.delete')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
