import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { rivalriesApi } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import type { Player } from '../../../types';
import type {
  HydratedRivalry,
  RivalryMessage,
  RivalryMessageAudience,
} from '../../../types/rivalry';

interface TabProps {
  hydrated: HydratedRivalry;
  players: Player[];
}

interface ThreadEntry {
  message: RivalryMessage;
  state: 'confirmed' | 'sending' | 'failed';
  localKey: string;
}

const POLL_MS = 15_000;

/**
 * Messages tab (RIV-12). Polls every 15s when visible, supports
 * optimistic send with rollback, and a per-message + thread-default
 * audience toggle. Real-time transport (websockets) is intentionally
 * deferred per the project's known-limitations list.
 */
export default function MessagesTab({ hydrated, players }: TabProps) {
  const { t } = useTranslation();
  const { playerId } = useAuth();
  const rivalryId = hydrated.rivalry.rivalryId;
  const lookup = useMemo(() => new Map(players.map((p) => [p.playerId, p] as const)), [players]);

  const [entries, setEntries] = useState<ThreadEntry[]>([]);
  const [loopInOpponent, setLoopInOpponent] = useState(true);
  const [composer, setComposer] = useState('');
  const [composerAudienceOverride, setComposerAudienceOverride] = useState(false);
  const lastFetchRef = useRef<number>(0);

  const defaultAudience: RivalryMessageAudience = loopInOpponent ? 'participants' : 'admins';
  const effectiveAudience: RivalryMessageAudience = composerAudienceOverride
    ? (defaultAudience === 'admins' ? 'participants' : 'admins')
    : defaultAudience;

  const refresh = useCallback(async () => {
    lastFetchRef.current = Date.now();
    const res = await rivalriesApi.messages.list(rivalryId).catch(() => null);
    if (!res) return;
    const confirmed = res.messages.map<ThreadEntry>((m) => ({
      message: m,
      state: 'confirmed',
      localKey: m.messageId,
    }));
    // Preserve in-flight optimistic entries that haven't been confirmed.
    setEntries((prev) => {
      const optimistic = prev.filter((e) => e.state !== 'confirmed');
      const seen = new Set(confirmed.map((e) => e.message.messageId));
      const stillPending = optimistic.filter((e) => !seen.has(e.message.messageId));
      return [...confirmed, ...stillPending];
    });
  }, [rivalryId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Page Visibility-aware polling.
  useEffect(() => {
    let active = !document.hidden;
    const tick = () => {
      if (!active) return;
      // Skip if a manual fetch happened recently.
      if (Date.now() - lastFetchRef.current < POLL_MS / 2) return;
      refresh();
    };
    const id = setInterval(tick, POLL_MS);
    const onVis = () => {
      active = !document.hidden;
      if (active) refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refresh]);

  async function send() {
    const body = composer.trim();
    if (!body) return;
    const localKey = `local-${Date.now()}`;
    const optimistic: ThreadEntry = {
      message: {
        rivalryId,
        messageId: localKey,
        authorPlayerId: playerId ?? 'self',
        body,
        audience: effectiveAudience,
        createdAt: new Date().toISOString(),
      },
      state: 'sending',
      localKey,
    };
    setEntries((prev) => [...prev, optimistic]);
    setComposer('');
    setComposerAudienceOverride(false);

    try {
      const res = await rivalriesApi.messages.post(rivalryId, body, effectiveAudience);
      setEntries((prev) =>
        prev.map((e) =>
          e.localKey === localKey
            ? { message: res.message, state: 'confirmed', localKey: res.message.messageId }
            : e,
        ),
      );
    } catch {
      setEntries((prev) =>
        prev.map((e) => (e.localKey === localKey ? { ...e, state: 'failed' } : e)),
      );
    }
  }

  async function retry(localKey: string) {
    const entry = entries.find((e) => e.localKey === localKey);
    if (!entry) return;
    setEntries((prev) =>
      prev.map((e) => (e.localKey === localKey ? { ...e, state: 'sending' } : e)),
    );
    try {
      const res = await rivalriesApi.messages.post(
        rivalryId,
        entry.message.body,
        entry.message.audience,
      );
      setEntries((prev) =>
        prev.map((e) =>
          e.localKey === localKey
            ? { message: res.message, state: 'confirmed', localKey: res.message.messageId }
            : e,
        ),
      );
    } catch {
      setEntries((prev) =>
        prev.map((e) => (e.localKey === localKey ? { ...e, state: 'failed' } : e)),
      );
    }
  }

  const sorted = [...entries].sort((a, b) =>
    a.message.createdAt < b.message.createdAt ? -1 : 1,
  );

  return (
    <div className="rivalry-tab rivalry-messages">
      <aside className="rivalry-messages__rail">
        <div className="rivalry-tab__card">
          <h3 className="rivalry-tab__heading">Participants</h3>
          <ul>
            {hydrated.rivalry.participants.map((p) => {
              const player = lookup.get(p.playerId);
              return (
                <li key={p.playerId} className="rivalry-messages__participant">
                  <span className="rivalry-messages__dot" aria-hidden="true" />
                  <span>{player?.currentWrestler ?? player?.name ?? p.playerId}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rivalry-tab__card">
          <h3 className="rivalry-tab__heading">Settings</h3>
          <label className="rivalry-messages__toggle">
            <input
              type="checkbox"
              checked={loopInOpponent}
              onChange={(e) => setLoopInOpponent(e.target.checked)}
            />
            <span>Loop in opponent</span>
          </label>
          <p className="rivalry-detail__hint">
            {defaultAudience === 'admins'
              ? 'Messages are private between you and the GMs.'
              : 'Messages are visible to your opponent and the GMs.'}
          </p>
        </div>
      </aside>

      <section className="rivalry-messages__thread">
        {sorted.length === 0 ? (
          <p className="rivalry-tab__empty">{t('rivalries.messages.empty')}</p>
        ) : (
          <ul className="rivalry-messages__list">
            {sorted.map((entry) => {
              const m = entry.message;
              const isSelf = m.authorPlayerId === playerId;
              const isSystem = m.authorPlayerId === 'system';
              const author = lookup.get(m.authorPlayerId);
              return (
                <li
                  key={entry.localKey}
                  className={
                    isSystem
                      ? 'rivalry-messages__row rivalry-messages__row--system'
                      : isSelf
                      ? 'rivalry-messages__row rivalry-messages__row--self'
                      : 'rivalry-messages__row'
                  }
                >
                  {!isSystem && (
                    <header className="rivalry-messages__row-meta">
                      <span>{author?.currentWrestler ?? author?.name ?? m.authorPlayerId}</span>
                      <span>{new Date(m.createdAt).toLocaleString()}</span>
                      {m.audience === 'admins' && (
                        <span className="rivalry-messages__audience" title="GMs only">
                          🔒
                        </span>
                      )}
                    </header>
                  )}
                  <p>{m.body}</p>
                  {entry.state === 'sending' && (
                    <span className="rivalry-messages__sending">…sending</span>
                  )}
                  {entry.state === 'failed' && (
                    <button
                      type="button"
                      className="rivalry-messages__retry"
                      onClick={() => retry(entry.localKey)}
                    >
                      Failed — retry
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <form
          className="rivalry-messages__composer"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            rows={3}
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            placeholder={t('rivalries.messages.placeholder')}
          />
          <div className="rivalry-messages__composer-bar">
            <label className="rivalry-messages__toggle">
              <input
                type="checkbox"
                checked={composerAudienceOverride}
                onChange={(e) => setComposerAudienceOverride(e.target.checked)}
              />
              <span>Override audience</span>
            </label>
            <span className="rivalry-messages__effective">
              {effectiveAudience === 'admins' ? 'GMs only' : 'Loop in opponent'}
            </span>
            <button type="submit" disabled={!composer.trim()}>
              {t('rivalries.messages.send')}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
