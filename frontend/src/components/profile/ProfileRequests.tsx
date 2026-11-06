import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { playersApi, storylineRequestsApi, transfersApi } from '../../services/api';
import Badge from '../ui/Badge';
import type { BadgeTone } from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Select from '../ui/Select';
import type {
  Division,
  MyStorylineRequest,
  Player,
  StorylineRequestType,
  TransferRequestWithDetails,
} from '../../types';

const STATUS_TONES: Record<string, BadgeTone> = {
  pending: 'warning',
  approved: 'win',
  acknowledged: 'win',
  rejected: 'loss',
  declined: 'loss',
};

const REQUEST_TYPE_KEYS: Record<StorylineRequestType, string> = {
  storyline: 'me.requests.typeStoryline',
  backstage_attack: 'me.requests.typeBackstageAttack',
  rivalry: 'me.requests.typeRivalry',
};

const MAX_DESCRIPTION_LENGTH = 500;

interface ProfileRequestsProps {
  player: Player;
  divisions: Division[];
}

/** Division transfers and storyline pitches, with the history of each. */
export default function ProfileRequests({ player, divisions }: ProfileRequestsProps) {
  const { t } = useTranslation();

  const [transfers, setTransfers] = useState<TransferRequestWithDetails[]>([]);
  const [transferForm, setTransferForm] = useState({ toDivisionId: '', reason: '' });
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);

  const [storylines, setStorylines] = useState<MyStorylineRequest[]>([]);
  const [otherPlayers, setOtherPlayers] = useState<Player[]>([]);
  const [storylineForm, setStorylineForm] = useState<{
    requestType: StorylineRequestType;
    targetPlayerIds: string[];
    description: string;
  }>({ requestType: 'storyline', targetPlayerIds: [], description: '' });
  const [storylineSubmitting, setStorylineSubmitting] = useState(false);
  const [storylineError, setStorylineError] = useState<string | null>(null);
  const [storylineSuccess, setStorylineSuccess] = useState<string | null>(null);

  const loadTransfers = useCallback(async () => {
    try {
      setTransfers(await transfersApi.getMyRequests());
    } catch {
      // History is optional here; the request form still works without it.
    }
  }, []);

  const loadStorylines = useCallback(async () => {
    try {
      setStorylines(await storylineRequestsApi.getMine());
    } catch {
      // History is optional here; the request form still works without it.
    }
  }, []);

  useEffect(() => {
    const loadPlayers = async () => {
      try {
        const players = await playersApi.getAll();
        setOtherPlayers(players.filter((other) => other.playerId !== player.playerId));
      } catch {
        // The target list stays empty and says so.
      }
    };
    void loadTransfers();
    void loadStorylines();
    void loadPlayers();
  }, [loadTransfers, loadStorylines, player.playerId]);

  const handleTransferSubmit = async () => {
    if (!transferForm.toDivisionId || !transferForm.reason.trim()) return;
    try {
      setTransferSubmitting(true);
      setTransferError(null);
      setTransferSuccess(null);
      await transfersApi.createRequest({
        toDivisionId: transferForm.toDivisionId,
        reason: transferForm.reason.trim(),
      });
      setTransferForm({ toDivisionId: '', reason: '' });
      setTransferSuccess(t('me.requests.transferSubmitted'));
      await loadTransfers();
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : t('me.requests.transferFailed'));
    } finally {
      setTransferSubmitting(false);
    }
  };

  const handleStorylineSubmit = async () => {
    if (storylineForm.targetPlayerIds.length === 0 || !storylineForm.description.trim()) return;
    try {
      setStorylineSubmitting(true);
      setStorylineError(null);
      setStorylineSuccess(null);
      await storylineRequestsApi.create({
        requestType: storylineForm.requestType,
        targetPlayerIds: storylineForm.targetPlayerIds,
        description: storylineForm.description.trim(),
      });
      setStorylineForm({ requestType: 'storyline', targetPlayerIds: [], description: '' });
      setStorylineSuccess(t('me.requests.storylineSubmitted'));
      await loadStorylines();
    } catch (err) {
      setStorylineError(err instanceof Error ? err.message : t('me.requests.storylineFailed'));
    } finally {
      setStorylineSubmitting(false);
    }
  };

  const toggleTarget = (playerId: string) => {
    setStorylineForm((prev) => ({
      ...prev,
      targetPlayerIds: prev.targetPlayerIds.includes(playerId)
        ? prev.targetPlayerIds.filter((id) => id !== playerId)
        : [...prev.targetPlayerIds, playerId],
    }));
  };

  const statusLabel = (status: string) => t(`me.requests.status.${status}`, { defaultValue: status });
  const pendingTransfer = transfers.find((request) => request.status === 'pending');
  const availableDivisions = divisions.filter((division) => division.divisionId !== player.divisionId);

  return (
    <>
      {player.divisionId && (
        <section className="profile-section" aria-labelledby="profile-transfer-title">
          <h2 className="profile-section__title" id="profile-transfer-title">{t('me.requests.transferTitle')}</h2>
          <Card>
            {transferError && <p className="me-alert me-alert--error" role="alert">{transferError}</p>}
            {transferSuccess && <p className="me-alert me-alert--success" role="status">{transferSuccess}</p>}
            {pendingTransfer ? (
              <p className="me-hint">
                {t('me.requests.transferPending', {
                  division: pendingTransfer.toDivisionName,
                  date: new Date(pendingTransfer.createdAt).toLocaleDateString(),
                })}
              </p>
            ) : (
              <>
                <div className="me-field">
                  <span className="me-field__label">{t('me.requests.transferChoose')}</span>
                  <Select
                    id="transfer-division"
                    label={t('me.requests.transferChoose')}
                    placeholder={t('me.requests.transferChoose')}
                    value={transferForm.toDivisionId}
                    onValueChange={(toDivisionId) => setTransferForm((prev) => ({ ...prev, toDivisionId }))}
                    options={availableDivisions.map((division) => ({ value: division.divisionId, label: division.name }))}
                  />
                </div>
                {transferForm.toDivisionId && (
                  <>
                    <div className="me-field">
                      <label htmlFor="transfer-reason">{t('me.requests.transferReason')}</label>
                      <textarea
                        id="transfer-reason"
                        value={transferForm.reason}
                        onChange={(e) => setTransferForm((prev) => ({ ...prev, reason: e.target.value }))}
                        placeholder={t('me.requests.transferReasonPlaceholder')}
                        rows={3}
                      />
                    </div>
                    <Button
                      loading={transferSubmitting}
                      disabled={!transferForm.reason.trim()}
                      onClick={() => void handleTransferSubmit()}
                    >
                      {transferSubmitting ? t('common.submitting') : t('me.requests.transferSubmit')}
                    </Button>
                  </>
                )}
              </>
            )}
          </Card>
        </section>
      )}

      {transfers.length > 0 && (
        <section className="profile-section" aria-labelledby="profile-transfer-history-title">
          <h2 className="profile-section__title" id="profile-transfer-history-title">{t('me.requests.transferHistory')}</h2>
          <Card padding="none">
            <ul className="profile-rows">
              {transfers.map((request) => (
                <li key={request.requestId} className="profile-row profile-row--stacked">
                  <span className="profile-row__main">
                    {request.fromDivisionName} → {request.toDivisionName}
                    <Badge tone={STATUS_TONES[request.status] ?? 'neutral'}>{statusLabel(request.status)}</Badge>
                  </span>
                  <span className="profile-row__meta">{new Date(request.updatedAt).toLocaleDateString()}</span>
                  {request.status === 'rejected' && request.reviewNote && (
                    <p className="profile-row__note">{t('me.requests.rejectedReason', { note: request.reviewNote })}</p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <section className="profile-section" aria-labelledby="profile-storyline-title">
        <h2 className="profile-section__title" id="profile-storyline-title">{t('me.requests.storylineTitle')}</h2>
        <Card>
          <p className="me-hint profile-section__intro">{t('me.requests.storylineHint')}</p>
          {storylineError && <p className="me-alert me-alert--error" role="alert">{storylineError}</p>}
          {storylineSuccess && <p className="me-alert me-alert--success" role="status">{storylineSuccess}</p>}

          <div className="me-field">
            <span className="me-field__label">{t('me.requests.requestType')}</span>
            <Select
              id="storyline-type"
              label={t('me.requests.requestType')}
              value={storylineForm.requestType}
              onValueChange={(requestType) =>
                setStorylineForm((prev) => ({ ...prev, requestType: requestType as StorylineRequestType }))
              }
              options={(Object.keys(REQUEST_TYPE_KEYS) as StorylineRequestType[]).map((type) => ({
                value: type,
                label: t(REQUEST_TYPE_KEYS[type]),
              }))}
            />
          </div>

          <fieldset className="profile-targets">
            <legend className="me-field__label">{t('me.requests.targets')}</legend>
            {otherPlayers.length === 0 ? (
              <p className="me-hint">{t('me.requests.noTargets')}</p>
            ) : (
              <div className="profile-targets__list">
                {otherPlayers.map((other) => (
                  <label key={other.playerId} className="profile-targets__option">
                    <input
                      type="checkbox"
                      checked={storylineForm.targetPlayerIds.includes(other.playerId)}
                      onChange={() => toggleTarget(other.playerId)}
                    />
                    <span>{other.name} ({other.currentWrestler})</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <div className="me-field">
            <label htmlFor="storyline-description">{t('me.requests.description')}</label>
            <textarea
              id="storyline-description"
              value={storylineForm.description}
              onChange={(e) => setStorylineForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder={t('me.requests.descriptionPlaceholder')}
              rows={4}
              maxLength={MAX_DESCRIPTION_LENGTH}
            />
            <p className="me-hint">{storylineForm.description.length}/{MAX_DESCRIPTION_LENGTH}</p>
          </div>

          <Button
            loading={storylineSubmitting}
            disabled={storylineForm.targetPlayerIds.length === 0 || !storylineForm.description.trim()}
            onClick={() => void handleStorylineSubmit()}
          >
            {storylineSubmitting ? t('common.submitting') : t('me.requests.storylineSubmit')}
          </Button>
        </Card>
      </section>

      {storylines.length > 0 && (
        <section className="profile-section" aria-labelledby="profile-storyline-history-title">
          <h2 className="profile-section__title" id="profile-storyline-history-title">{t('me.requests.myRequests')}</h2>
          <Card padding="none">
            <ul className="profile-rows">
              {storylines.map((request) => (
                <li key={request.requestId} className="profile-row profile-row--stacked">
                  <span className="profile-row__main">
                    {t(REQUEST_TYPE_KEYS[request.requestType])}
                    <Badge tone={STATUS_TONES[request.status] ?? 'neutral'}>{statusLabel(request.status)}</Badge>
                  </span>
                  <span className="profile-row__meta">
                    {t('me.requests.versus', { names: request.targetPlayerNames.join(', ') })}
                    {' · '}
                    {new Date(request.createdAt).toLocaleDateString()}
                  </span>
                  <p className="profile-row__note">{request.description}</p>
                  {request.status === 'declined' && request.gmNote && (
                    <p className="profile-row__note">{t('me.requests.gmNote', { note: request.gmNote })}</p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </>
  );
}
