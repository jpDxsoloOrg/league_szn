import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Play } from 'lucide-react';
import { liveStreamApi } from '../../services/api';
import type { LiveStream } from '../../types';
import { isTwitchChannel, twitchChannelUrl, twitchPlayerUrl } from '../../utils/twitch';
import Badge from '../ui/Badge';
import Card from '../ui/Card';
import '../episodes/YouTubeFacade.css';
import './LiveStreamCard.css';

/** How often the card re-checks the stream while the tab is visible. */
const LIVE_STREAM_POLL_MS = 60_000;

/**
 * Dashboard card for the league's Twitch stream, shown only while a GM has
 * marked it live. Click-to-load player (no chat) plus a Watch on Twitch link.
 */
export default function LiveStreamCard() {
  const { t } = useTranslation();
  const [stream, setStream] = useState<LiveStream | null>(null);
  const [active, setActive] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const inFlightRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;
    try {
      const data = await liveStreamApi.get(controller.signal);
      if (!controller.signal.aborted) setStream(data);
    } catch {
      // Keep what we had; the next poll tries again.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, LIVE_STREAM_POLL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      inFlightRef.current?.abort();
    };
  }, [refresh]);

  const channel = stream?.isLive && stream.channel && isTwitchChannel(stream.channel) ? stream.channel : null;

  // A new channel or an ended stream puts the placeholder back.
  useEffect(() => {
    setActive(false);
  }, [channel]);

  useEffect(() => {
    if (active) iframeRef.current?.focus();
  }, [active]);

  if (!channel) return null;

  const title = stream?.title?.trim() || t('liveStream.defaultTitle');

  return (
    <Card className="live-card" role="region" aria-labelledby="live-card-title">
      <div className="live-card__head">
        <Badge tone="live">{t('liveStream.live')}</Badge>
        <h2 id="live-card-title" className="live-card__title">{title}</h2>
      </div>
      <div className="yt-facade-wrap">
        {active ? (
          <iframe
            ref={iframeRef}
            className="yt-facade__frame"
            src={twitchPlayerUrl(channel, window.location.hostname)}
            title={t('liveStream.playerTitle', { channel })}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            className="yt-facade live-card__placeholder"
            aria-label={t('liveStream.play')}
            onClick={() => setActive(true)}
          >
            <span className="live-card__channel" aria-hidden="true">twitch.tv/{channel}</span>
            <span className="yt-facade__play">
              <Play aria-hidden="true" size={32} />
            </span>
          </button>
        )}
        <a
          className="ui-btn ui-btn--secondary ui-btn--sm yt-facade__external"
          href={twitchChannelUrl(channel)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink aria-hidden="true" size={16} />
          {t('liveStream.watchOnTwitch')}
        </a>
      </div>
    </Card>
  );
}
