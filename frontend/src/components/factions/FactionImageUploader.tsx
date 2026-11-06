import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { factionsApi, imagesApi } from '../../services/api';
import Avatar from '../ui/Avatar';
import Button from '../ui/Button';
import './groupUi.css';
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
      <Avatar src={currentImageUrl} name={factionName} size="lg" />
      <div className="faction-image-uploader__controls">
        <Button variant="secondary" onClick={handlePick} loading={uploading}>
          {uploading ? t('factions.my.uploadingImage', 'Uploading…') : buttonLabel}
        </Button>
        <span className="group-muted">
          {t('factions.my.uploadAcceptedTypes', 'PNG, JPEG, GIF, or WebP')}
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="group-file-input"
          onChange={handleFileChange}
          aria-label={t('factions.my.uploadImage', 'Upload faction image')}
        />
      </div>
      {error && (
        <div className="faction-image-uploader__error group-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
