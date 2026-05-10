import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { factionsApi, imagesApi } from '../../services/api';
import {
  DEFAULT_WRESTLER_IMAGE,
  resolveImageSrc,
  applyImageFallback,
} from '../../constants/imageFallbacks';
import './FactionImageUploader.css';

const ACCEPTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const ACCEPT_ATTR = ACCEPTED_MIME_TYPES.join(',');

interface Props {
  stableId: string;
  currentImageUrl?: string;
  factionName: string;
  onUploaded: (newImageUrl: string) => void;
}

export default function FactionImageUploader({
  stableId,
  currentImageUrl,
  factionName,
  onUploaded,
}: Props) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasImage = Boolean(currentImageUrl?.trim());
  const buttonLabel = hasImage
    ? t('factions.my.replaceImage', 'Replace image')
    : t('factions.my.uploadImage', 'Upload faction image');

  const handlePick = () => {
    if (uploading) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset the input so picking the same file twice still fires onChange.
    event.target.value = '';
    if (!file) return;

    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      setError(t('factions.my.uploadFailed', 'Upload failed. Please try again.'));
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const { uploadUrl, imageUrl } = await imagesApi.generateUploadUrl(
        file.name,
        file.type,
        'factions'
      );
      await imagesApi.uploadToS3(uploadUrl, file);
      await factionsApi.update(stableId, { imageUrl });
      onUploaded(imageUrl);
    } catch {
      setError(t('factions.my.uploadFailed', 'Upload failed. Please try again.'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="faction-image-uploader" data-testid="faction-image-uploader">
      <div className="faction-image-uploader__preview">
        <img
          src={resolveImageSrc(currentImageUrl, DEFAULT_WRESTLER_IMAGE)}
          onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
          alt={factionName}
          className="faction-image-uploader__image"
        />
      </div>
      <div className="faction-image-uploader__controls">
        <button
          type="button"
          className="btn-secondary faction-image-uploader__button"
          onClick={handlePick}
          disabled={uploading}
          aria-busy={uploading}
        >
          {uploading
            ? t('factions.my.uploadingImage', 'Uploading…')
            : buttonLabel}
        </button>
        <span className="faction-image-uploader__hint">
          {t('factions.my.uploadAcceptedTypes', 'PNG, JPEG, GIF, or WebP')}
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="faction-image-uploader__input"
          onChange={handleFileChange}
          aria-label={t('factions.my.uploadImage', 'Upload faction image')}
        />
      </div>
      {error && (
        <div className="faction-image-uploader__error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
