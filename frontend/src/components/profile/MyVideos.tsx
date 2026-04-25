import { useState, useEffect, useCallback, useRef, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { videosApi, imagesApi, profileApi } from '../../services/api';
import type { Player, Video, VideoCategory } from '../../types';
import Skeleton from '../ui/Skeleton';
import '../admin/ManageVideos.css';

const CATEGORY_OPTIONS: VideoCategory[] = ['match', 'highlight', 'promo', 'other'];

const DEFAULT_FORM = {
  title: '',
  description: '',
  category: 'highlight' as VideoCategory,
  tags: '',
};

export default function MyVideos() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<Player | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  const loadProfile = useCallback(async (signal?: AbortSignal) => {
    try {
      setProfileLoading(true);
      const me = await profileApi.getMyProfile(signal);
      setProfile(me);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setProfileLoading(false);
    }
  }, []);

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
    loadProfile(controller.signal);
    loadVideos(controller.signal);
    return () => controller.abort();
  }, [loadProfile, loadVideos]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!formData.title.trim()) {
      setError(t('videos.titleRequired'));
      return;
    }

    const videoFile = videoInputRef.current?.files?.[0];
    if (!videoFile) {
      setError(t('videos.videoRequired'));
      return;
    }

    try {
      setSubmitting(true);

      setUploadProgress(t('videos.uploadingVideo'));
      const videoUpload = await imagesApi.generateUploadUrl(
        videoFile.name,
        videoFile.type,
        'videos'
      );
      await imagesApi.uploadVideoToS3(videoUpload.uploadUrl, videoFile);

      let thumbnailUrl: string | undefined;
      const thumbFile = thumbInputRef.current?.files?.[0];
      if (thumbFile) {
        setUploadProgress(t('videos.uploadingThumbnail'));
        const thumbUpload = await imagesApi.generateUploadUrl(
          thumbFile.name,
          thumbFile.type,
          'videos'
        );
        await imagesApi.uploadToS3(thumbUpload.uploadUrl, thumbFile);
        thumbnailUrl = thumbUpload.imageUrl;
      }

      setUploadProgress('');

      const tags = formData.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);

      // Backend forces isPublished=false for wrestler submissions, but send it
      // explicitly so behavior is obvious from the call site.
      await videosApi.create({
        title: formData.title,
        description: formData.description,
        videoUrl: videoUpload.imageUrl,
        thumbnailUrl,
        category: formData.category,
        tags,
        isPublished: false,
      });

      setSuccessMsg('Video submitted! An admin will review it before publishing.');
      setFormData(DEFAULT_FORM);
      setShowForm(false);
      if (videoInputRef.current) videoInputRef.current.value = '';
      if (thumbInputRef.current) thumbInputRef.current.value = '';
      await loadVideos();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('videos.saveError'));
    } finally {
      setSubmitting(false);
      setUploadProgress('');
    }
  };

  const handleCancel = () => {
    setFormData(DEFAULT_FORM);
    setShowForm(false);
    if (videoInputRef.current) videoInputRef.current.value = '';
    if (thumbInputRef.current) thumbInputRef.current.value = '';
  };

  if (profileLoading) {
    return <Skeleton variant="block" count={2} />;
  }

  if (!profile?.canUploadVideos) {
    return (
      <div className="manage-videos">
        <h2>My Videos</h2>
        <div className="empty-state">
          <p>
            Your account isn't permitted to upload videos. Ask an admin to
            enable video uploads on your wrestler profile.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="manage-videos">
      <div className="videos-header">
        <h2>My Videos</h2>
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
          <h3>{t('videos.upload')}</h3>
          <form onSubmit={handleSubmit} className="video-form">
            <div className="form-group">
              <label htmlFor="my-video-title">{t('videos.fields.title')}</label>
              <input
                type="text"
                id="my-video-title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="my-video-description">{t('videos.fields.description')}</label>
              <textarea
                id="my-video-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="form-group">
              <label htmlFor="my-video-file">{t('videos.fields.videoFile')}</label>
              <input
                type="file"
                id="my-video-file"
                ref={videoInputRef}
                accept="video/mp4,video/webm,video/quicktime"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="my-video-thumbnail">{t('videos.fields.thumbnail')}</label>
              <input
                type="file"
                id="my-video-thumbnail"
                ref={thumbInputRef}
                accept="image/jpeg,image/png,image/webp"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="my-video-category">{t('videos.fields.category')}</label>
                <select
                  id="my-video-category"
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
                <label htmlFor="my-video-tags">{t('videos.fields.tags')}</label>
                <input
                  type="text"
                  id="my-video-tags"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder={t('videos.tagsPlaceholder')}
                />
              </div>
            </div>

            {uploadProgress && <div className="upload-progress">{uploadProgress}</div>}

            <div className="form-actions">
              <button type="submit" disabled={submitting}>
                {submitting ? t('common.saving') : t('videos.upload')}
              </button>
              <button type="button" onClick={handleCancel} className="cancel-btn">
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="videos-list">
        <h3>My Submissions ({videos.length})</h3>
        {loading ? (
          <Skeleton variant="block" count={2} />
        ) : videos.length === 0 ? (
          <div className="empty-state">
            <p>You haven't submitted any videos yet.</p>
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
