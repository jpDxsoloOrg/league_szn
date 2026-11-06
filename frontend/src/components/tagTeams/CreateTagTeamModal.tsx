import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { tagTeamsApi, playersApi, profileApi } from '../../services/api';
import type { Player } from '../../types';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Select from '../ui/Select';
import { useToast } from '../ui/toastContext';
import '../factions/groupUi.css';

const FORM_ID = 'create-tag-team-form';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateTagTeamModal({ isOpen, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();
    setLoadingPlayers(true);
    setName('');
    setPartnerId('');
    setImageUrl('');
    setError(null);

    const loadPlayers = async () => {
      try {
        const [allPlayers, myProfile] = await Promise.all([
          playersApi.getAll(controller.signal),
          profileApi.getMyProfile(controller.signal),
        ]);
        // Leave out the caller and anyone already on a team.
        setPlayers(allPlayers.filter((player) => player.playerId !== myProfile.playerId && !player.tagTeamId));
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(t('tagTeams.create.loadPlayersFailed', 'Failed to load players'));
        }
      } finally {
        if (!controller.signal.aborted) setLoadingPlayers(false);
      }
    };

    loadPlayers();
    return () => controller.abort();
  }, [isOpen, t]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
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
      showToast(t('tagTeams.create.success', 'Tag team request sent to partner!'), 'success');
      onCreated();
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
      title={t('tagTeams.create.title', 'Create a Tag Team')}
      onClose={() => { if (!submitting) onClose(); }}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="submit" form={FORM_ID} loading={submitting} disabled={loadingPlayers || players.length === 0}>
            {submitting ? t('common.submitting', 'Submitting...') : t('tagTeams.create.submit', 'Send Request')}
          </Button>
        </>
      )}
    >
      <form id={FORM_ID} className="group-form" onSubmit={handleSubmit}>
        <label className="group-field">
          <span className="group-field__label">{t('tagTeams.create.nameLabel', 'Tag Team Name')}</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('tagTeams.create.namePlaceholder', 'e.g. The Hardy Boyz, DX')}
            disabled={submitting}
            maxLength={50}
          />
        </label>

        <div className="group-field">
          <span className="group-field__label">{t('tagTeams.create.partnerLabel', 'Select Partner')}</span>
          {loadingPlayers ? (
            <p className="group-empty">{t('common.loading', 'Loading...')}</p>
          ) : players.length === 0 ? (
            <p className="group-empty">{t('tagTeams.create.noAvailablePlayers', 'No available players')}</p>
          ) : (
            <Select
              label={t('tagTeams.create.partnerLabel', 'Select Partner')}
              placeholder={t('tagTeams.create.selectPartner', '-- Select a partner --')}
              value={partnerId}
              onValueChange={setPartnerId}
              disabled={submitting}
              options={players.map((player) => ({
                value: player.playerId,
                label: `${player.currentWrestler || player.name} (${player.name})`,
              }))}
            />
          )}
        </div>

        <label className="group-field">
          <span className="group-field__label">{t('tagTeams.create.imageLabel', 'Image URL (optional)')}</span>
          <input
            type="url"
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
            placeholder={t('tagTeams.create.imagePlaceholder', 'https://...')}
            disabled={submitting}
          />
        </label>

        {error && <p className="group-error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}
