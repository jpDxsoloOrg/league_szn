import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { factionsApi, imagesApi } from '../../services/api';
import {
  DEFAULT_WRESTLER_IMAGE,
  resolveImageSrc,
  applyImageFallback,
} from '../../constants/imageFallbacks';
import './CreateFactionModal.css';

const ACCEPTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const ACCEPT_ATTR = ACCEPTED_MIME_TYPES.join(',');

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateFactionModal({ isOpen, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePickImage = () => {
    if (submitting || uploading) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      setError(t('factions.my.uploadFailed', 'Upload failed. Please try again.'));
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const { uploadUrl, imageUrl: uploadedUrl } = await imagesApi.generateUploadUrl(
        file.name,
        file.type,
        'factions'
      );
      await imagesApi.uploadToS3(uploadUrl, file);
      setImageUrl(uploadedUrl);
    } catch {
      setError(t('factions.my.uploadFailed', 'Upload failed. Please try again.'));
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t('factions.create.nameRequired', 'Faction name is required'));
      return;
    }

    setSubmitting(true);
    try {
      await factionsApi.create({
        name: trimmedName,
        ...(imageUrl.trim() ? { imageUrl: imageUrl.trim() } : {}),
      });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setName('');
        setImageUrl('');
        onCreated();
        onClose();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error', 'An error occurred'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleOverlayClick = () => {
    if (!submitting) onClose();
  };

  return (
    <div className="create-faction-modal-overlay" onClick={handleOverlayClick} role="dialog" aria-modal="true">
      <div className="create-faction-modal" onClick={(e) => e.stopPropagation()}>
        <div className="create-faction-modal__header">
          <h2>{t('factions.create.title', 'Create a Faction')}</h2>
          <button
            className="create-faction-modal__close"
            onClick={onClose}
            disabled={submitting}
            aria-label={t('common.close', 'Close')}
          >
            &times;
          </button>
        </div>

        {success ? (
          <div className="create-faction-modal__success">
            <p>{t('factions.create.success', 'Faction request submitted! Awaiting admin approval.')}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="create-faction-modal__form">
            <div className="form-group">
              <label htmlFor="faction-name">{t('factions.create.nameLabel', 'Faction Name')}</label>
              <input
                type="text"
                id="faction-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('factions.create.namePlaceholder', 'e.g. The Shield, New Day')}
                disabled={submitting}
                autoFocus
                maxLength={50}
              />
            </div>

            <div className="form-group">
              <label>{t('factions.my.uploadImage', 'Upload faction image')}</label>
              <div className="create-faction-modal__upload">
                {imageUrl.trim() && (
                  <div className="create-faction-modal__upload-preview">
                    <img
                      src={resolveImageSrc(imageUrl, DEFAULT_WRESTLER_IMAGE)}
                      onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
                      alt={name || t('factions.create.title', 'Create a Faction')}
                    />
                  </div>
                )}
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handlePickImage}
                  disabled={submitting || uploading}
                  aria-busy={uploading}
                >
                  {uploading
                    ? t('factions.my.uploadingImage', 'Uploading…')
                    : imageUrl.trim()
                      ? t('factions.my.replaceImage', 'Replace image')
                      : t('factions.my.uploadImage', 'Upload faction image')}
                </button>
                <span className="create-faction-modal__upload-hint">
                  {t('factions.my.uploadAcceptedTypes', 'PNG, JPEG, GIF, or WebP')}
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT_ATTR}
                  className="create-faction-modal__file-input"
                  onChange={handleFileChange}
                  aria-label={t('factions.my.uploadImage', 'Upload faction image')}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="faction-image">{t('factions.create.imageUrlFallbackLabel', 'Or paste a URL')}</label>
              <input
                type="url"
                id="faction-image"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder={t('factions.create.imagePlaceholder', 'https://...')}
                disabled={submitting || uploading}
              />
            </div>

            {error && (
              <div className="create-faction-modal__error" role="alert">{error}</div>
            )}

            <div className="create-faction-modal__actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={onClose}
                disabled={submitting}
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={submitting || uploading}
                aria-busy={submitting}
              >
                {submitting
                  ? t('common.submitting', 'Submitting...')
                  : t('factions.create.submit', 'Request Faction')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
