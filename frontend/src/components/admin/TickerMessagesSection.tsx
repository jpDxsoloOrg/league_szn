import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Rss } from 'lucide-react';
import { tickerMessagesApi } from '../../services/api';
import { TICKER_TEXT_MAX_LENGTH } from '../../services/api/tickerMessages.api';
import type { TickerMessage } from '../../types';
import Badge from '../ui/Badge';
import type { BadgeTone } from '../ui/Badge';
import Button from '../ui/Button';
import DataTable from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import Skeleton from '../ui/Skeleton';
import AdminFormModal from './AdminFormModal';
import AdminNotice from './AdminNotice';
import useAdminConfirm from './useAdminConfirm';
import {
  DEFAULT_TICKER_DURATION_MS,
  expireNowPatch,
  fromLocalInputValue,
  getTickerMessageStatus,
  toLocalInputValue,
  type TickerMessageStatus,
} from './tickerMessageForm';
import './TickerMessagesSection.css';

const STATUS_TONES: Record<TickerMessageStatus, BadgeTone> = {
  live: 'win',
  scheduled: 'primary',
  expired: 'warning',
};

interface TickerForm {
  text: string;
  href: string;
  pinned: boolean;
  startsAt: string;
  expiresAt: string;
}

function newForm(): TickerForm {
  const now = new Date();
  return {
    text: '',
    href: '',
    pinned: false,
    startsAt: toLocalInputValue(now.toISOString()),
    expiresAt: toLocalInputValue(new Date(now.getTime() + DEFAULT_TICKER_DURATION_MS).toISOString()),
  };
}

/** The "Ticker" section of Manage Announcements: GM messages for the league ticker. */
export default function TickerMessagesSection() {
  const { t } = useTranslation();
  const { confirm, confirmDialog } = useAdminConfirm();
  const [messages, setMessages] = useState<TickerMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TickerMessage | null>(null);
  const [formData, setFormData] = useState<TickerForm>(newForm);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadMessages = useCallback(async (signal?: AbortSignal) => {
    try {
      setMessages(await tickerMessagesApi.getAll(signal));
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : t('announcements.ticker.loadError'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    void loadMessages(controller.signal);
    return () => controller.abort();
  }, [loadMessages]);

  const openCreate = () => {
    setEditing(null);
    setFormData(newForm());
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (message: TickerMessage) => {
    setEditing(message);
    setFormData({
      text: message.text,
      href: message.href ?? '',
      pinned: message.pinned,
      startsAt: toLocalInputValue(message.startsAt),
      expiresAt: toLocalInputValue(message.expiresAt),
    });
    setFormError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setFormError(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setFormError(null);

    const text = formData.text.trim();
    if (!text) {
      setFormError(t('announcements.ticker.textRequired'));
      return;
    }
    if (!formData.startsAt || !formData.expiresAt) {
      setFormError(t('announcements.ticker.datesRequired'));
      return;
    }
    const startsAt = fromLocalInputValue(formData.startsAt);
    const expiresAt = fromLocalInputValue(formData.expiresAt);
    if (expiresAt <= startsAt) {
      setFormError(t('announcements.ticker.expiryAfterStart'));
      return;
    }

    const href = formData.href.trim();
    setSaving(true);
    try {
      if (editing) {
        await tickerMessagesApi.update(editing.messageId, {
          text,
          href: href || null,
          pinned: formData.pinned,
          startsAt,
          expiresAt,
        });
        setSuccess(t('announcements.ticker.updateSuccess'));
      } else {
        await tickerMessagesApi.create({ text, href: href || undefined, pinned: formData.pinned, startsAt, expiresAt });
        setSuccess(t('announcements.ticker.createSuccess'));
      }
      closeForm();
      await loadMessages();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('announcements.ticker.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleExpireNow = async (message: TickerMessage) => {
    setBusyId(message.messageId);
    setError(null);
    setSuccess(null);
    try {
      await tickerMessagesApi.update(message.messageId, expireNowPatch(message));
      setSuccess(t('announcements.ticker.expireSuccess'));
      await loadMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('announcements.ticker.saveError'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (message: TickerMessage) => {
    const confirmed = await confirm({ title: t('announcements.ticker.confirmDelete'), confirmLabel: t('common.delete') });
    if (!confirmed) return;

    setBusyId(message.messageId);
    setError(null);
    setSuccess(null);
    try {
      await tickerMessagesApi.delete(message.messageId);
      setSuccess(t('announcements.ticker.deleteSuccess'));
      await loadMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('announcements.ticker.deleteError'));
    } finally {
      setBusyId(null);
    }
  };

  const sectionTitle = t('announcements.ticker.title');

  return (
    <section className="ac-section ticker-messages">
      <div className="ticker-messages__header">
        <h2 className="ac-section__title">{sectionTitle} ({messages.length})</h2>
        <Button size="sm" icon={<Plus aria-hidden="true" size={16} />} onClick={openCreate}>
          {t('announcements.ticker.create')}
        </Button>
      </div>
      <p className="ac-section__text">{t('announcements.ticker.description')}</p>

      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      {success && <AdminNotice tone="success">{success}</AdminNotice>}

      {loading ? (
        <Skeleton variant="table" />
      ) : (
        <DataTable
          caption={sectionTitle}
          density="dense"
          rows={messages}
          rowKey={(message) => message.messageId}
          empty={<EmptyState icon={<Rss aria-hidden="true" size={32} />} title={t('announcements.ticker.empty')} />}
          columns={[
            {
              key: 'text',
              header: t('announcements.ticker.fields.text'),
              render: (message) => (
                <span className="ac-cell__title">
                  {message.pinned && <Badge tone="primary">{t('announcements.ticker.pinned')}</Badge>} {message.text}
                </span>
              ),
              sortValue: (message) => message.text,
            },
            {
              key: 'status',
              header: t('adminContent.status', 'Status'),
              render: (message) => {
                const status = getTickerMessageStatus(message);
                return <Badge tone={STATUS_TONES[status]}>{t(`announcements.ticker.status.${status}`)}</Badge>;
              },
            },
            {
              key: 'startsAt',
              header: t('announcements.ticker.fields.startsAt'),
              render: (message) => new Date(message.startsAt).toLocaleString(),
              sortValue: (message) => message.startsAt,
              hideOnMobile: true,
            },
            {
              key: 'expiresAt',
              header: t('announcements.ticker.fields.expiresAt'),
              render: (message) => new Date(message.expiresAt).toLocaleString(),
              sortValue: (message) => message.expiresAt,
            },
            {
              key: 'actions',
              header: t('common.actions'),
              align: 'end',
              render: (message) => (
                <div className="ac-actions ac-actions--end">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(message)}>{t('common.edit')}</Button>
                  {getTickerMessageStatus(message) !== 'expired' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={busyId === message.messageId}
                      onClick={() => handleExpireNow(message)}
                    >
                      {t('announcements.ticker.expireNow')}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={busyId === message.messageId}
                    onClick={() => handleDelete(message)}
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              ),
            },
          ]}
        />
      )}

      <AdminFormModal
        open={showForm}
        onClose={closeForm}
        title={editing ? t('announcements.ticker.edit') : t('announcements.ticker.create')}
        submitLabel={editing ? t('announcements.ticker.save') : t('announcements.ticker.create')}
        onSubmit={handleSubmit}
        busy={saving}
        error={formError}
      >
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="ticker-text">{t('announcements.ticker.fields.text')}</label>
          <input
            type="text"
            id="ticker-text"
            value={formData.text}
            maxLength={TICKER_TEXT_MAX_LENGTH}
            onChange={(event) => setFormData({ ...formData, text: event.target.value })}
            required
            placeholder={t('announcements.ticker.fields.textPlaceholder')}
          />
          <span className="ac-field__hint">
            {t('announcements.ticker.charCount', { count: formData.text.length, max: TICKER_TEXT_MAX_LENGTH })}
          </span>
        </div>
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="ticker-href">{t('announcements.ticker.fields.href')}</label>
          <input
            type="text"
            id="ticker-href"
            value={formData.href}
            onChange={(event) => setFormData({ ...formData, href: event.target.value })}
            placeholder={t('announcements.ticker.fields.hrefPlaceholder')}
          />
        </div>
        <div className="ac-form__row">
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="ticker-starts">{t('announcements.ticker.fields.startsAt')}</label>
            <input
              type="datetime-local"
              id="ticker-starts"
              value={formData.startsAt}
              onChange={(event) => setFormData({ ...formData, startsAt: event.target.value })}
              required
            />
          </div>
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="ticker-expires">{t('announcements.ticker.fields.expiresAt')}</label>
            <input
              type="datetime-local"
              id="ticker-expires"
              value={formData.expiresAt}
              onChange={(event) => setFormData({ ...formData, expiresAt: event.target.value })}
              required
            />
          </div>
        </div>
        <label className="ac-check">
          <input
            type="checkbox"
            checked={formData.pinned}
            onChange={(event) => setFormData({ ...formData, pinned: event.target.checked })}
          />
          {t('announcements.ticker.fields.pinned')}
        </label>
      </AdminFormModal>

      {confirmDialog}
    </section>
  );
}
