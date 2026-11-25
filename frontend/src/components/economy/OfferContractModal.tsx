import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { contractsApi, type Contract, type ContractOfferError, type ContractType } from '../../services/api/contracts.api';
import { economyApi, ECONOMY_CONTRACT_TYPES, type EconomySettings } from '../../services/api/economy.api';
import { seasonsApi } from '../../services/api/seasons.api';
import { ApiError } from '../../services/api/apiClient';
import type { Season } from '../../types';
import { formatInstant } from '../../utils/dateUtils';
import AdminFormModal from '../admin/AdminFormModal';
import AdminNotice from '../admin/AdminNotice';
import SearchableSelect from '../admin/SearchableSelect';
import Skeleton from '../ui/Skeleton';
import {
  findOfferProblem,
  offerExpiryDate,
  offerFormFor,
  OFFER_NOTE_MAX_LENGTH,
  toOfferRequest,
  type OfferForm,
} from './offerForm';
import './OfferContractModal.css';

export interface OfferCandidate {
  playerId: string;
  label: string;
  /** A player without an account could not answer, so the server refuses the offer. */
  hasLinkedAccount?: boolean;
  /** Extra line in the picker, e.g. that the player is under contract. */
  hint?: string;
}

export interface OfferContractModalProps {
  open: boolean;
  onClose: () => void;
  /** Players the GM can pick from. Ignored when `player` is set. */
  candidates?: OfferCandidate[];
  /** Offer to this player only; no picker is shown. */
  player?: OfferCandidate;
  onOffered: (contract: Contract, player: OfferCandidate) => void;
}

interface OfferContext {
  settings: EconomySettings;
  activeSeason: Season | undefined;
}

type PayField = 'perMatchPay' | 'weeklySalary' | 'winBonus';

const PAY_FIELDS: { field: PayField; fallback: string }[] = [
  { field: 'perMatchPay', fallback: 'Pay per match' },
  { field: 'weeklySalary', fallback: 'Weekly salary' },
  { field: 'winBonus', fallback: 'Win bonus' },
];

function serverOfferMessage(err: unknown, t: TFunction): string {
  if (err instanceof ApiError) {
    const errors = err.details['errors'];
    if (Array.isArray(errors) && errors.length > 0) {
      return (errors as ContractOfferError[])
        .map((error) => t(`contracts.offer.serverErrors.${error.code}`, error.message))
        .join(' ');
    }
    return err.message;
  }
  return err instanceof Error ? err.message : t('contracts.offer.failed', 'Failed to send the offer');
}

function parseWhole(value: string): number {
  return value === '' ? Number.NaN : Number(value);
}

/**
 * Offer composer (ECO-12): pick a type and the pay terms start from that
 * type's economy defaults; the GM can change pay, salary, bonus and length.
 */
export default function OfferContractModal({ open, onClose, candidates = [], player, onOffered }: OfferContractModalProps) {
  const { t, i18n } = useTranslation();
  const [context, setContext] = useState<OfferContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState(player?.playerId ?? '');
  const [form, setForm] = useState<OfferForm | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    setPlayerId(player?.playerId ?? '');
    setSubmitError(null);
    setLoadError(null);
    const controller = new AbortController();
    const load = async () => {
      try {
        const [{ settings }, seasons] = await Promise.all([
          economyApi.getConfig(controller.signal),
          seasonsApi.getAll(controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setContext({ settings, activeSeason: seasons.find((season) => season.status === 'active') });
        setForm(offerFormFor('season', settings));
      } catch (err) {
        if (controller.signal.aborted) return;
        setLoadError(err instanceof Error ? err.message : t('contracts.offer.loadFailed', 'Could not load the contract defaults.'));
      }
    };
    void load();
    return () => controller.abort();
  }, [open, player?.playerId, t]);

  const options = useMemo(
    () => candidates.map((candidate) => ({
      value: candidate.playerId,
      label: candidate.label,
      disabled: candidate.hasLinkedAccount === false,
      hint: candidate.hasLinkedAccount === false ? t('contracts.offer.noAccount', 'No linked account') : candidate.hint,
    })),
    [candidates, t],
  );

  const target = player ?? candidates.find((candidate) => candidate.playerId === playerId);
  const activeSeasonId = context?.activeSeason?.seasonId;
  const problem = form ? findOfferProblem(form, activeSeasonId) : null;

  const changeType = (type: ContractType) => {
    if (!context || !form) return;
    setForm(offerFormFor(type, context.settings, form.note));
  };

  const updateForm = (patch: Partial<OfferForm>) => {
    setForm((current) => (current ? { ...current, ...patch } : current));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form || !target || problem) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const contract = await contractsApi.offer(toOfferRequest(target.playerId, form, activeSeasonId));
      onOffered(contract, target);
    } catch (err) {
      setSubmitError(serverOfferMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  const symbol = context?.settings.currencySymbol ?? '';
  const title = player
    ? t('contracts.offer.titleFor', { defaultValue: 'Offer a contract to {{name}}', name: player.label })
    : t('contracts.offer.title', 'Offer a contract');

  return (
    <AdminFormModal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      className="am-sheet"
      submitLabel={t('contracts.offer.submit', 'Send offer')}
      onSubmit={handleSubmit}
      busy={submitting}
      submitDisabled={!form || !target || problem !== null}
      error={submitError}
    >
      {loadError && <AdminNotice tone="error">{loadError}</AdminNotice>}
      {!loadError && (!context || !form) && <Skeleton variant="block" />}
      {context && form && (
        <>
          {!player && (
            <div className="ac-field">
              <label className="ac-field__label" htmlFor="offer-player">{t('contracts.offer.player', 'Player')}</label>
              <SearchableSelect
                id="offer-player"
                options={options}
                value={playerId}
                onChange={setPlayerId}
                placeholder={t('contracts.offer.pickPlayer', 'Pick a player')}
              />
            </div>
          )}

          <fieldset className="offer-types">
            <legend className="ac-field__label">{t('contracts.offer.type', 'Contract type')}</legend>
            <div className="ac-choice-group">
              {ECONOMY_CONTRACT_TYPES.map((type) => (
                <label key={type} className="ac-check">
                  <input
                    type="radio"
                    name="offer-type"
                    value={type}
                    checked={form.type === type}
                    onChange={() => changeType(type)}
                  />
                  {t(`contracts.types.${type}`, type)}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="ac-form__row">
            {form.type === 'season' ? (
              <div className="ac-field">
                <span className="ac-field__label">{t('contracts.offer.season', 'Season')}</span>
                <p className="offer-static">
                  {context.activeSeason?.name ?? t('contracts.offer.noSeason', 'No active season')}
                </p>
              </div>
            ) : (
              <div className="ac-field">
                <label className="ac-field__label" htmlFor="offer-matches">{t('contracts.offer.matchesTotal', 'Length (matches)')}</label>
                <input
                  id="offer-matches"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={Number.isNaN(form.matchesTotal) ? '' : form.matchesTotal}
                  onChange={(event) => updateForm({ matchesTotal: parseWhole(event.target.value) })}
                />
              </div>
            )}
            {PAY_FIELDS.map(({ field, fallback }) => {
              const lockedSalary = field === 'weeklySalary' && form.type === 'tryout';
              return (
                <div key={field} className="ac-field">
                  <label className="ac-field__label" htmlFor={`offer-${field}`}>
                    {t(`contracts.offer.${field}`, fallback)}{symbol ? ` (${symbol})` : ''}
                  </label>
                  <input
                    id={`offer-${field}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    disabled={lockedSalary}
                    value={Number.isNaN(form[field]) ? '' : form[field]}
                    onChange={(event) => updateForm({ [field]: parseWhole(event.target.value) })}
                  />
                  {lockedSalary && (
                    <p className="ac-field__hint">{t('contracts.offer.tryoutSalaryHint', 'Tryouts pay per match only.')}</p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="ac-field">
            <label className="ac-field__label" htmlFor="offer-note">{t('contracts.offer.note', 'Note to the player (optional)')}</label>
            <textarea
              id="offer-note"
              rows={2}
              maxLength={OFFER_NOTE_MAX_LENGTH}
              value={form.note}
              onChange={(event) => updateForm({ note: event.target.value })}
            />
          </div>

          <p className="offer-expiry">
            {t('contracts.offer.expires', {
              defaultValue: 'If the player doesn\'t answer, the offer expires on {{date}}.',
              date: formatInstant(offerExpiryDate(context.settings).toISOString(), i18n.language),
            })}
          </p>

          {problem && (
            <AdminNotice tone="warning">{t(`contracts.offer.problems.${problem}`)}</AdminNotice>
          )}
        </>
      )}
    </AdminFormModal>
  );
}
