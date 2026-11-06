import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { factionsApi, playersApi } from '../../../services/api';
import type { PlayerDirectoryEntry } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { logger } from '../../../utils/logger';
import type {
  FactionDirectMessage,
  FactionMessage,
} from '../../../types/factionMessage';
import type { DirectMessageThreadSummary } from '../../../types/faction';
import type { FactionDetailContext } from '../FactionDetail';
import Avatar from '../../ui/Avatar';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import Skeleton from '../../ui/Skeleton';
import '../groupUi.css';
import './FactionMessages.css';

const POLL_INTERVAL_MS = 10_000;

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
  const [directory, setDirectory] = useState<PlayerDirectoryEntry[]>([]);
  // Phones show one pane at a time. The active thread is the default.
  const [listOpenOnMobile, setListOpenOnMobile] = useState(false);
  const [, setUnreadTick] = useState(0); // re-render trigger on focus

  // Per-page-load polling visibility flag.
  const [visible, setVisible] = useState(
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true,
  );

  const feedRef = useRef<HTMLDivElement | null>(null);
  // Tracks whether the user has scrolled away from the bottom — when true we
  // avoid yanking them back on polled messages.
  const userScrolledUp = useRef(false);

  const memberById = useMemo(
    () => new Map(faction.members.map((m) => [m.playerId, m])),
    [faction.members],
  );

  // Old messages can come from players who have since left the faction.
  const directoryById = useMemo(
    () => new Map(directory.map((entry) => [entry.playerId, entry])),
    [directory],
  );

  const displayName = useCallback((playerId: string): string => {
    const entry = directoryById.get(playerId);
    return memberById.get(playerId)?.wrestlerName
      ?? entry?.currentWrestler
      ?? entry?.name
      ?? t('factions.redesign.formerMember', 'Former member');
  }, [directoryById, memberById, t]);

  useEffect(() => {
    const controller = new AbortController();
    const loadDirectory = async () => {
      try {
        const entries = await playersApi.getDirectory(controller.signal);
        if (!controller.signal.aborted) setDirectory(entries);
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.warn('Messages tab: directory load failed');
        }
      }
    };
    loadDirectory();
    return () => controller.abort();
  }, []);

  // ─── Initial load: threads + channel first page in parallel ────────
  useEffect(() => {
    const ac = new AbortController();
    setThreadsLoading(true);

    const loadInitial = async () => {
      try {
        const [threadList, channelPage] = await Promise.all([
          factionsApi.directMessages.listMyThreads(faction.stableId, ac.signal),
          factionsApi.messages.list(faction.stableId, { limit: 50 }, ac.signal),
        ]);
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
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Messages tab: initial load failed');
          setFeedError(err.message);
        }
      } finally {
        if (!ac.signal.aborted) setThreadsLoading(false);
      }
    };

    loadInitial();
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

    const loadThread = async () => {
      try {
        const page = await factionsApi.directMessages.listThread(faction.stableId, partnerId, { limit: 50 }, ac.signal);
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
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Messages tab: dm thread fetch failed');
          setFeedError(err.message);
        }
      }
    };

    loadThread();
    return () => ac.abort();
  }, [activeThread, faction.stableId, dmMessages]);

  // ─── Polling ─────────────────────────────────────────────────────
  const pollOnce = useCallback(async () => {
    try {
      // Refresh the conversation list on every tick so new DM threads from
      // partners the user hasn't messaged yet appear without a reload, and
      // so the channel-pin / DM-row previews + unread dots stay current
      // even when a different conversation is active.
      const refreshThreads = async () => {
        try {
          setThreads(await factionsApi.directMessages.listMyThreads(faction.stableId));
        } catch (err) {
          if (err instanceof Error && err.name !== 'AbortError') {
            logger.warn(`Messages tab: thread-list poll failed (${err.message})`);
          }
        }
      };
      void refreshThreads();

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
    const last = activeFeed[activeFeed.length - 1];
    if (!userScrolledUp.current && last) {
      const key = activeThread.type === 'channel' ? channelKey : dmKey(activeThread.partnerPlayerId);
      writeLastRead(faction.stableId, key, last.messageId);
      setUnreadTick((tick) => tick + 1);
    }
  };

  // On feed change, also mark as read if user is currently at bottom.
  useEffect(() => {
    const last = activeFeed[activeFeed.length - 1];
    if (!last) return;
    if (userScrolledUp.current) return;
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
          const list: DmDisplayMessage[] = (next.get(partnerId) ?? []).map((m) =>
            m.tempId === tempId
              ? {
                  kind: 'dm' as const,
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
    const last = channelMessages[0]; // newest first from repo
    if (!last) return false;
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

  const partnerName = activeThread.type === 'dm' ? displayName(activeThread.partnerPlayerId) : '';

  const headerContext = activeThread.type === 'channel'
    ? t('factions.messages.headerChannel', 'FACTION-WIDE CHANNEL · {{count}} members', {
        count: faction.memberIds.length,
      })
    : t('factions.messages.headerDm', 'DIRECT · {{name}}', { name: partnerName });

  const composerPlaceholder = activeThread.type === 'channel'
    ? t('factions.messages.composerChannelPlaceholder', 'Message the faction…')
    : t('factions.messages.composerDmPlaceholder', 'Message {{name}}…', { name: partnerName });

  const openThread = (thread: ActiveThread) => {
    setActiveThread(thread);
    setListOpenOnMobile(false);
  };

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
          {!isSelf && <Avatar src={author?.imageUrl} name={displayName(m.authorPlayerId)} size="sm" />}
          <div className="faction-messages__bubble-body">
            {!isSelf && (
              <span className="faction-messages__bubble-author">
                {displayName(m.authorPlayerId)}
              </span>
            )}
            <p className="faction-messages__bubble-text">{m.body}</p>
            <span className="group-muted">{formatTime(m.createdAt)}</span>
            {m.hasError && (
              <Button variant="ghost" size="sm" onClick={() => handleRetry(m)}>
                {t('factions.messages.retry', 'Retry')}
              </Button>
            )}
          </div>
        </div>,
      );
    }
    return out;
  };

  return (
    <div className={`faction-messages ${listOpenOnMobile ? 'faction-messages--list-open' : ''}`}>
      <aside className="faction-messages__list">
        <button
          type="button"
          className={`faction-messages__channel-pin ${
            activeThread.type === 'channel' ? 'faction-messages__channel-pin--active' : ''
          }`}
          onClick={() => openThread({ type: 'channel' })}
        >
          <span className="group-person__text">
            <span className="group-person__name">{t('factions.messages.channelLabel', 'FACTION-WIDE')}</span>
            <span className="faction-messages__preview">
              {channelMessages[0]
                ? channelMessages[0].body.slice(0, 60)
                : t('factions.messages.channelEmpty', 'No messages yet.')}
            </span>
          </span>
          {isChannelUnread && (
            <span
              className="faction-messages__unread-dot"
              role="img"
              aria-label={t('factions.redesign.unread', 'Unread')}
            />
          )}
        </button>

        <label className="group-search faction-messages__search">
          <span className="sr-only">{t('factions.messages.searchLabel', 'Search threads')}</span>
          <input
            type="search"
            placeholder={t('factions.messages.searchPlaceholder', 'Search…')}
            value={threadFilter}
            onChange={(event) => setThreadFilter(event.target.value)}
          />
        </label>

        <h3 className="group-subheading">{t('factions.messages.dmsSection', 'Direct Messages')}</h3>

        {threadsLoading ? (
          <Skeleton variant="block" count={2} />
        ) : visibleThreads.length === 0 ? (
          <p className="group-empty">{t('factions.messages.dmsEmpty', 'No direct-message threads yet.')}</p>
        ) : (
          <ul className="faction-messages__threads">
            {visibleThreads.map((thread) => {
              const isActive =
                activeThread.type === 'dm' && activeThread.partnerPlayerId === thread.partnerPlayerId;
              const threadName = thread.partnerWrestlerName
                ?? thread.partnerPlayerName
                ?? displayName(thread.partnerPlayerId);
              return (
                <li key={thread.partnerPlayerId}>
                  <button
                    type="button"
                    className={`faction-messages__thread-row ${isActive ? 'faction-messages__thread-row--active' : ''}`}
                    onClick={() => openThread({ type: 'dm', partnerPlayerId: thread.partnerPlayerId })}
                  >
                    <Avatar src={thread.partnerImageUrl} name={threadName} size="sm" />
                    <span className="group-person__text faction-messages__thread-text">
                      <span className="group-person__name">{threadName}</span>
                      <span className="faction-messages__preview">{thread.lastMessage?.body.slice(0, 40) ?? ''}</span>
                    </span>
                    <span className="group-muted">{formatTime(thread.lastMessageAt)}</span>
                    {isThreadUnread(thread) && (
                      <span
                        className="faction-messages__unread-dot"
                        role="img"
                        aria-label={t('factions.redesign.unread', 'Unread')}
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {newDmCandidates.length > 0 && (
          <div className="faction-messages__new-dm">
            <Button
              variant="ghost"
              size="sm"
              icon={<Plus aria-hidden="true" size={16} />}
              aria-haspopup="menu"
              aria-expanded={newDmOpen}
              onClick={() => setNewDmOpen((open) => !open)}
            >
              {t('factions.redesign.newDm', 'New DM')}
            </Button>
            {newDmOpen && (
              <ul role="menu" className="faction-messages__new-dm-list">
                {newDmCandidates.map((member) => (
                  <li key={member.playerId} role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className="faction-messages__new-dm-item"
                      onClick={() => {
                        setNewDmOpen(false);
                        openThread({ type: 'dm', partnerPlayerId: member.playerId });
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

      <section className="faction-messages__thread" aria-live="polite">
        <header className="faction-messages__thread-header">
          <Button
            variant="ghost"
            size="sm"
            className="faction-messages__back"
            icon={<ArrowLeft aria-hidden="true" size={16} />}
            onClick={() => setListOpenOnMobile(true)}
          >
            {t('factions.redesign.conversations', 'Conversations')}
          </Button>
          <span className="group-person__name">{headerContext}</span>
          <Badge
            tone="primary"
            aria-label={t('factions.messages.audienceAria', 'Audience: {{label}}', { label: audiencePill })}
          >
            {audiencePill}
          </Badge>
        </header>

        {feedError && (
          <p className="group-error" role="alert">
            {t('factions.messages.feedError', 'Could not load messages.')}: {feedError}
          </p>
        )}

        <div className="faction-messages__feed" ref={feedRef} onScroll={handleFeedScroll}>
          {activeFeed.length === 0 ? (
            <p className="group-empty">{t('factions.messages.feedEmpty', 'No messages yet — start the conversation.')}</p>
          ) : (
            renderFeed()
          )}
        </div>

        <div className="faction-messages__composer">
          <textarea
            className="faction-messages__composer-input"
            placeholder={composerPlaceholder}
            value={composer}
            onChange={(event) => setComposer(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            rows={1}
            aria-label={composerPlaceholder}
          />
          <Button disabled={posting || composer.trim().length === 0} onClick={() => handleSend()}>
            {t('factions.messages.send', 'Send')}
          </Button>
        </div>
      </section>
    </div>
  );
}
