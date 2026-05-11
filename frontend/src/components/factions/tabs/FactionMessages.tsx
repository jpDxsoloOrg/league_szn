import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { factionsApi } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { logger } from '../../../utils/logger';
import {
  DEFAULT_WRESTLER_IMAGE,
  resolveImageSrc,
  applyImageFallback,
} from '../../../constants/imageFallbacks';
import type {
  FactionDirectMessage,
  FactionMessage,
} from '../../../types/factionMessage';
import type { DirectMessageThreadSummary } from '../../../types/faction';
import type { FactionDetailContext } from '../FactionDetail';
import './FactionMessages.css';

const POLL_INTERVAL_MS = 10_000;
const COMPOSER_MAX_LINES = 6;

interface BaseDisplayMessage {
  messageId: string;
  authorPlayerId: string;
  body: string;
  createdAt: string;
  isPending?: boolean;
  hasError?: boolean;
  tempId?: string;
}

interface ChannelDisplayMessage extends BaseDisplayMessage {
  kind: 'channel';
  messageType: 'user' | 'system';
}

interface DmDisplayMessage extends BaseDisplayMessage {
  kind: 'dm';
}

type DisplayMessage = ChannelDisplayMessage | DmDisplayMessage;

type ActiveThread =
  | { type: 'channel' }
  | { type: 'dm'; partnerPlayerId: string };

const channelKey = 'channel';
const dmKey = (partnerPlayerId: string) => `dm:${partnerPlayerId}`;

const lastReadStorageKey = (factionId: string, key: string) =>
  `faction-msgs-lastread:${factionId}:${key}`;

function readLastRead(factionId: string, key: string): string | null {
  try {
    return typeof window !== 'undefined'
      ? window.localStorage.getItem(lastReadStorageKey(factionId, key))
      : null;
  } catch {
    return null;
  }
}

function writeLastRead(factionId: string, key: string, messageId: string): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(lastReadStorageKey(factionId, key), messageId);
    }
  } catch {
    // Storage may be unavailable (private mode); just skip — the unread dot
    // becomes a one-session display and that's fine.
  }
}

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

function generateTempId(): string {
  return `temp-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

// ─── Component ─────────────────────────────────────────────────────

export default function FactionMessages() {
  const { t } = useTranslation();
  const { faction } = useOutletContext<FactionDetailContext>();
  const auth = useAuth();
  const callerPlayerId = auth.playerId;

  const [searchParams, setSearchParams] = useSearchParams();
  const initialDmParam = searchParams.get('dm');

  // ─── State ────────────────────────────────────────────────────────
  const [threads, setThreads] = useState<DirectMessageThreadSummary[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [channelMessages, setChannelMessages] = useState<ChannelDisplayMessage[]>([]);
  const [dmMessages, setDmMessages] = useState<Map<string, DmDisplayMessage[]>>(
    () => new Map(),
  );
  const [activeThread, setActiveThread] = useState<ActiveThread>(
    initialDmParam ? { type: 'dm', partnerPlayerId: initialDmParam } : { type: 'channel' },
  );
  const [composer, setComposer] = useState('');
  const [posting, setPosting] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [newDmOpen, setNewDmOpen] = useState(false);
  const [threadFilter, setThreadFilter] = useState('');
  const [, setUnreadTick] = useState(0); // re-render trigger on focus

  // Per-page-load polling visibility flag.
  const [visible, setVisible] = useState(
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true,
  );

  const feedRef = useRef<HTMLDivElement | null>(null);
  // Tracks whether the user has scrolled away from the bottom — when true we
  // avoid yanking them back on polled messages.
  const userScrolledUp = useRef(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const memberById = useMemo(
    () => new Map(faction.members.map((m) => [m.playerId, m])),
    [faction.members],
  );

  // ─── Initial load: threads + channel first page in parallel ────────
  useEffect(() => {
    const ac = new AbortController();
    setThreadsLoading(true);

    Promise.all([
      factionsApi.directMessages.listMyThreads(faction.stableId, ac.signal),
      factionsApi.messages.list(faction.stableId, { limit: 50 }, ac.signal),
    ])
      .then(([threadList, channelPage]) => {
        if (ac.signal.aborted) return;
        setThreads(threadList);
        setChannelMessages(
          channelPage.items.map((m): ChannelDisplayMessage => ({
            kind: 'channel',
            messageId: m.messageId,
            authorPlayerId: m.authorPlayerId,
            body: m.body,
            createdAt: m.createdAt,
            messageType: m.messageType,
          })),
        );
      })
      .catch((err) => {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Messages tab: initial load failed');
          setFeedError(err.message);
        }
      })
      .finally(() => {
        if (!ac.signal.aborted) setThreadsLoading(false);
      });

    return () => ac.abort();
  }, [faction.stableId]);

  // ─── Visibility tracking ──────────────────────────────────────────
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  // ─── Sync URL with active thread ──────────────────────────────────
  useEffect(() => {
    const currentDm = searchParams.get('dm');
    if (activeThread.type === 'dm') {
      if (currentDm !== activeThread.partnerPlayerId) {
        const next = new URLSearchParams(searchParams);
        next.set('dm', activeThread.partnerPlayerId);
        setSearchParams(next, { replace: true });
      }
    } else if (currentDm) {
      const next = new URLSearchParams(searchParams);
      next.delete('dm');
      setSearchParams(next, { replace: true });
    }
    // searchParams + setSearchParams are stable from the hook
  }, [activeThread, searchParams, setSearchParams]);

  // ─── Fetch DM thread when active ─────────────────────────────────
  useEffect(() => {
    if (activeThread.type !== 'dm') return;
    if (dmMessages.has(activeThread.partnerPlayerId)) return;
    const ac = new AbortController();
    const partnerId = activeThread.partnerPlayerId;

    factionsApi.directMessages
      .listThread(faction.stableId, partnerId, { limit: 50 }, ac.signal)
      .then((page) => {
        if (ac.signal.aborted) return;
        setDmMessages((prev) => {
          const next = new Map(prev);
          next.set(
            partnerId,
            page.items.map((m): DmDisplayMessage => ({
              kind: 'dm',
              messageId: m.messageId,
              authorPlayerId: m.senderPlayerId,
              body: m.body,
              createdAt: m.createdAt,
            })),
          );
          return next;
        });
      })
      .catch((err) => {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Messages tab: dm thread fetch failed');
          setFeedError(err.message);
        }
      });

    return () => ac.abort();
  }, [activeThread, faction.stableId, dmMessages]);

  // ─── Polling ─────────────────────────────────────────────────────
  const pollOnce = useCallback(async () => {
    try {
      if (activeThread.type === 'channel') {
        const page = await factionsApi.messages.list(faction.stableId, { limit: 50 });
        setChannelMessages((prev) => {
          const knownIds = new Set(prev.map((m) => m.messageId));
          const incoming: ChannelDisplayMessage[] = page.items
            .filter((m) => !knownIds.has(m.messageId))
            .map((m) => ({
              kind: 'channel',
              messageId: m.messageId,
              authorPlayerId: m.authorPlayerId,
              body: m.body,
              createdAt: m.createdAt,
              messageType: m.messageType,
            }));
          if (incoming.length === 0) return prev;
          // Drop temp bubbles whose content + author matches an incoming
          // server-side copy — avoids the race where polling beats the post
          // response back to the client.
          const survivors = prev.filter((m) => {
            if (!m.isPending) return true;
            const matched = incoming.find(
              (inc) => inc.authorPlayerId === m.authorPlayerId && inc.body === m.body,
            );
            return !matched;
          });
          return [...survivors, ...incoming];
        });
      } else {
        const partnerId = activeThread.partnerPlayerId;
        const page = await factionsApi.directMessages.listThread(faction.stableId, partnerId, {
          limit: 50,
        });
        setDmMessages((prev) => {
          const existing = prev.get(partnerId) ?? [];
          const knownIds = new Set(existing.map((m) => m.messageId));
          const incoming: DmDisplayMessage[] = page.items
            .filter((m) => !knownIds.has(m.messageId))
            .map((m) => ({
              kind: 'dm',
              messageId: m.messageId,
              authorPlayerId: m.senderPlayerId,
              body: m.body,
              createdAt: m.createdAt,
            }));
          if (incoming.length === 0) return prev;
          const survivors = existing.filter((m) => {
            if (!m.isPending) return true;
            const matched = incoming.find(
              (inc) => inc.authorPlayerId === m.authorPlayerId && inc.body === m.body,
            );
            return !matched;
          });
          const next = new Map(prev);
          next.set(partnerId, [...survivors, ...incoming]);
          return next;
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        logger.warn(`Messages tab: poll failed (${err.message})`);
      }
    }
  }, [activeThread, faction.stableId]);

  useEffect(() => {
    if (!visible) return;
    const id = window.setInterval(pollOnce, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [visible, pollOnce]);

  // ─── Active feed (sorted oldest→newest for display) ───────────────
  const activeFeed: DisplayMessage[] = useMemo(() => {
    const items =
      activeThread.type === 'channel'
        ? channelMessages
        : dmMessages.get(activeThread.partnerPlayerId) ?? [];
    // The repositories return newest-first; chat displays oldest first.
    return [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [activeThread, channelMessages, dmMessages]);

  // ─── Auto-scroll to bottom when feed grows and user hasn't scrolled up.
  useEffect(() => {
    const el = feedRef.current;
    if (!el || userScrolledUp.current) return;
    el.scrollTop = el.scrollHeight;
  }, [activeFeed]);

  // ─── Track scroll position to decide if we should auto-scroll on append.
  const handleFeedScroll = () => {
    const el = feedRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledUp.current = distanceFromBottom > 80;
    // Touching the bottom counts as reading the latest message.
    if (!userScrolledUp.current && activeFeed.length > 0) {
      const last = activeFeed[activeFeed.length - 1];
      const key = activeThread.type === 'channel' ? channelKey : dmKey(activeThread.partnerPlayerId);
      writeLastRead(faction.stableId, key, last.messageId);
      setUnreadTick((tick) => tick + 1);
    }
  };

  // On feed change, also mark as read if user is currently at bottom.
  useEffect(() => {
    if (activeFeed.length === 0) return;
    if (userScrolledUp.current) return;
    const last = activeFeed[activeFeed.length - 1];
    const key = activeThread.type === 'channel' ? channelKey : dmKey(activeThread.partnerPlayerId);
    writeLastRead(faction.stableId, key, last.messageId);
    setUnreadTick((tick) => tick + 1);
  }, [activeFeed, activeThread, faction.stableId]);

  // ─── Send message (optimistic) ───────────────────────────────────
  const handleSend = async (overrideBody?: string, retryTempId?: string) => {
    const body = (overrideBody ?? composer).trim();
    if (!body) return;
    if (posting) return;

    setPosting(true);

    let tempId: string;
    if (retryTempId) {
      tempId = retryTempId;
      // Reset the error state on retry.
      if (activeThread.type === 'channel') {
        setChannelMessages((prev) =>
          prev.map((m) =>
            m.tempId === tempId ? { ...m, hasError: false, isPending: true } : m,
          ),
        );
      } else {
        const partnerId = activeThread.partnerPlayerId;
        setDmMessages((prev) => {
          const next = new Map(prev);
          const list = (next.get(partnerId) ?? []).map((m) =>
            m.tempId === tempId ? { ...m, hasError: false, isPending: true } : m,
          );
          next.set(partnerId, list);
          return next;
        });
      }
    } else {
      tempId = generateTempId();
      const now = new Date().toISOString();
      if (activeThread.type === 'channel') {
        setChannelMessages((prev) => [
          ...prev,
          {
            kind: 'channel',
            messageId: tempId,
            tempId,
            authorPlayerId: callerPlayerId ?? 'me',
            body,
            createdAt: now,
            messageType: 'user',
            isPending: true,
          },
        ]);
      } else {
        const partnerId = activeThread.partnerPlayerId;
        setDmMessages((prev) => {
          const next = new Map(prev);
          const list = next.get(partnerId) ?? [];
          next.set(partnerId, [
            ...list,
            {
              kind: 'dm',
              messageId: tempId,
              tempId,
              authorPlayerId: callerPlayerId ?? 'me',
              body,
              createdAt: now,
              isPending: true,
            },
          ]);
          return next;
        });
      }
      setComposer('');
    }

    try {
      if (activeThread.type === 'channel') {
        const created: FactionMessage = await factionsApi.messages.post(
          faction.stableId,
          body,
        );
        setChannelMessages((prev) =>
          prev.map((m) =>
            m.tempId === tempId
              ? {
                  kind: 'channel',
                  messageId: created.messageId,
                  authorPlayerId: created.authorPlayerId,
                  body: created.body,
                  createdAt: created.createdAt,
                  messageType: created.messageType,
                }
              : m,
          ),
        );
      } else {
        const partnerId = activeThread.partnerPlayerId;
        const created: FactionDirectMessage = await factionsApi.directMessages.post(
          faction.stableId,
          partnerId,
          body,
        );
        setDmMessages((prev) => {
          const next = new Map(prev);
          const list = (next.get(partnerId) ?? []).map((m) =>
            m.tempId === tempId
              ? {
                  kind: 'dm',
                  messageId: created.messageId,
                  authorPlayerId: created.senderPlayerId,
                  body: created.body,
                  createdAt: created.createdAt,
                }
              : m,
          );
          next.set(partnerId, list);
          return next;
        });
      }
    } catch {
      logger.error('Messages tab: post failed');
      if (activeThread.type === 'channel') {
        setChannelMessages((prev) =>
          prev.map((m) =>
            m.tempId === tempId ? { ...m, isPending: false, hasError: true } : m,
          ),
        );
      } else {
        const partnerId = activeThread.partnerPlayerId;
        setDmMessages((prev) => {
          const next = new Map(prev);
          const list = (next.get(partnerId) ?? []).map((m) =>
            m.tempId === tempId ? { ...m, isPending: false, hasError: true } : m,
          );
          next.set(partnerId, list);
          return next;
        });
      }
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

  // ─── Unread dots in the conversation list ────────────────────────
  const isChannelUnread = useMemo(() => {
    if (channelMessages.length === 0) return false;
    const last = channelMessages[0]; // newest first from repo
    const stored = readLastRead(faction.stableId, channelKey);
    return stored !== last.messageId;
  }, [channelMessages, faction.stableId]);

  const isThreadUnread = (summary: DirectMessageThreadSummary): boolean => {
    if (!summary.lastMessage) return false;
    const stored = readLastRead(faction.stableId, dmKey(summary.partnerPlayerId));
    return stored !== summary.lastMessage.messageId;
  };

  // ─── Threads list filtering ──────────────────────────────────────
  const visibleThreads = useMemo(() => {
    const q = threadFilter.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter(
      (s) =>
        (s.partnerPlayerName ?? '').toLowerCase().includes(q) ||
        (s.partnerWrestlerName ?? '').toLowerCase().includes(q),
    );
  }, [threads, threadFilter]);

  // ─── New-DM dropdown ─────────────────────────────────────────────
  const newDmCandidates = useMemo(() => {
    const inThreads = new Set(threads.map((t_) => t_.partnerPlayerId));
    return faction.members.filter(
      (m) => m.playerId !== callerPlayerId && !inThreads.has(m.playerId),
    );
  }, [faction.members, threads, callerPlayerId]);

  // ─── Render helpers ──────────────────────────────────────────────
  const audiencePill = activeThread.type === 'channel'
    ? t('factions.messages.audienceChannel', 'VISIBLE TO FACTION ONLY')
    : t('factions.messages.audienceDm', 'PRIVATE — JUST YOU TWO');

  const headerContext = activeThread.type === 'channel'
    ? t('factions.messages.headerChannel', 'FACTION-WIDE CHANNEL · {{count}} members', {
        count: faction.memberIds.length,
      })
    : (() => {
        const partner = memberById.get(activeThread.partnerPlayerId);
        return t('factions.messages.headerDm', 'DIRECT · {{name}}', {
          name: partner?.wrestlerName ?? activeThread.partnerPlayerId,
        });
      })();

  const composerPlaceholder = activeThread.type === 'channel'
    ? t('factions.messages.composerChannelPlaceholder', 'Message the faction…')
    : (() => {
        const partner = memberById.get(activeThread.partnerPlayerId);
        return t('factions.messages.composerDmPlaceholder', 'Message {{name}}…', {
          name: partner?.wrestlerName ?? activeThread.partnerPlayerId,
        });
      })();

  // Group messages by day for date separators.
  const renderFeed = (): React.ReactNode[] => {
    const out: React.ReactNode[] = [];
    let lastDay = '';
    for (const m of activeFeed) {
      const d = dayKey(m.createdAt);
      if (d && d !== lastDay) {
        out.push(
          <div key={`sep-${d}`} className="faction-messages__day-sep">
            <span>{new Date(m.createdAt).toLocaleDateString()}</span>
          </div>,
        );
        lastDay = d;
      }
      if (m.kind === 'channel' && m.messageType === 'system') {
        out.push(
          <div key={m.messageId} className="faction-messages__system">
            {m.body}
          </div>,
        );
        continue;
      }
      const isSelf = m.authorPlayerId === callerPlayerId;
      const author = memberById.get(m.authorPlayerId);
      out.push(
        <div
          key={m.messageId}
          className={`faction-messages__bubble ${
            isSelf ? 'faction-messages__bubble--self' : 'faction-messages__bubble--other'
          } ${m.isPending ? 'faction-messages__bubble--pending' : ''} ${
            m.hasError ? 'faction-messages__bubble--error' : ''
          }`}
        >
          {!isSelf && (
            <img
              src={resolveImageSrc(author?.imageUrl, DEFAULT_WRESTLER_IMAGE)}
              onError={(e) => applyImageFallback(e, DEFAULT_WRESTLER_IMAGE)}
              alt=""
              className="faction-messages__bubble-avatar"
            />
          )}
          <div className="faction-messages__bubble-body">
            {!isSelf && (
              <span className="faction-messages__bubble-author">
                {author?.wrestlerName ?? m.authorPlayerId}
              </span>
            )}
            <p className="faction-messages__bubble-text">{m.body}</p>
            <span className="faction-messages__bubble-time">
              {formatTime(m.createdAt)}
            </span>
            {m.hasError && (
              <button
                type="button"
                className="faction-messages__bubble-retry"
                onClick={() => handleRetry(m)}
              >
                {t('factions.messages.retry', 'Retry')}
              </button>
            )}
          </div>
        </div>,
      );
    }
    return out;
  };

  return (
    <div className="faction-messages">
      {/* Conversation list */}
      <aside className="faction-messages__list">
        <button
          type="button"
          className={`faction-messages__channel-pin ${
            activeThread.type === 'channel' ? 'faction-messages__channel-pin--active' : ''
          }`}
          onClick={() => setActiveThread({ type: 'channel' })}
        >
          <span className="faction-messages__channel-label">
            {t('factions.messages.channelLabel', 'FACTION-WIDE')}
          </span>
          <span className="faction-messages__channel-sub">
            {channelMessages.length > 0
              ? channelMessages[0].body.slice(0, 60)
              : t('factions.messages.channelEmpty', 'No messages yet.')}
          </span>
          {isChannelUnread && (
            <span className="faction-messages__unread-dot" aria-label="unread" />
          )}
        </button>

        <h3 className="faction-messages__section-title">
          {t('factions.messages.dmsSection', 'Direct Messages')}
        </h3>

        {threadsLoading ? (
          <p className="faction-messages__empty">
            {t('common.loading', 'Loading…')}
          </p>
        ) : visibleThreads.length === 0 ? (
          <p className="faction-messages__empty">
            {t('factions.messages.dmsEmpty', 'No direct-message threads yet.')}
          </p>
        ) : (
          <ul className="faction-messages__thread-list">
            {visibleThreads.map((thread) => {
              const isActive =
                activeThread.type === 'dm' &&
                activeThread.partnerPlayerId === thread.partnerPlayerId;
              return (
                <li key={thread.partnerPlayerId}>
                  <button
                    type="button"
                    className={`faction-messages__thread-row ${
                      isActive ? 'faction-messages__thread-row--active' : ''
                    }`}
                    onClick={() =>
                      setActiveThread({ type: 'dm', partnerPlayerId: thread.partnerPlayerId })
                    }
                  >
                    <img
                      src={resolveImageSrc(undefined, DEFAULT_WRESTLER_IMAGE)}
                      onError={(e) => applyImageFallback(e, DEFAULT_WRESTLER_IMAGE)}
                      alt=""
                      className="faction-messages__thread-avatar"
                    />
                    <div className="faction-messages__thread-body">
                      <span className="faction-messages__thread-name">
                        {thread.partnerWrestlerName ?? thread.partnerPlayerName ?? thread.partnerPlayerId}
                      </span>
                      <span className="faction-messages__thread-preview">
                        {thread.lastMessage?.body.slice(0, 40) ?? ''}
                      </span>
                    </div>
                    <span className="faction-messages__thread-time">
                      {formatTime(thread.lastMessageAt)}
                    </span>
                    {isThreadUnread(thread) && (
                      <span className="faction-messages__unread-dot" aria-label="unread" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="faction-messages__search-wrap">
          <label className="visually-hidden" htmlFor="faction-messages-search">
            {t('factions.messages.searchLabel', 'Search threads')}
          </label>
          <input
            id="faction-messages-search"
            type="search"
            placeholder={t('factions.messages.searchPlaceholder', 'Search…')}
            value={threadFilter}
            onChange={(e) => setThreadFilter(e.target.value)}
          />
        </div>

        {newDmCandidates.length > 0 && (
          <div className="faction-messages__new-dm">
            <button
              type="button"
              className="faction-messages__new-dm-trigger"
              aria-haspopup="menu"
              aria-expanded={newDmOpen}
              onClick={() => setNewDmOpen((v) => !v)}
            >
              {t('factions.messages.newDm', '+ New DM')}
            </button>
            {newDmOpen && (
              <ul role="menu" className="faction-messages__new-dm-list">
                {newDmCandidates.map((member) => (
                  <li key={member.playerId}>
                    <button
                      type="button"
                      role="menuitem"
                      className="faction-messages__new-dm-item"
                      onClick={() => {
                        setNewDmOpen(false);
                        setActiveThread({ type: 'dm', partnerPlayerId: member.playerId });
                      }}
                    >
                      {member.wrestlerName}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </aside>

      {/* Active thread */}
      <section className="faction-messages__thread" aria-live="polite">
        <header className="faction-messages__thread-header">
          <span className="faction-messages__thread-header-context">{headerContext}</span>
          <span
            className="faction-messages__audience-pill"
            aria-label={t('factions.messages.audienceAria', 'Audience: {{label}}', {
              label: audiencePill,
            })}
          >
            {audiencePill}
          </span>
        </header>

        {feedError && (
          <p className="faction-messages__feed-error" role="alert">
            {t('factions.messages.feedError', 'Could not load messages.')}: {feedError}
          </p>
        )}

        <div
          className="faction-messages__feed"
          ref={feedRef}
          onScroll={handleFeedScroll}
        >
          {activeFeed.length === 0 ? (
            <p className="faction-messages__empty">
              {t('factions.messages.feedEmpty', 'No messages yet — start the conversation.')}
            </p>
          ) : (
            renderFeed()
          )}
        </div>

        <p className="faction-messages__reminder">
          {activeThread.type === 'channel'
            ? t('factions.messages.reminderChannel', 'Only members can read this.')
            : t('factions.messages.reminderDm', 'This is private — just you two.')}
        </p>

        <div className="faction-messages__composer">
          <button
            type="button"
            className="faction-messages__composer-icon"
            disabled
            title={t('factions.messages.attachComingSoon', 'Attachments coming soon')}
            aria-label={t('factions.messages.attachAria', 'Attach (coming soon)')}
          >
            📎
          </button>
          <button
            type="button"
            className="faction-messages__composer-icon"
            disabled
            title={t('factions.messages.emojiComingSoon', 'Emoji picker coming soon')}
            aria-label={t('factions.messages.emojiAria', 'Emoji (coming soon)')}
          >
            🙂
          </button>
          <textarea
            ref={composerRef}
            className="faction-messages__composer-input"
            placeholder={composerPlaceholder}
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            onKeyDown={handleComposerKeyDown}
            rows={1}
            style={{ maxHeight: `${COMPOSER_MAX_LINES * 1.6}em` }}
            aria-label={composerPlaceholder}
          />
          <button
            type="button"
            className="faction-messages__send"
            disabled={posting || composer.trim().length === 0}
            onClick={() => handleSend()}
          >
            {t('factions.messages.send', 'Send')}
          </button>
        </div>
      </section>
    </div>
  );
}
