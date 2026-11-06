import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Flame, Mic, MessageSquare, Swords } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { playersApi, rivalriesApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import type { Player } from '../../types';
import type {
  Rivalry,
  RivalryActivityItem,
  RivalryHeat,
} from '../../types/rivalry';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import Tabs from '../ui/Tabs';
import { useToast } from '../ui/toastContext';
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

// Chips map to a set of tier names (RIV-21 widened to 5 tiers, but the
// hub chips stay grouped into the same three buckets so the filter UI
// doesn't sprout new buttons mid-rollout).
const CHIP_TO_HEAT: Record<Exclude<ChipId, 'all'>, ReadonlyArray<RivalryHeat>> = {
  heated: ['hot', 'scorching'],
  brewing: ['warm'],
  slowBurn: ['cold', 'frozen'],
};

const ACTIVITY_PAGE_SIZE = 25;

const ACTIVITY_ICONS: Record<RivalryActivityItem['kind'], LucideIcon> = {
  message: MessageSquare,
  promo: Mic,
  match: Swords,
  note: FileText,
};

export default function RivalryHub() {
  const { t } = useTranslation();
  const { isAuthenticated, playerId, isAdminOrModerator } = useAuth();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const requested = searchParams.get('tab');
    return requested === 'mine' || requested === 'archive' ? requested : 'active';
  });
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // One-shot bootstrap of players. (Events pre-fetch removed along
  // with the hidden Episode dropdown.)
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const playerList = await playersApi.getAll(controller.signal);
        if (!controller.signal.aborted) setPlayers(playerList);
      } catch {
        // Cards fall back to ids and initials.
      }
    };
    void load();
    return () => controller.abort();
  }, []);

  // Refetch rivalry grid whenever the active scope changes.
  useEffect(() => {
    const params: Parameters<typeof rivalriesApi.list>[0] = { eventId };
    if (activeTab === 'active') params.status = 'active';
    if (activeTab === 'archive') params.status = 'completed';
    if (activeTab === 'mine') {
      if (!playerId) {
        // Unauthenticated visitor can't see "mine".
        setRivalries([]);
        setLoading(false);
        return;
      }
      params.participantId = playerId;
    }

    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await rivalriesApi.list(params, controller.signal);
        if (!controller.signal.aborted) setRivalries(res.rivalries);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [activeTab, eventId, playerId, reloadKey]);

  // Activity feed is independent of tab; it follows participantId + eventId.
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setActivityLoading(true);
      try {
        const res = await rivalriesApi.getActivity(
          {
            participantId: activeTab === 'mine' && playerId ? playerId : undefined,
            eventId,
            limit: ACTIVITY_PAGE_SIZE,
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setActivity(res.items);
        setActivityCursor(res.nextCursor);
      } catch {
        // The activity column shows its empty state.
      } finally {
        if (!controller.signal.aborted) setActivityLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [activeTab, eventId, playerId]);

  const filtered = useMemo(() => {
    if (activeChip === 'all') return rivalries;
    const tiers = CHIP_TO_HEAT[activeChip];
    return rivalries.filter((r) => tiers.includes(r.heat));
  }, [rivalries, activeChip]);

  const loadMoreActivity = async () => {
    if (!activityCursor) return;
    setLoadingMore(true);
    try {
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
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  const tabs: TabId[] = isAuthenticated ? ['active', 'mine', 'archive'] : ['active', 'archive'];

  const renderGrid = () => {
    if (loading) return <Skeleton variant="cards" count={4} />;
    if (error) {
      return (
        <EmptyState
          title={t('rivalries.hub.loadError', { defaultValue: 'Could not load rivalries' })}
          description={error}
          actionLabel={t('common.retry', { defaultValue: 'Retry' })}
          onAction={() => setReloadKey((key) => key + 1)}
        />
      );
    }
    if (filtered.length === 0) {
      return <EmptyState icon={<Flame aria-hidden="true" />} title={t('rivalries.hub.empty')} />;
    }
    return (
      <div className="rivalry-hub__grid">
        {filtered.map((rivalry) => (
          <RivalryCard
            key={rivalry.rivalryId}
            rivalry={rivalry}
            participants={players}
            lastActivityAt={rivalry.updatedAt}
          />
        ))}
      </div>
    );
  };

  const renderActivity = () => {
    if (activityLoading) return <p className="rivalry-hub__activity-note">{t('rivalries.hub.activityLoading')}</p>;
    if (activity.length === 0) return <p className="rivalry-hub__activity-note">{t('rivalries.hub.activityEmpty')}</p>;
    return (
      <>
        <ul className="rivalry-hub__activity-list">
          {activity.map((item) => {
            const Icon = ACTIVITY_ICONS[item.kind];
            return (
              <li key={activityKey(item)} className="rivalry-hub__activity-row">
                <Icon className="rivalry-hub__activity-icon" aria-hidden="true" size={18} />
                <span className="rivalry-hub__activity-text">
                  <span className="rivalry-hub__activity-kind">{t(`rivalries.activityKind.${item.kind}`)}</span>
                  <span className="rivalry-hub__activity-time">{new Date(item.occurredAt).toLocaleString()}</span>
                </span>
                <Link to={`/rivalries/${item.rivalryId}`} className="rivalry-hub__activity-link">
                  {t('rivalries.hub.viewRivalry')}
                </Link>
              </li>
            );
          })}
        </ul>
        {activityCursor && (
          <Button variant="ghost" size="sm" fullWidth loading={loadingMore} onClick={loadMoreActivity}>
            {t('rivalries.hub.loadMore')}
          </Button>
        )}
      </>
    );
  };

  return (
    <div className="rivalry-hub">
      <PageHeader
        title={t('rivalries.hub.heading')}
        subtitle={t('rivalries.hub.tagline')}
        actions={isAdminOrModerator ? <Button to="/rivalries/new">{t('rivalries.hub.requestCta')}</Button> : undefined}
      />

      <div className="rivalry-hub__filters">
        <Tabs
          label={t('rivalries.hub.heading')}
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as TabId)}
          items={tabs.map((id) => ({ value: id, label: t(TAB_LABEL[id]) }))}
        />
        <div className="rivalry-hub__chips" role="group" aria-label={t('rivalries.hub.heatFilter', { defaultValue: 'Filter by heat' })}>
          {(['all', 'heated', 'brewing', 'slowBurn'] as ChipId[]).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={activeChip === id}
              className={`rivalry-hub__chip ${activeChip === id ? 'is-active' : ''}`}
              onClick={() => setActiveChip(id)}
            >
              {t(CHIP_LABEL[id])}
            </button>
          ))}
        </div>
      </div>

      <div className="rivalry-hub__layout">
        <section aria-busy={loading}>{renderGrid()}</section>
        <aside className="rivalry-hub__activity">
          <h2 className="rivalry-hub__activity-heading">{t('rivalries.hub.activityHeading')}</h2>
          {renderActivity()}
        </aside>
      </div>
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
