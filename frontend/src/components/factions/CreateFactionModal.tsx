import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { factionsApi } from '../../services/api';
import './CreateFactionModal.css';

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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
              <label htmlFor="faction-image">{t('factions.create.imageLabel', 'Image URL (optional)')}</label>
              <input
                type="url"
                id="faction-image"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder={t('factions.create.imagePlaceholder', 'https://...')}
                disabled={submitting}
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
                disabled={submitting}
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
