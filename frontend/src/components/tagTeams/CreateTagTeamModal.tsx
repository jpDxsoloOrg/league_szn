import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { tagTeamsApi, playersApi, profileApi } from '../../services/api';
import type { Player } from '../../types';
import './CreateTagTeamModal.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateTagTeamModal({ isOpen, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();
    setLoadingPlayers(true);
    setName('');
    setPartnerId('');
    setImageUrl('');
    setError(null);
    setSuccess(false);

    const loadPlayers = async () => {
      try {
        const [allPlayers, myProfile] = await Promise.all([
          playersApi.getAll(controller.signal),
          profileApi.getMyProfile(controller.signal),
        ]);
        // Filter out self and players already in a tag team
        const available = allPlayers.filter(
          (p) => p.playerId !== myProfile.playerId && !p.tagTeamId
        );
        setPlayers(available);
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(t('tagTeams.create.loadPlayersFailed', 'Failed to load players'));
        }
      } finally {
        setLoadingPlayers(false);
      }
    };

    loadPlayers();

    return () => controller.abort();
  }, [isOpen, t]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t('tagTeams.create.nameRequired', 'Tag team name is required'));
      return;
    }
    if (!partnerId) {
      setError(t('tagTeams.create.partnerRequired', 'Please select a partner'));
      return;
    }

    setSubmitting(true);
    try {
      await tagTeamsApi.create({
        name: trimmedName,
        partnerId,
        ...(imageUrl.trim() ? { imageUrl: imageUrl.trim() } : {}),
      });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setName('');
        setPartnerId('');
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
    <div className="create-tagteam-modal-overlay" onClick={handleOverlayClick} role="dialog" aria-modal="true">
      <div className="create-tagteam-modal" onClick={(e) => e.stopPropagation()}>
        <div className="create-tagteam-modal__header">
          <h2>{t('tagTeams.create.title', 'Create a Tag Team')}</h2>
          <button
            className="create-tagteam-modal__close"
            onClick={onClose}
            disabled={submitting}
            aria-label={t('common.close', 'Close')}
          >
            &times;
          </button>
        </div>

        {success ? (
          <div className="create-tagteam-modal__success">
            <p>{t('tagTeams.create.success', 'Tag team request sent to partner!')}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="create-tagteam-modal__form">
            <div className="form-group">
              <label htmlFor="tagteam-name">{t('tagTeams.create.nameLabel', 'Tag Team Name')}</label>
              <input
                type="text"
                id="tagteam-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('tagTeams.create.namePlaceholder', 'e.g. The Hardy Boyz, DX')}
                disabled={submitting}
                autoFocus
                maxLength={50}
              />
            </div>

            <div className="form-group">
              <label htmlFor="tagteam-partner">{t('tagTeams.create.partnerLabel', 'Select Partner')}</label>
              {loadingPlayers ? (
                <p className="create-tagteam-modal__loading">{t('common.loading', 'Loading...')}</p>
              ) : players.length === 0 ? (
                <p className="create-tagteam-modal__empty">
                  {t('tagTeams.create.noAvailablePlayers', 'No available players')}
                </p>
              ) : (
                <select
                  id="tagteam-partner"
                  value={partnerId}
                  onChange={(e) => setPartnerId(e.target.value)}
                  disabled={submitting}
                >
                  <option value="">{t('tagTeams.create.selectPartner', '-- Select a partner --')}</option>
                  {players.map((player) => (
                    <option key={player.playerId} value={player.playerId}>
                      {player.currentWrestler || player.name} ({player.name})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="tagteam-image">{t('tagTeams.create.imageLabel', 'Image URL (optional)')}</label>
              <input
                type="url"
                id="tagteam-image"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder={t('tagTeams.create.imagePlaceholder', 'https://...')}
                disabled={submitting}
              />
            </div>

            {error && (
              <div className="create-tagteam-modal__error" role="alert">{error}</div>
            )}

            <div className="create-tagteam-modal__actions">
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
                disabled={submitting || loadingPlayers || players.length === 0}
                aria-busy={submitting}
              >
                {submitting
                  ? t('common.submitting', 'Submitting...')
                  : t('tagTeams.create.submit', 'Send Request')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
