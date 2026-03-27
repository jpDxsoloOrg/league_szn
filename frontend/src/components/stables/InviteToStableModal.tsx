import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { stablesApi, playersApi } from '../../services/api';
import type { Player } from '../../types';
import './InviteToStableModal.css';

interface Props {
  isOpen: boolean;
  stableId: string;
  currentMemberIds: string[];
  onClose: () => void;
  onInvited: () => void;
}

export default function InviteToStableModal({
  isOpen,
  stableId,
  currentMemberIds,
  onClose,
  onInvited,
}: Props) {
  const { t } = useTranslation();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();
    setLoadingPlayers(true);
    setSelectedPlayerId('');
    setMessage('');
    setError(null);
    setSuccess(false);

    playersApi.getAll(controller.signal)
      .then((allPlayers) => {
        const available = allPlayers.filter(
          (p) => !currentMemberIds.includes(p.playerId) && !p.stableId
        );
        setPlayers(available);
      })
      .catch((err) => {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(t('stables.invite.loadPlayersFailed', 'Failed to load players'));
        }
      })
      .finally(() => setLoadingPlayers(false));

    return () => controller.abort();
  }, [isOpen, currentMemberIds, t]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedPlayerId) {
      setError(t('stables.invite.selectPlayer', 'Please select a player to invite'));
      return;
    }

    setSubmitting(true);
    try {
      await stablesApi.invite(stableId, {
        playerId: selectedPlayerId,
        ...(message.trim() ? { message: message.trim() } : {}),
      });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onInvited();
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
    <div className="invite-stable-modal-overlay" onClick={handleOverlayClick} role="dialog" aria-modal="true">
      <div className="invite-stable-modal" onClick={(e) => e.stopPropagation()}>
        <div className="invite-stable-modal__header">
          <h2>{t('stables.invite.title', 'Invite Player to Stable')}</h2>
          <button
            className="invite-stable-modal__close"
            onClick={onClose}
            disabled={submitting}
            aria-label={t('common.close', 'Close')}
          >
            &times;
          </button>
        </div>

        {success ? (
          <div className="invite-stable-modal__success">
            <p>{t('stables.invite.success', 'Invitation sent successfully!')}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="invite-stable-modal__form">
            <div className="form-group">
              <label htmlFor="invite-player">{t('stables.invite.playerLabel', 'Select Player')}</label>
              {loadingPlayers ? (
                <p className="invite-stable-modal__loading">{t('common.loading', 'Loading...')}</p>
              ) : players.length === 0 ? (
                <p className="invite-stable-modal__empty">
                  {t('stables.invite.noAvailablePlayers', 'No available players to invite')}
                </p>
              ) : (
                <select
                  id="invite-player"
                  value={selectedPlayerId}
                  onChange={(e) => setSelectedPlayerId(e.target.value)}
                  disabled={submitting}
                >
                  <option value="">{t('stables.invite.selectPlaceholder', '-- Select a player --')}</option>
                  {players.map((player) => (
                    <option key={player.playerId} value={player.playerId}>
                      {player.currentWrestler || player.name} ({player.name})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="invite-message">{t('stables.invite.messageLabel', 'Message (optional)')}</label>
              <textarea
                id="invite-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('stables.invite.messagePlaceholder', 'Add a personal message...')}
                disabled={submitting}
                rows={3}
                maxLength={200}
              />
            </div>

            {error && (
              <div className="invite-stable-modal__error" role="alert">{error}</div>
            )}

            <div className="invite-stable-modal__actions">
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
                  : t('stables.invite.submit', 'Send Invitation')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
