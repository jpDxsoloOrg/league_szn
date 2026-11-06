import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Plus, Video as VideoIcon } from 'lucide-react';
import { videosApi, imagesApi } from '../../services/api';
import type { Video, VideoCategory } from '../../types';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import DataTable from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import AdminFormModal from './AdminFormModal';
import AdminNotice from './AdminNotice';
import useAdminConfirm from './useAdminConfirm';
import './adminContent.css';

const CATEGORY_OPTIONS: VideoCategory[] = ['match', 'highlight', 'promo', 'other'];

const DEFAULT_FORM = {
  title: '',
  description: '',
  videoUrl: '',
  thumbnailUrl: '',
  category: 'highlight' as VideoCategory,
  tags: '',
  isPublished: true,
};

export default function ManageVideos() {
  const { t } = useTranslation();
  const { confirm, confirmDialog } = useAdminConfirm();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Video | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  const loadVideos = useCallback(async (signal?: AbortSignal) => {
    try {
      setVideos(await videosApi.getAll(signal));
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadVideos(controller.signal);
    return () => controller.abort();
  }, [loadVideos]);

  const handleVideoUpload = async (file: File): Promise<string> => {
    setUploadProgress(t('videos.uploadingVideo'));
    const { uploadUrl, imageUrl } = await imagesApi.generateUploadUrl(
      file.name,
      file.type,
      'videos'
    );
    await imagesApi.uploadVideoToS3(uploadUrl, file);
    setUploadProgress('');
    return imageUrl;
  };

  const handleThumbnailUpload = async (file: File): Promise<string> => {
    setUploadProgress(t('videos.uploadingThumbnail'));
    const { uploadUrl, imageUrl } = await imagesApi.generateUploadUrl(
      file.name,
      file.type,
      'videos'
    );
    await imagesApi.uploadToS3(uploadUrl, file);
    setUploadProgress('');
    return imageUrl;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFormError(null);
    setSuccessMsg(null);

    if (!formData.title.trim()) {
      setFormError(t('videos.titleRequired'));
      return;
    }

    try {
      setUploading(true);
      let videoUrl = formData.videoUrl;
      let thumbnailUrl = formData.thumbnailUrl;

      // Upload video file if selected
      const videoFile = videoInputRef.current?.files?.[0];
      if (videoFile) {
        videoUrl = await handleVideoUpload(videoFile);
      }

      if (!videoUrl.trim()) {
        setFormError(t('videos.videoRequired'));
        setUploading(false);
        return;
      }

      // Upload thumbnail file if selected
      const thumbFile = thumbInputRef.current?.files?.[0];
      if (thumbFile) {
        thumbnailUrl = await handleThumbnailUpload(thumbFile);
      }

      const tags = formData.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);

      const payload = {
        title: formData.title,
        description: formData.description,
        videoUrl,
        thumbnailUrl: thumbnailUrl || undefined,
        category: formData.category,
        tags,
        isPublished: formData.isPublished,
      };

      if (editing) {
        await videosApi.update(editing.videoId, payload);
        setSuccessMsg(t('videos.updateSuccess'));
      } else {
        await videosApi.create(payload);
        setSuccessMsg(t('videos.createSuccess'));
      }

      handleCancel();
      await loadVideos();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('videos.saveError'));
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  };

  const handleEdit = (video: Video) => {
    setEditing(video);
    setFormData({
      title: video.title,
      description: video.description || '',
      videoUrl: video.videoUrl,
      thumbnailUrl: video.thumbnailUrl || '',
      category: video.category,
      tags: video.tags?.join(', ') || '',
      isPublished: video.isPublished,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({ title: t('videos.confirmDelete'), confirmLabel: t('common.delete') });
    if (!confirmed) return;

    setDeleting(id);
    setError(null);
    setSuccessMsg(null);

    try {
      await videosApi.delete(id);
      setSuccessMsg(t('videos.deleteSuccess'));
      await loadVideos();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('videos.deleteError'));
    } finally {
      setDeleting(null);
    }
  };

  const handleCancel = () => {
    setFormData(DEFAULT_FORM);
    setShowForm(false);
    setEditing(null);
    setFormError(null);
  };

  const title = t('videos.title');

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
          <Button icon={<Plus aria-hidden="true" size={18} />} onClick={() => setShowForm(true)}>
            {t('videos.upload')}
          </Button>
        )}
      />

      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      {successMsg && <AdminNotice tone="success">{successMsg}</AdminNotice>}

      <section className="ac-section">
        <h2 className="ac-section__title">{t('videos.allVideos')} ({videos.length})</h2>
        <DataTable
          caption={t('videos.allVideos')}
          density="dense"
          rows={videos}
          rowKey={(video) => video.videoId}
          empty={<EmptyState icon={<VideoIcon aria-hidden="true" size={32} />} title={t('videos.noVideos')} />}
          columns={[
            {
              key: 'title',
              header: t('videos.fields.title'),
              render: (video) => (
                <span className="ac-cell">
                  {video.thumbnailUrl ? (
                    <img src={video.thumbnailUrl} alt="" className="ac-thumb" />
                  ) : (
                    <span className="ac-thumb ac-thumb--placeholder"><Play aria-hidden="true" size={18} /></span>
                  )}
                  <span className="ac-cell__text">
                    <span className="ac-cell__title">{video.title}</span>
                    {video.description && <span className="ac-cell__sub">{video.description}</span>}
                  </span>
                </span>
              ),
              sortValue: (video) => video.title,
            },
            {
              key: 'category',
              header: t('videos.fields.category'),
              render: (video) => <Badge tone="violet">{t(`videos.categories.${video.category}`)}</Badge>,
            },
            {
              key: 'status',
              header: t('adminContent.status', 'Status'),
              render: (video) => (
                <Badge tone={video.isPublished ? 'win' : 'neutral'}>
                  {video.isPublished ? t('videos.published') : t('videos.draft')}
                </Badge>
              ),
            },
            {
              key: 'date',
              header: t('adminContent.created', 'Created'),
              render: (video) => new Date(video.createdAt).toLocaleDateString(),
              sortValue: (video) => video.createdAt,
            },
            {
              key: 'actions',
              header: t('common.actions'),
              align: 'end',
              render: (video) => (
                <div className="ac-actions ac-actions--end">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(video)}>{t('common.edit')}</Button>
                  <Button variant="ghost" size="sm" loading={deleting === video.videoId} onClick={() => handleDelete(video.videoId)}>
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
        onClose={handleCancel}
        title={editing ? t('videos.edit') : t('videos.upload')}
        submitLabel={editing ? t('videos.update', 'Update Video') : t('videos.upload')}
        onSubmit={handleSubmit}
        busy={uploading}
        error={formError}
      >
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="video-title">{t('videos.fields.title')}</label>
          <input
            type="text"
            id="video-title"
            value={formData.title}
            onChange={(event) => setFormData({ ...formData, title: event.target.value })}
            required
          />
        </div>
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="video-description">{t('videos.fields.description')}</label>
          <textarea
            id="video-description"
            value={formData.description}
            onChange={(event) => setFormData({ ...formData, description: event.target.value })}
            rows={3}
          />
        </div>
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="video-file">{t('videos.fields.videoFile')}</label>
          <input type="file" id="video-file" ref={videoInputRef} accept="video/mp4,video/webm,video/quicktime" />
          {formData.videoUrl && <p className="ac-field__hint">{t('videos.currentUrl')}: {formData.videoUrl}</p>}
        </div>
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="video-thumbnail">{t('videos.fields.thumbnail')}</label>
          <input type="file" id="video-thumbnail" ref={thumbInputRef} accept="image/jpeg,image/png,image/webp" />
          {formData.thumbnailUrl && <p className="ac-field__hint">{t('videos.currentThumbnail')}: {formData.thumbnailUrl}</p>}
        </div>
        <div className="ac-form__row">
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="video-category">{t('videos.fields.category')}</label>
            <select
              id="video-category"
              value={formData.category}
              onChange={(event) => setFormData({ ...formData, category: event.target.value as VideoCategory })}
            >
              {CATEGORY_OPTIONS.map((category) => (
                <option key={category} value={category}>{t(`videos.categories.${category}`)}</option>
              ))}
            </select>
          </div>
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="video-tags">{t('videos.fields.tags')}</label>
            <input
              type="text"
              id="video-tags"
              value={formData.tags}
              onChange={(event) => setFormData({ ...formData, tags: event.target.value })}
              placeholder={t('videos.tagsPlaceholder')}
            />
          </div>
        </div>
        <label className="ac-check">
          <input
            type="checkbox"
            checked={formData.isPublished}
            onChange={(event) => setFormData({ ...formData, isPublished: event.target.checked })}
          />
          {t('videos.fields.published')}
        </label>
        {uploadProgress && <p className="ac-field__hint" role="status">{uploadProgress}</p>}
      </AdminFormModal>

      {confirmDialog}
    </div>
  );
}
