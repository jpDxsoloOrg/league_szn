import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { factionsApi, playersApi } from '../../services/api';
import type { Player } from '../../types';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Select from '../ui/Select';
import { useToast } from '../ui/toastContext';
import './groupUi.css';

const FORM_ID = 'invite-to-faction-form';

interface Props {
  isOpen: boolean;
  stableId: string;
  currentMemberIds: string[];
  onClose: () => void;
  onInvited: () => void;
}

export default function InviteToFactionModal({ isOpen, stableId, currentMemberIds, onClose, onInvited }: Props) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();
    setLoadingPlayers(true);
    setSelectedPlayerId('');
    setMessage('');
    setError(null);

    const loadPlayers = async () => {
      try {
        const allPlayers = await playersApi.getAll(controller.signal);
        setPlayers(allPlayers.filter((player) => !currentMemberIds.includes(player.playerId) && !player.stableId));
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(t('factions.invite.loadPlayersFailed', 'Failed to load players'));
        }
      } finally {
        if (!controller.signal.aborted) setLoadingPlayers(false);
      }
    };

    loadPlayers();
    return () => controller.abort();
  }, [isOpen, currentMemberIds, t]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!selectedPlayerId) {
      setError(t('factions.invite.selectPlayer', 'Please select a player to invite'));
      return;
    }

    setSubmitting(true);
    try {
      await factionsApi.invite(stableId, {
        playerId: selectedPlayerId,
        ...(message.trim() ? { message: message.trim() } : {}),
      });
      showToast(t('factions.invite.success', 'Invitation sent successfully!'), 'success');
      onInvited();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error', 'An error occurred'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      title={t('factions.invite.title', 'Invite Player to Faction')}
      onClose={() => { if (!submitting) onClose(); }}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="submit" form={FORM_ID} loading={submitting} disabled={loadingPlayers || players.length === 0}>
            {submitting ? t('common.submitting', 'Submitting...') : t('factions.invite.submit', 'Send Invitation')}
          </Button>
        </>
      )}
    >
      <form id={FORM_ID} className="group-form" onSubmit={handleSubmit}>
        <div className="group-field">
          <span className="group-field__label">{t('factions.invite.playerLabel', 'Select Player')}</span>
          {loadingPlayers ? (
            <p className="group-empty">{t('common.loading', 'Loading...')}</p>
          ) : players.length === 0 ? (
            <p className="group-empty">{t('factions.invite.noAvailablePlayers', 'No available players to invite')}</p>
          ) : (
            <Select
              label={t('factions.invite.playerLabel', 'Select Player')}
              placeholder={t('factions.invite.selectPlaceholder', '-- Select a player --')}
              value={selectedPlayerId}
              onValueChange={setSelectedPlayerId}
              disabled={submitting}
              options={players.map((player) => ({
                value: player.playerId,
                label: `${player.currentWrestler || player.name} (${player.name})`,
              }))}
            />
          )}
        </div>

        <label className="group-field">
          <span className="group-field__label">{t('factions.invite.messageLabel', 'Message (optional)')}</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t('factions.invite.messagePlaceholder', 'Add a personal message...')}
            disabled={submitting}
            rows={3}
            maxLength={200}
          />
        </label>

        {error && <p className="group-error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}
