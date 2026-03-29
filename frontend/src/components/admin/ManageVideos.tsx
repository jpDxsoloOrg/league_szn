import { useState, useEffect, useCallback, useRef, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { videosApi, imagesApi } from '../../services/api';
import type { Video, VideoCategory } from '../../types';
import Skeleton from '../ui/Skeleton';
import './ManageVideos.css';

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
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      setLoading(true);
      const data = await videosApi.getAll(signal);
      setVideos(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : t('videos.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
    setSuccessMsg(null);

    if (!formData.title.trim()) {
      setError(t('videos.titleRequired'));
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
        setError(t('videos.videoRequired'));
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

      setFormData(DEFAULT_FORM);
      setShowForm(false);
      setEditing(null);
      if (videoInputRef.current) videoInputRef.current.value = '';
      if (thumbInputRef.current) thumbInputRef.current.value = '';
      await loadVideos();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('videos.saveError'));
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
    if (!confirm(t('videos.confirmDelete'))) return;

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
    if (videoInputRef.current) videoInputRef.current.value = '';
    if (thumbInputRef.current) thumbInputRef.current.value = '';
  };

  if (loading) {
    return <Skeleton variant="block" count={4} />;
  }

  return (
    <div className="manage-videos">
      <div className="videos-header">
        <h2>{t('videos.title')}</h2>
        {!showForm && (
          <button onClick={() => setShowForm(true)}>
            {t('videos.upload')}
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}
      {successMsg && <div className="success-message">{successMsg}</div>}

      {showForm && (
        <div className="video-form-container">
          <h3>{editing ? t('videos.edit') : t('videos.upload')}</h3>
          <form onSubmit={handleSubmit} className="video-form">
            <div className="form-group">
              <label htmlFor="video-title">{t('videos.fields.title')}</label>
              <input
                type="text"
                id="video-title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="video-description">{t('videos.fields.description')}</label>
              <textarea
                id="video-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="form-group">
              <label htmlFor="video-file">{t('videos.fields.videoFile')}</label>
              <input
                type="file"
                id="video-file"
                ref={videoInputRef}
                accept="video/mp4,video/webm,video/quicktime"
              />
              {formData.videoUrl && (
                <p className="current-url">{t('videos.currentUrl')}: {formData.videoUrl}</p>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="video-thumbnail">{t('videos.fields.thumbnail')}</label>
              <input
                type="file"
                id="video-thumbnail"
                ref={thumbInputRef}
                accept="image/jpeg,image/png,image/webp"
              />
              {formData.thumbnailUrl && (
                <p className="current-url">{t('videos.currentThumbnail')}: {formData.thumbnailUrl}</p>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="video-category">{t('videos.fields.category')}</label>
                <select
                  id="video-category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as VideoCategory })}
                >
                  {CATEGORY_OPTIONS.map((cat) => (
                    <option key={cat} value={cat}>
                      {t(`videos.categories.${cat}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="video-tags">{t('videos.fields.tags')}</label>
                <input
                  type="text"
                  id="video-tags"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder={t('videos.tagsPlaceholder')}
                />
              </div>
            </div>

            <div className="form-group form-checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={formData.isPublished}
                  onChange={(e) => setFormData({ ...formData, isPublished: e.target.checked })}
                />
                {t('videos.fields.published')}
              </label>
            </div>

            {uploadProgress && <div className="upload-progress">{uploadProgress}</div>}

            <div className="form-actions">
              <button type="submit" disabled={uploading}>
                {uploading ? t('common.saving') : (editing ? t('videos.edit') : t('videos.upload'))}
              </button>
              <button type="button" onClick={handleCancel} className="cancel-btn">
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="videos-list">
        <h3>{t('videos.allVideos')} ({videos.length})</h3>
        {videos.length === 0 ? (
          <div className="empty-state">
            <p>{t('videos.noVideos')}</p>
          </div>
        ) : (
          <div className="videos-grid">
            {videos.map((video) => (
              <div key={video.videoId} className="video-card">
                <div className="video-card-preview">
                  {video.thumbnailUrl ? (
                    <img src={video.thumbnailUrl} alt={video.title} className="video-thumbnail" />
                  ) : (
                    <div className="video-placeholder">
                      <span>&#9654;</span>
                    </div>
                  )}
                </div>
                <div className="video-card-info">
                  <h4>{video.title}</h4>
                  <div className="video-meta">
                    <span className={`category-badge category-${video.category}`}>
                      {t(`videos.categories.${video.category}`)}
                    </span>
                    <span className={`status-badge ${video.isPublished ? 'active' : 'inactive'}`}>
                      {video.isPublished ? t('videos.published') : t('videos.draft')}
                    </span>
                    <span className="video-date">
                      {new Date(video.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {video.description && (
                    <p className="video-description">{video.description}</p>
                  )}
                  <div className="video-actions">
                    <button onClick={() => handleEdit(video)} className="video-edit-btn">
                      {t('common.edit')}
                    </button>
                    <button
                      onClick={() => handleDelete(video.videoId)}
                      className="video-delete-btn"
                      disabled={deleting === video.videoId}
                    >
                      {deleting === video.videoId ? t('common.saving') : t('common.delete')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
