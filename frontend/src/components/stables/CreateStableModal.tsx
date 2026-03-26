import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { stablesApi } from '../../services/api';
import './CreateStableModal.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateStableModal({ isOpen, onClose, onCreated }: Props) {
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
      setError(t('stables.create.nameRequired', 'Stable name is required'));
      return;
    }

    setSubmitting(true);
    try {
      await stablesApi.create({
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
    <div className="create-stable-modal-overlay" onClick={handleOverlayClick} role="dialog" aria-modal="true">
      <div className="create-stable-modal" onClick={(e) => e.stopPropagation()}>
        <div className="create-stable-modal__header">
          <h2>{t('stables.create.title', 'Create a Stable')}</h2>
          <button
            className="create-stable-modal__close"
            onClick={onClose}
            disabled={submitting}
            aria-label={t('common.close', 'Close')}
          >
            &times;
          </button>
        </div>

        {success ? (
          <div className="create-stable-modal__success">
            <p>{t('stables.create.success', 'Stable request submitted! Awaiting admin approval.')}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="create-stable-modal__form">
            <div className="form-group">
              <label htmlFor="stable-name">{t('stables.create.nameLabel', 'Stable Name')}</label>
              <input
                type="text"
                id="stable-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('stables.create.namePlaceholder', 'e.g. The Shield, New Day')}
                disabled={submitting}
                autoFocus
                maxLength={50}
              />
            </div>

            <div className="form-group">
              <label htmlFor="stable-image">{t('stables.create.imageLabel', 'Image URL (optional)')}</label>
              <input
                type="url"
                id="stable-image"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder={t('stables.create.imagePlaceholder', 'https://...')}
                disabled={submitting}
              />
            </div>

            {error && (
              <div className="create-stable-modal__error" role="alert">{error}</div>
            )}

            <div className="create-stable-modal__actions">
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
                  : t('stables.create.submit', 'Request Stable')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
