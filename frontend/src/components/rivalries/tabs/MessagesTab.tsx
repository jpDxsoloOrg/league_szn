import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { rivalriesApi } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import {
  DEFAULT_WRESTLER_IMAGE,
  applyImageFallback,
  resolveImageSrc,
} from '../../../constants/imageFallbacks';
import type { Player } from '../../../types';
import type { HydratedRivalry, RivalryMessage } from '../../../types/rivalry';
import { resolveWrestlerName } from '../rivalryUtils';
import './MessagesTab.css';

interface TabProps {
  hydrated: HydratedRivalry;
  players: Player[];
}

interface DisplayMessage {
  messageId: string;
  authorPlayerId: string;
  body: string;
  audience: RivalryMessage['audience'];
  createdAt: string;
  isPending?: boolean;
  hasError?: boolean;
  tempId?: string;
}

const POLL_INTERVAL_MS = 10_000;
const COMPOSER_MAX_LINES = 6;
const COMPOSER_MAX_CHARS = 1000;
const FIXED_AUDIENCE = 'participants' as const;

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString();
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : '';
}

function tempId(): string {
  return `temp-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

/**
 * Single-thread chat for a rivalry — patterned after FactionMessages
 * but stripped of the channel-vs-DM list because a rivalry is itself
 * one conversation between the two wrestlers and any GMs. Polls every
 * 10 s while the page is visible, posts optimistically with retry on
 * failure, and renders system messages (status changes) distinctly
 * from user bubbles.
 */
export default function MessagesTab({ hydrated, players }: TabProps) {
  const { t } = useTranslation();
  const auth = useAuth();
  const callerPlayerId = auth.playerId;
  const rivalryId = hydrated.rivalry.rivalryId;

  const memberById = useMemo(() => new Map(players.map((p) => [p.playerId, p] as const)), [players]);

  const [feed, setFeed] = useState<DisplayMessage[]>([]);
  const [composer, setComposer] = useState('');
  const [posting, setPosting] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [visible, setVisible] = useState(
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true,
  );

  const feedRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const userScrolledUp = useRef(false);

  // ─── Initial load ────────────────────────────────────────────────
  useEffect(() => {
    const ac = new AbortController();
    rivalriesApi.messages
      .list(rivalryId, { limit: 50 }, ac.signal)
      .then((page) => {
        if (ac.signal.aborted) return;
        setFeed(
          page.messages.map((m) => ({
            messageId: m.messageId,
            authorPlayerId: m.authorPlayerId,
            body: m.body,
            audience: m.audience,
            createdAt: m.createdAt,
          })),
        );
      })
      .catch((err) => {
        if (err instanceof Error && err.name !== 'AbortError') {
          setFeedError(err.message);
        }
      });
    return () => ac.abort();
  }, [rivalryId]);

  // ─── Visibility tracking ─────────────────────────────────────────
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  // ─── Polling ─────────────────────────────────────────────────────
  const pollOnce = useCallback(async () => {
    try {
      const page = await rivalriesApi.messages.list(rivalryId, { limit: 50 });
      setFeed((prev) => {
        const knownIds = new Set(prev.map((m) => m.messageId));
        const incoming: DisplayMessage[] = page.messages
          .filter((m) => !knownIds.has(m.messageId))
          .map((m) => ({
            messageId: m.messageId,
            authorPlayerId: m.authorPlayerId,
            body: m.body,
            audience: m.audience,
            createdAt: m.createdAt,
          }));
        if (incoming.length === 0) return prev;
        // Drop temp bubbles whose content + author match an incoming
        // server copy — covers the race where polling beats the post
        // response back.
        const survivors = prev.filter((m) => {
          if (!m.isPending) return true;
          return !incoming.find(
            (inc) => inc.authorPlayerId === m.authorPlayerId && inc.body === m.body,
          );
        });
        return [...survivors, ...incoming];
      });
    } catch {
      // Poll failures are silent — the next tick will try again.
    }
  }, [rivalryId]);

  useEffect(() => {
    if (!visible) return;
    const id = window.setInterval(pollOnce, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [visible, pollOnce]);

  // ─── Display order (oldest → newest) ─────────────────────────────
  const activeFeed = useMemo(
    () => [...feed].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [feed],
  );

  // ─── Auto-scroll ─────────────────────────────────────────────────
  useEffect(() => {
    const el = feedRef.current;
    if (!el || userScrolledUp.current) return;
    el.scrollTop = el.scrollHeight;
  }, [activeFeed]);

  const handleFeedScroll = () => {
    const el = feedRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledUp.current = distanceFromBottom > 80;
  };

  // ─── Send (optimistic) ───────────────────────────────────────────
  const handleSend = async (overrideBody?: string, retryTempId?: string) => {
    const body = (overrideBody ?? composer).trim();
    if (!body) return;
    if (posting) return;

    setPosting(true);

    let id: string;
    if (retryTempId) {
      id = retryTempId;
      setFeed((prev) =>
        prev.map((m) => (m.tempId === id ? { ...m, hasError: false, isPending: true } : m)),
      );
    } else {
      id = tempId();
      const now = new Date().toISOString();
      setFeed((prev) => [
        ...prev,
        {
          messageId: id,
          tempId: id,
          authorPlayerId: callerPlayerId ?? 'me',
          body,
          audience: FIXED_AUDIENCE,
          createdAt: now,
          isPending: true,
        },
      ]);
      setComposer('');
    }

    try {
      const res = await rivalriesApi.messages.post(rivalryId, body, FIXED_AUDIENCE);
      setFeed((prev) =>
        prev.map((m) =>
          m.tempId === id
            ? {
                messageId: res.message.messageId,
                authorPlayerId: res.message.authorPlayerId,
                body: res.message.body,
                audience: res.message.audience,
                createdAt: res.message.createdAt,
              }
            : m,
        ),
      );
    } catch {
      setFeed((prev) =>
        prev.map((m) => (m.tempId === id ? { ...m, isPending: false, hasError: true } : m)),
      );
    } finally {
      setPosting(false);
    }
  };

  const handleRetry = (msg: DisplayMessage) => {
    if (!msg.tempId) return;
    handleSend(msg.body, msg.tempId);
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ─── Render ──────────────────────────────────────────────────────
  const headerContext = t('rivalries.messages.headerContext', {
    defaultValue: 'Participants + GMs',
  });
  const audiencePill = t('rivalries.messages.audiencePill', {
    defaultValue: 'VISIBLE TO PARTICIPANTS + GMs',
  });

  const renderFeed = (): React.ReactNode[] => {
    const out: React.ReactNode[] = [];
    let lastDay = '';
    for (const m of activeFeed) {
      const d = dayKey(m.createdAt);
      if (d && d !== lastDay) {
        out.push(
          <div key={`sep-${d}`} className="rivalry-msgs__day-sep">
            <span>{new Date(m.createdAt).toLocaleDateString()}</span>
          </div>,
        );
        lastDay = d;
      }
      const isSystem = m.authorPlayerId === 'system';
      if (isSystem) {
        out.push(
          <div key={m.messageId} className="rivalry-msgs__system">
            {m.body}
          </div>,
        );
        continue;
      }
      const isSelf = m.authorPlayerId === callerPlayerId;
      const author = memberById.get(m.authorPlayerId);
      const participant = hydrated.rivalry.participants.find(
        (p) => p.playerId === m.authorPlayerId,
      );
      out.push(
        <div
          key={m.messageId}
          className={`rivalry-msgs__bubble ${
            isSelf ? 'rivalry-msgs__bubble--self' : 'rivalry-msgs__bubble--other'
          } ${m.isPending ? 'rivalry-msgs__bubble--pending' : ''} ${
            m.hasError ? 'rivalry-msgs__bubble--error' : ''
          }`}
        >
          {!isSelf && (
            <img
              src={resolveImageSrc(author?.imageUrl, DEFAULT_WRESTLER_IMAGE)}
              onError={(e) => applyImageFallback(e, DEFAULT_WRESTLER_IMAGE)}
              alt=""
              className="rivalry-msgs__bubble-avatar"
            />
          )}
          <div className="rivalry-msgs__bubble-body">
            {!isSelf && (
              <span className="rivalry-msgs__bubble-author">
                {resolveWrestlerName(participant, author) || m.authorPlayerId}
              </span>
            )}
            <p className="rivalry-msgs__bubble-text">{m.body}</p>
            <span className="rivalry-msgs__bubble-time">{formatTime(m.createdAt)}</span>
            {m.hasError && (
              <button
                type="button"
                className="rivalry-msgs__bubble-retry"
                onClick={() => handleRetry(m)}
              >
                {t('rivalries.messages.retry', { defaultValue: 'Retry' })}
              </button>
            )}
          </div>
        </div>,
      );
    }
    return out;
  };

  return (
    <section className="rivalry-msgs" aria-live="polite">
      <header className="rivalry-msgs__header">
        <span className="rivalry-msgs__header-context">{headerContext}</span>
        <span
          className="rivalry-msgs__audience-pill"
          aria-label={t('rivalries.messages.audienceAria', {
            defaultValue: 'Audience: {{label}}',
            label: audiencePill,
          })}
        >
          {audiencePill}
        </span>
      </header>

      <ul className="rivalry-msgs__participants" aria-label="participants">
        {hydrated.rivalry.participants.map((p) => {
          const player = memberById.get(p.playerId);
          return (
            <li key={p.playerId} className="rivalry-msgs__participant-chip">
              <img
                src={resolveImageSrc(player?.imageUrl, DEFAULT_WRESTLER_IMAGE)}
                onError={(e) => applyImageFallback(e, DEFAULT_WRESTLER_IMAGE)}
                alt=""
                className="rivalry-msgs__participant-avatar"
              />
              <span>{resolveWrestlerName(p, player)}</span>
            </li>
          );
        })}
      </ul>

      {feedError && (
        <p className="rivalry-msgs__feed-error" role="alert">
          {t('rivalries.messages.feedError', { defaultValue: 'Could not load messages.' })}: {feedError}
        </p>
      )}

      <div className="rivalry-msgs__feed" ref={feedRef} onScroll={handleFeedScroll}>
        {activeFeed.length === 0 ? (
          <p className="rivalry-msgs__empty">{t('rivalries.messages.empty')}</p>
        ) : (
          renderFeed()
        )}
      </div>

      <p className="rivalry-msgs__reminder">
        {t('rivalries.messages.reminder', {
          defaultValue: 'Visible to your opponent and the GMs only.',
        })}
      </p>

      <div className="rivalry-msgs__composer">
        <button
          type="button"
          className="rivalry-msgs__composer-icon"
          disabled
          title={t('rivalries.messages.attachComingSoon', {
            defaultValue: 'Attachments coming soon',
          })}
          aria-label="attach"
        >
          📎
        </button>
        <button
          type="button"
          className="rivalry-msgs__composer-icon"
          disabled
          title={t('rivalries.messages.emojiComingSoon', { defaultValue: 'Emoji coming soon' })}
          aria-label="emoji"
        >
          🙂
        </button>
        <textarea
          ref={composerRef}
          className="rivalry-msgs__composer-input"
          placeholder={t('rivalries.messages.placeholder')}
          value={composer}
          onChange={(e) => setComposer(e.target.value.slice(0, COMPOSER_MAX_CHARS))}
          onKeyDown={handleComposerKeyDown}
          rows={1}
          maxLength={COMPOSER_MAX_CHARS}
          style={{ maxHeight: `${COMPOSER_MAX_LINES * 1.6}em` }}
          aria-label={t('rivalries.messages.placeholder')}
        />
        <span
          className={`rivalry-msgs__composer-count ${
            composer.length > COMPOSER_MAX_CHARS * 0.9
              ? 'rivalry-msgs__composer-count--warning'
              : ''
          }`}
          aria-live="polite"
        >
          {composer.length} / {COMPOSER_MAX_CHARS}
        </span>
        <button
          type="button"
          className="rivalry-msgs__send"
          disabled={posting || composer.trim().length === 0}
          onClick={() => handleSend()}
        >
          {t('rivalries.messages.send')}
        </button>
      </div>
    </section>
  );
}
