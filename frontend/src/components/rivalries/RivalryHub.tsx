import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { playersApi, rivalriesApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import type { Player } from '../../types';
import type {
  Rivalry,
  RivalryActivityItem,
  RivalryHeat,
} from '../../types/rivalry';
import RivalryCard from './RivalryCard';
import './RivalryHub.css';

type TabId = 'active' | 'mine' | 'archive';
type ChipId = 'all' | 'heated' | 'brewing' | 'slowBurn';

const TAB_LABEL: Record<TabId, string> = {
  active: 'rivalries.hub.tabs.active',
  mine: 'rivalries.hub.tabs.mine',
  archive: 'rivalries.hub.tabs.archive',
};

const CHIP_LABEL: Record<ChipId, string> = {
  all: 'rivalries.hub.chips.all',
  heated: 'rivalries.hub.chips.heated',
  brewing: 'rivalries.hub.chips.brewing',
  slowBurn: 'rivalries.hub.chips.slowBurn',
};

const CHIP_TO_HEAT: Record<Exclude<ChipId, 'all'>, RivalryHeat> = {
  heated: 'hot',
  brewing: 'warm',
  slowBurn: 'cold',
};

const ACTIVITY_PAGE_SIZE = 25;

const ACTIVITY_ICONS: Record<'message' | 'promo' | 'match' | 'note', string> = {
  message: '💬',
  promo: '🎤',
  match: '🥊',
  note: '📝',
};

export default function RivalryHub() {
  const { t } = useTranslation();
  const { isAuthenticated, playerId, isAdminOrModerator } = useAuth();

  const [activeTab, setActiveTab] = useState<TabId>('active');
  const [activeChip, setActiveChip] = useState<ChipId>('all');
  // Episode dropdown is hidden for now; the Hub defaults to "All
  // Episodes" (eventId stays undefined).
  const eventId: string | undefined = undefined;
  const [players, setPlayers] = useState<Player[]>([]);
  const [rivalries, setRivalries] = useState<Rivalry[]>([]);
  const [activity, setActivity] = useState<RivalryActivityItem[]>([]);
  const [activityCursor, setActivityCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // One-shot bootstrap of players. (Events pre-fetch removed along
  // with the hidden Episode dropdown.)
  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    playersApi
      .getAll(controller.signal)
      .then((playerList) => mounted && setPlayers(playerList))
      .catch(() => undefined);
    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  // Refetch rivalry grid whenever the active scope changes.
  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    setLoading(true);
    setError(null);

    const params: Parameters<typeof rivalriesApi.list>[0] = { eventId };
    if (activeTab === 'active') params.status = 'active';
    if (activeTab === 'archive') params.status = 'completed';
    if (activeTab === 'mine') {
      if (!playerId) {
        // Unauthenticated visitor can't see "mine".
        if (mounted) {
          setRivalries([]);
          setLoading(false);
        }
        return;
      }
      params.participantId = playerId;
    }

    rivalriesApi
      .list(params, controller.signal)
      .then((res) => {
        if (!mounted) return;
        setRivalries(res.rivalries);
      })
      .catch((err: Error) => {
        if (mounted && err.name !== 'AbortError') setError(err.message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [activeTab, eventId, playerId]);

  // Activity feed is independent of tab; it follows participantId + eventId.
  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    setActivityLoading(true);
    rivalriesApi
      .getActivity(
        {
          participantId: activeTab === 'mine' && playerId ? playerId : undefined,
          eventId,
          limit: ACTIVITY_PAGE_SIZE,
        },
        controller.signal,
      )
      .then((res) => {
        if (!mounted) return;
        setActivity(res.items);
        setActivityCursor(res.nextCursor);
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setActivityLoading(false);
      });
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [activeTab, eventId, playerId]);

  const filtered = useMemo(() => {
    if (activeChip === 'all') return rivalries;
    const heat = CHIP_TO_HEAT[activeChip];
    return rivalries.filter((r) => r.heat === heat);
  }, [rivalries, activeChip]);

  const loadMoreActivity = async () => {
    if (!activityCursor) return;
    const res = await rivalriesApi.getActivity({
      participantId: activeTab === 'mine' && playerId ? playerId : undefined,
      eventId,
      limit: ACTIVITY_PAGE_SIZE,
      cursor: activityCursor,
    });
    // Dedupe defensively in case of ties at the cursor boundary.
    setActivity((prev) => {
      const seen = new Set(prev.map(activityKey));
      const merged = [...prev];
      for (const item of res.items) {
        const k = activityKey(item);
        if (!seen.has(k)) {
          merged.push(item);
          seen.add(k);
        }
      }
      return merged;
    });
    setActivityCursor(res.nextCursor);
  };

  const tabs: TabId[] = isAuthenticated ? ['active', 'mine', 'archive'] : ['active', 'archive'];

  return (
    <div className="rivalry-hub">
      <header className="rivalry-hub__header">
        <div>
          <h1 className="rivalry-hub__title">{t('rivalries.hub.heading')}</h1>
          <p className="rivalry-hub__tagline">{t('rivalries.hub.tagline')}</p>
        </div>
        <div className="rivalry-hub__header-actions">
          {/* Episode dropdown is hidden for now; the Hub defaults to All
              Episodes. Re-enable by restoring this block when episodes
              are reintroduced to the storyline timeline. */}
          {isAdminOrModerator && (
            <Link to="/rivalries/new" className="rivalry-hub__cta">
              {t('rivalries.hub.requestCta')}
            </Link>
          )}
        </div>
      </header>

      <nav className="rivalry-hub__tabs" role="tablist">
        {tabs.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            className={`rivalry-hub__tab ${activeTab === id ? 'is-active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            {t(TAB_LABEL[id])}
          </button>
        ))}
      </nav>

      <div className="rivalry-hub__chips" role="toolbar">
        {(['all', 'heated', 'brewing', 'slowBurn'] as ChipId[]).map((id) => (
          <button
            key={id}
            type="button"
            className={`rivalry-hub__chip ${activeChip === id ? 'is-active' : ''}`}
            onClick={() => setActiveChip(id)}
          >
            {t(CHIP_LABEL[id])}
          </button>
        ))}
      </div>

      {error && <div className="rivalry-hub__error">{error}</div>}

      <section className="rivalry-hub__grid" aria-busy={loading}>
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rivalry-hub__skeleton" />
            ))
          : filtered.length === 0
          ? <div className="rivalry-hub__empty">{t('rivalries.hub.empty')}</div>
          : filtered.map((r) => (
              <RivalryCard
                key={r.rivalryId}
                rivalry={r}
                participants={players}
                matchCount={0}
                lastActivityAt={r.updatedAt}
              />
            ))}
      </section>

      <section className="rivalry-hub__activity">
        <h2 className="rivalry-hub__activity-heading">
          {t('rivalries.hub.activityHeading')}
        </h2>
        {activityLoading ? (
          <div className="rivalry-hub__activity-empty">
            {t('rivalries.hub.activityLoading')}
          </div>
        ) : activity.length === 0 ? (
          <div className="rivalry-hub__activity-empty">
            {t('rivalries.hub.activityEmpty')}
          </div>
        ) : (
          <>
            <ul className="rivalry-hub__activity-list">
              {activity.map((item) => (
                <li key={activityKey(item)} className="rivalry-hub__activity-row">
                  <span
                    className={`rivalry-hub__activity-icon rivalry-hub__activity-icon--${item.kind}`}
                    aria-hidden="true"
                  >
                    {ACTIVITY_ICONS[item.kind]}
                  </span>
                  <span className={`rivalry-hub__activity-kind rivalry-hub__activity-kind--${item.kind}`}>
                    {t(`rivalries.activityKind.${item.kind}`)}
                  </span>
                  <span className="rivalry-hub__activity-time">
                    {new Date(item.occurredAt).toLocaleString()}
                  </span>
                  <Link
                    to={`/rivalries/${item.rivalryId}`}
                    className="rivalry-hub__activity-link"
                  >
                    {t('rivalries.hub.viewRivalry')}
                  </Link>
                </li>
              ))}
            </ul>
            {activityCursor && (
              <button
                type="button"
                className="rivalry-hub__activity-more"
                onClick={loadMoreActivity}
              >
                {t('rivalries.hub.loadMore')}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function activityKey(item: RivalryActivityItem): string {
  switch (item.kind) {
    case 'message': return `m:${item.messageId}`;
    case 'note': return `n:${item.noteId}`;
    case 'match': return `x:${item.matchId}`;
    case 'promo': return `p:${item.promoId}`;
  }
}
