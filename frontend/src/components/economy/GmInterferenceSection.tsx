import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { TriangleAlert } from 'lucide-react';
import {
  GM_INTERFERENCE_REQUEST_MAX_LENGTH,
  shopApi,
  type PlayerGmInterferenceRequest,
} from '../../services/api/shop.api';
import type { Match } from '../../types';
import { formatInstant } from '../../utils/dateUtils';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Modal from '../ui/Modal';
import Select from '../ui/Select';
import { useToast } from '../ui/toastContext';
import { GM_STATUS_TONES } from './economyDisplay';
import { economyErrorMessage } from './economyErrors';
import type { ShopBlockReason } from './shopItems';

interface GmInterferenceSectionProps {
  price: number;
  blockReason: ShopBlockReason | null;
  requests: PlayerGmInterferenceRequest[];
  /** The player's scheduled matches; a request may point at one. */
  matches: Match[];
  describeMatch: (match: Match) => string;
  formatAmount: (amount: number) => string;
  onRequested: () => Promise<void> | void;
}

/** GM interference (ECO-14): the request form and the player's own requests. */
export default function GmInterferenceSection({
  price,
  blockReason,
  requests,
  matches,
  describeMatch,
  formatAmount,
  onRequested,
}: GmInterferenceSectionProps) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const textId = useId();
  const hintId = `${textId}-hint`;

  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [matchId, setMatchId] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openForm = () => {
    setText('');
    setMatchId('');
    setUnderstood(false);
    setError(null);
    setOpen(true);
  };

  const close = () => {
    if (!busy) setOpen(false);
  };

  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && trimmed.length <= GM_INTERFERENCE_REQUEST_MAX_LENGTH && understood;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSend) return;
    setBusy(true);
    setError(null);
    try {
      const result = await shopApi.requestGmInterference({ request: trimmed, ...(matchId && { matchId }) });
      showToast(t('economyShop.gm.sent', { balance: formatAmount(result.balance) }), 'success');
      setOpen(false);
      await onRequested();
    } catch (err) {
      setError(economyErrorMessage(err, t, t('economyShop.gm.sendFailed')));
    } finally {
      setBusy(false);
    }
  };

  const matchById = new Map(matches.map((match) => [match.matchId, match]));
  const matchOptions = [
    { value: '', label: t('economyShop.gm.noMatch') },
    ...matches.map((match) => ({ value: match.matchId, label: describeMatch(match) })),
  ];

  return (
    <section className="shop-gm" aria-labelledby={`${textId}-heading`}>
      <Card className="shop-gm__card">
        <div className="shop-item__head">
          <h2 id={`${textId}-heading`} className="shop-item__name">{t('economyShop.items.gmInterference.name')}</h2>
        </div>
        <p className="shop-item__price">{formatAmount(price)}</p>
        <p className="shop-item__effect">{t('economyShop.items.gmInterference.effect')}</p>
        <p className="shop-gm__warning">
          <TriangleAlert aria-hidden="true" size={18} />
          {t('economyShop.gm.warning')}
        </p>
        {blockReason && <p className="shop-item__reason">{t(`economyShop.blocked.${blockReason}`)}</p>}
        <Button size="sm" disabled={blockReason !== null} onClick={openForm}>
          {t('economyShop.gm.open')}
        </Button>
      </Card>

      <h2 className="shop-gm__heading">{t('economyShop.gm.myRequests')}</h2>
      {requests.length === 0 ? (
        <p className="shop-gm__muted">{t('economyShop.gm.noRequests')}</p>
      ) : (
        <ul className="shop-gm__list">
          {requests.map((request) => {
            const linked = request.matchId ? matchById.get(request.matchId) : undefined;
            return (
              <li key={request.requestId} className="shop-gm__request">
                <div className="shop-gm__request-head">
                  <Badge tone={GM_STATUS_TONES[request.status]}>{t(`economyShop.gm.status.${request.status}`)}</Badge>
                  <span className="shop-gm__muted">
                    {formatInstant(request.createdAt, i18n.language)} · {formatAmount(request.price)}
                  </span>
                </div>
                <p className="shop-gm__text">{request.request}</p>
                {linked && <p className="shop-gm__muted">{t('economyShop.gm.linkedMatch', { match: describeMatch(linked) })}</p>}
                {request.status !== 'pending' && (
                  <p className="shop-gm__outcome">{t(`economyShop.gm.outcome.${request.status}`)}</p>
                )}
                {request.publicNote && (
                  <p className="shop-gm__note">{t('economyShop.gm.gmNote', { note: request.publicNote })}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={open} onClose={close} title={t('economyShop.gm.formTitle')}>
        <form className="shop-gm__form" onSubmit={submit}>
          <p className="shop-gm__warning shop-gm__warning--big" role="note">
            <TriangleAlert aria-hidden="true" size={22} />
            {t('economyShop.gm.warning')}
          </p>
          {error && <p className="shop-confirm__error" role="alert">{error}</p>}
          <div className="shop-field">
            <label className="shop-field__label" htmlFor={textId}>{t('economyShop.gm.requestLabel')}</label>
            <textarea
              id={textId}
              className="shop-field__input"
              rows={4}
              maxLength={GM_INTERFERENCE_REQUEST_MAX_LENGTH}
              aria-describedby={hintId}
              value={text}
              disabled={busy}
              onChange={(event) => setText(event.target.value)}
            />
            <p id={hintId} className="shop-field__hint">
              {t('economyShop.gm.requestHint', { length: trimmed.length, max: GM_INTERFERENCE_REQUEST_MAX_LENGTH })}
            </p>
          </div>
          {matches.length > 0 && (
            <Select
              label={t('economyShop.gm.matchLabel')}
              value={matchId}
              onValueChange={setMatchId}
              options={matchOptions}
              disabled={busy}
            />
          )}
          <label className="shop-field__check">
            <input
              type="checkbox"
              checked={understood}
              disabled={busy}
              onChange={(event) => setUnderstood(event.target.checked)}
            />
            {t('economyShop.gm.understand')}
          </label>
          <div className="shop-gm__actions">
            <Button variant="ghost" onClick={close} disabled={busy}>{t('common.cancel', 'Cancel')}</Button>
            <Button type="submit" variant="danger" loading={busy} disabled={!canSend}>
              {t('economyShop.gm.pay', { price: formatAmount(price) })}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
