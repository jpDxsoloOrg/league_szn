import { useState, useEffect, useCallback, useRef, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Clapperboard, Play } from 'lucide-react';
import { videosApi, imagesApi, profileApi } from '../../services/api';
import type { Player, Video, VideoCategory } from '../../types';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import '../MeForms.css';
import './MyVideos.css';

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
      setError(err instanceof Error ? err.message : t('me.profile.loadFailed'));
    } finally {
      setProfileLoading(false);
    }
  }, [t]);

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

      setSuccessMsg(t('me.videos.submitted'));
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
    return (
      <div className="my-videos">
        <Skeleton variant="block" count={2} />
      </div>
    );
  }

  if (!profile?.canUploadVideos) {
    return (
      <div className="my-videos">
        <PageHeader title={t('me.videos.title')} />
        {error && <p className="me-alert me-alert--error" role="alert">{error}</p>}
        <EmptyState
          icon={<Clapperboard aria-hidden="true" size={32} />}
          title={t('me.videos.notPermittedTitle')}
          description={t('me.videos.notPermitted')}
        />
      </div>
    );
  }

  return (
    <div className="my-videos">
      <PageHeader
        title={t('me.videos.title')}
        actions={!showForm && <Button onClick={() => setShowForm(true)}>{t('videos.upload')}</Button>}
      />

      {error && <p className="me-alert me-alert--error" role="alert">{error}</p>}
      {successMsg && <p className="me-alert me-alert--success" role="status">{successMsg}</p>}

      {showForm && (
        <Card className="my-videos__form">
          <h2 className="my-videos__heading">{t('videos.upload')}</h2>
          <form onSubmit={handleSubmit}>
            <div className="me-field">
              <label htmlFor="my-video-title">{t('videos.fields.title')}</label>
              <input
                type="text"
                id="my-video-title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
            </div>

            <div className="me-field">
              <label htmlFor="my-video-description">{t('videos.fields.description')}</label>
              <textarea
                id="my-video-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="me-field">
              <label htmlFor="my-video-file">{t('videos.fields.videoFile')}</label>
              <input
                type="file"
                id="my-video-file"
                ref={videoInputRef}
                accept="video/mp4,video/webm,video/quicktime"
                required
              />
            </div>

            <div className="me-field">
              <label htmlFor="my-video-thumbnail">{t('videos.fields.thumbnail')}</label>
              <input
                type="file"
                id="my-video-thumbnail"
                ref={thumbInputRef}
                accept="image/jpeg,image/png,image/webp"
              />
            </div>

            <div className="my-videos__pair">
              <div className="me-field">
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

              <div className="me-field">
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

            {uploadProgress && <p className="me-alert" role="status">{uploadProgress}</p>}

            <div className="my-videos__actions">
              <Button type="submit" loading={submitting}>
                {submitting ? t('common.saving') : t('videos.upload')}
              </Button>
              <Button variant="secondary" onClick={handleCancel} disabled={submitting}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <h2 className="my-videos__heading">{t('me.videos.submissions', { count: videos.length })}</h2>
      {loading ? (
        <Skeleton variant="block" count={2} />
      ) : videos.length === 0 ? (
        <EmptyState
          icon={<Clapperboard aria-hidden="true" size={32} />}
          title={t('me.videos.emptyTitle')}
          description={t('me.videos.emptyBody')}
        />
      ) : (
        <ul className="my-videos__grid">
          {videos.map((video) => (
            <li key={video.videoId}>
              <Card padding="none" className="my-videos__card">
                {video.thumbnailUrl ? (
                  <img src={video.thumbnailUrl} alt={video.title} className="my-videos__thumb" loading="lazy" />
                ) : (
                  <div className="my-videos__thumb my-videos__thumb--empty">
                    <Play aria-hidden="true" size={28} />
                  </div>
                )}
                <div className="my-videos__info">
                  <h3 className="my-videos__title">{video.title}</h3>
                  <div className="my-videos__meta">
                    <Badge tone="violet">{t(`videos.categories.${video.category}`)}</Badge>
                    <Badge tone={video.isPublished ? 'win' : 'neutral'}>
                      {video.isPublished ? t('videos.published') : t('videos.draft')}
                    </Badge>
                    <span className="me-hint">{new Date(video.createdAt).toLocaleDateString()}</span>
                  </div>
                  {video.description && <p className="my-videos__description">{video.description}</p>}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
