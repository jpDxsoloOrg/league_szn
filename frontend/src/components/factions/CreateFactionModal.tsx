import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { factionsApi, imagesApi } from '../../services/api';
import Avatar from '../ui/Avatar';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { useToast } from '../ui/toastContext';
import './groupUi.css';

const ACCEPTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const ACCEPT_ATTR = ACCEPTED_MIME_TYPES.join(',');
const FORM_ID = 'create-faction-form';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateFactionModal({ isOpen, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
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
      const { uploadUrl, imageUrl: uploadedUrl } = await imagesApi.generateUploadUrl(file.name, file.type, 'factions');
      await imagesApi.uploadToS3(uploadUrl, file);
      setImageUrl(uploadedUrl);
    } catch {
      setError(t('factions.my.uploadFailed', 'Upload failed. Please try again.'));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
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
      showToast(t('factions.create.success', 'Faction request submitted! Awaiting admin approval.'), 'success');
      setName('');
      setImageUrl('');
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error', 'An error occurred'));
    } finally {
      setSubmitting(false);
    }
  };

  const hasImage = Boolean(imageUrl.trim());

  return (
    <Modal
      open={isOpen}
      title={t('factions.create.title', 'Create a Faction')}
      onClose={() => { if (!submitting) onClose(); }}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="submit" form={FORM_ID} loading={submitting} disabled={uploading}>
            {submitting ? t('common.submitting', 'Submitting...') : t('factions.create.submit', 'Request Faction')}
          </Button>
        </>
      )}
    >
      <form id={FORM_ID} className="group-form" onSubmit={handleSubmit}>
        <label className="group-field">
          <span className="group-field__label">{t('factions.create.nameLabel', 'Faction Name')}</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('factions.create.namePlaceholder', 'e.g. The Shield, New Day')}
            disabled={submitting}
            maxLength={50}
          />
        </label>

        <div className="group-field">
          <span className="group-field__label">{t('factions.my.uploadImage', 'Upload faction image')}</span>
          <div className="group-person">
            {hasImage && <Avatar src={imageUrl} name={name || t('factions.create.title', 'Create a Faction')} size="lg" />}
            <Button
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting}
              loading={uploading}
            >
              {uploading
                ? t('factions.my.uploadingImage', 'Uploading…')
                : hasImage
                  ? t('factions.my.replaceImage', 'Replace image')
                  : t('factions.my.uploadImage', 'Upload faction image')}
            </Button>
          </div>
          <span className="group-muted">{t('factions.my.uploadAcceptedTypes', 'PNG, JPEG, GIF, or WebP')}</span>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_ATTR}
            className="group-file-input"
            onChange={handleFileChange}
            aria-label={t('factions.my.uploadImage', 'Upload faction image')}
          />
        </div>

        <label className="group-field">
          <span className="group-field__label">{t('factions.create.imageUrlFallbackLabel', 'Or paste a URL')}</span>
          <input
            type="url"
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
            placeholder={t('factions.create.imagePlaceholder', 'https://...')}
            disabled={submitting || uploading}
          />
        </label>

        {error && <p className="group-error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}
