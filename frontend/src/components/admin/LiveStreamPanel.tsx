import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Radio, Save, Square } from 'lucide-react';
import { LIVE_STREAM_MAX_HOURS, LIVE_STREAM_TITLE_MAX_LENGTH, liveStreamApi } from '../../services/api';
import type { LiveStream, LiveStreamPatch } from '../../types';
import { isTwitchChannel } from '../../utils/twitch';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Skeleton from '../ui/Skeleton';
import AdminNotice from './AdminNotice';
import './adminContent.css';
import './LiveStreamPanel.css';

const HOUR_MS = 60 * 60 * 1000;

function formatTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

/**
 * GM switch for the Dashboard's Twitch card. There is no Twitch API: staff
 * mark the stream live by hand, and the backend treats it as offline once it
 * has been on for LIVE_STREAM_MAX_HOURS.
 */
export default function LiveStreamPanel() {
  const { t, i18n } = useTranslation();
  const [stream, setStream] = useState<LiveStream | null>(null);
  const [channel, setChannel] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isLive = stream?.isLive ?? false;
  const liveSince = isLive ? stream?.liveSince : undefined;
  const autoOffAt = liveSince ? new Date(new Date(liveSince).getTime() + LIVE_STREAM_MAX_HOURS * HOUR_MS).toISOString() : undefined;

  const applyStream = (data: LiveStream) => {
    setStream(data);
    setChannel(data.channel ?? '');
    setTitle(data.title ?? '');
  };

  const loadStream = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await liveStreamApi.get(signal);
      if (!signal?.aborted) applyStream(data);
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : t('liveStream.admin.loadError'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    void loadStream(controller.signal);
    return () => controller.abort();
  }, [loadStream]);

  const validate = (goingLive: boolean): string | null => {
    const trimmed = channel.trim();
    if (trimmed && !isTwitchChannel(trimmed)) return t('liveStream.admin.invalidChannel');
    if (goingLive && !trimmed) return t('liveStream.admin.channelRequired');
    if (title.trim().length > LIVE_STREAM_TITLE_MAX_LENGTH) {
      return t('liveStream.admin.titleTooLong', { max: LIVE_STREAM_TITLE_MAX_LENGTH });
    }
    return null;
  };

  const save = async (patch: LiveStreamPatch, successMessage: string) => {
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      applyStream(await liveStreamApi.update(patch));
      setSuccess(successMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('liveStream.admin.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const settingsPatch = (): LiveStreamPatch => ({ channel: channel.trim(), title: title.trim() });

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problem = validate(false);
    if (problem) {
      setError(problem);
      return;
    }
    await save(settingsPatch(), t('liveStream.admin.saved'));
  };

  const handleToggle = async () => {
    if (isLive) {
      await save({ isLive: false }, t('liveStream.admin.ended'));
      return;
    }
    const problem = validate(true);
    if (problem) {
      setError(problem);
      return;
    }
    await save({ ...settingsPatch(), isLive: true }, t('liveStream.admin.nowLive'));
  };

  return (
    <section className="ac-section" aria-labelledby="live-stream-title">
      <h2 id="live-stream-title" className="ac-section__title">{t('liveStream.admin.title')}</h2>
      <Card className="live-panel">
        {loading ? (
          <Skeleton variant="block" count={2} />
        ) : (
          <>
            <p className="ac-section__text">{t('liveStream.admin.description')}</p>
            <div className="live-panel__status" role="status">
              {isLive ? (
                <>
                  <Badge tone="live">{t('liveStream.live')}</Badge>
                  {liveSince && (
                    <span>{t('liveStream.admin.statusLive', { time: formatTime(liveSince, i18n.language) })}</span>
                  )}
                  {autoOffAt && (
                    <span className="live-panel__auto-off">
                      {t('liveStream.admin.autoOff', { time: formatTime(autoOffAt, i18n.language) })}
                    </span>
                  )}
                </>
              ) : (
                <Badge>{t('liveStream.admin.statusOffline')}</Badge>
              )}
            </div>

            {error && <AdminNotice tone="error">{error}</AdminNotice>}
            {success && <AdminNotice tone="success">{success}</AdminNotice>}

            <form className="ac-form" onSubmit={handleSave}>
              <div className="ac-form__row">
                <div className="ac-field">
                  <label className="ac-field__label" htmlFor="live-stream-channel">{t('liveStream.admin.channel')}</label>
                  <input
                    id="live-stream-channel"
                    type="text"
                    value={channel}
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={25}
                    onChange={(event) => setChannel(event.target.value)}
                  />
                  <p className="ac-field__hint">{t('liveStream.admin.channelHint')}</p>
                </div>
                <div className="ac-field">
                  <label className="ac-field__label" htmlFor="live-stream-title-input">{t('liveStream.admin.streamTitle')}</label>
                  <input
                    id="live-stream-title-input"
                    type="text"
                    value={title}
                    maxLength={LIVE_STREAM_TITLE_MAX_LENGTH}
                    placeholder={t('liveStream.admin.titlePlaceholder')}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </div>
              </div>
              <div className="ac-toolbar">
                <Button
                  size="lg"
                  variant={isLive ? 'danger' : 'primary'}
                  loading={saving}
                  icon={isLive ? <Square aria-hidden="true" size={18} /> : <Radio aria-hidden="true" size={18} />}
                  onClick={() => void handleToggle()}
                >
                  {isLive ? t('liveStream.admin.endStream') : t('liveStream.admin.goLive')}
                </Button>
                <Button type="submit" variant="secondary" disabled={saving} icon={<Save aria-hidden="true" size={18} />}>
                  {t('liveStream.admin.save')}
                </Button>
              </div>
            </form>
          </>
        )}
      </Card>
    </section>
  );
}
