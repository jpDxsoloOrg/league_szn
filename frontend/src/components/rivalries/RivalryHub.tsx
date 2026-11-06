import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Flame, Mic, MessageSquare, Swords } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { playersApi, rivalriesApi } from '../../services/api';
import type { PlayerDirectoryEntry } from '../../services/api/players.api';
import { useAuth } from '../../contexts/AuthContext';
import type { Player } from '../../types';
import { formatMatchDate } from '../../utils/dateUtils';
import type {
  Rivalry,
  RivalryActivityItem,
  RivalryHeat,
} from '../../types/rivalry';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import Select from '../ui/Select';
import Tabs from '../ui/Tabs';
import { useToast } from '../ui/toastContext';
import RivalryCard from './RivalryCard';
import { withDirectoryPlayers } from './rivalryUtils';
import './RivalryHub.css';

type TabId = 'active' | 'mine' | 'archive';
type ChipId = 'all' | 'heated' | 'brewing' | 'slowBurn';

const TAB_LABEL: Record<TabId, string> = {
  active: 'rivalries.hub.tabs.active',
  mine: 'rivalries.hub.tabs.mine',
  archive: 'rivalries.hub.tabs.archive',
};

const CHIPS: ChipId[] = ['all', 'heated', 'brewing', 'slowBurn'];

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
/** The feed backs up the rivalries, so only the latest few show until asked for. */
const ACTIVITY_SHOWN = 4;
const NOTE_EXCERPT_LENGTH = 80;

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
  const [activityExpanded, setActivityExpanded] = useState(false);
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
        const [playerList, directory] = await Promise.all([
          playersApi.getAll(controller.signal),
          playersApi.getDirectory(controller.signal).catch(() => [] as PlayerDirectoryEntry[]),
        ]);
        if (!controller.signal.aborted) setPlayers(withDirectoryPlayers(playerList, directory));
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

  const nameOf = useMemo(() => {
    const names = new Map(players.map((player) => [player.playerId, player.currentWrestler || player.name]));
    return (playerId: string) => names.get(playerId) || t('common.unknown');
  }, [players, t]);

  // A card's date is its latest story beat, which the feed already knows.
  const lastActivityByRivalry = useMemo(() => {
    const latest = new Map<string, string>();
    for (const item of activity) {
      const current = latest.get(item.rivalryId);
      if (!current || item.occurredAt > current) latest.set(item.rivalryId, item.occurredAt);
    }
    return latest;
  }, [activity]);

  const describeActivity = (item: RivalryActivityItem): string => {
    switch (item.kind) {
      case 'match': {
        const winners = item.winners ?? [];
        const losers = item.participants.filter((playerId) => !winners.includes(playerId));
        const names = item.participants.map(nameOf).join(` ${t('common.vs')} `);
        if (winners.length === 0) return t('rivalries.hub.activityMatch', { names });
        if (losers.length === 0) return t('rivalries.hub.activityDraw', { names });
        return t('rivalries.hub.activityBeat', {
          winner: winners.map(nameOf).join(' & '),
          loser: losers.map(nameOf).join(' & '),
        });
      }
      case 'promo':
        return item.title
          ? t('rivalries.hub.activityPromoTitled', { name: nameOf(item.authorPlayerId), title: item.title })
          : t('rivalries.hub.activityPromo', { name: nameOf(item.authorPlayerId) });
      case 'note': {
        const excerpt = item.body.length > NOTE_EXCERPT_LENGTH ? `${item.body.slice(0, NOTE_EXCERPT_LENGTH)}…` : item.body;
        return t('rivalries.hub.activityNote', { text: excerpt });
      }
      case 'message':
        return t('rivalries.hub.activityMessage', { name: nameOf(item.authorPlayerId) });
    }
  };

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
      return (
        <EmptyState
          icon={<Flame aria-hidden="true" />}
          title={t(rivalries.length === 0 ? 'rivalries.hub.noneYet' : 'rivalries.hub.empty')}
        />
      );
    }
    return (
      <div className="rivalry-hub__grid">
        {filtered.map((rivalry) => (
          <RivalryCard
            key={rivalry.rivalryId}
            rivalry={rivalry}
            participants={players}
            lastActivityAt={lastActivityByRivalry.get(rivalry.rivalryId) ?? rivalry.updatedAt}
          />
        ))}
      </div>
    );
  };

  const renderActivity = () => {
    if (activityLoading) return <p className="rivalry-hub__activity-note">{t('rivalries.hub.activityLoading')}</p>;
    if (activity.length === 0) return <p className="rivalry-hub__activity-note">{t('rivalries.hub.activityEmpty')}</p>;
    const shown = activityExpanded ? activity : activity.slice(0, ACTIVITY_SHOWN);
    const canExpand = !activityExpanded && activity.length > ACTIVITY_SHOWN;
    return (
      <>
        <ul className="rivalry-hub__activity-list">
          {shown.map((item) => {
            const Icon = ACTIVITY_ICONS[item.kind];
            return (
              <li key={activityKey(item)}>
                <Link to={`/rivalries/${item.rivalryId}`} className="rivalry-hub__activity-row">
                  <Icon className="rivalry-hub__activity-icon" aria-hidden="true" size={18} />
                  <span className="rivalry-hub__activity-text">{describeActivity(item)}</span>
                  <time className="rivalry-hub__activity-time" dateTime={item.occurredAt}>
                    {formatMatchDate(item.occurredAt, undefined, { month: 'short', day: 'numeric' })}
                  </time>
                </Link>
              </li>
            );
          })}
        </ul>
        {(canExpand || activityCursor) && (
          <Button
            variant="ghost"
            size="sm"
            loading={loadingMore}
            onClick={canExpand ? () => setActivityExpanded(true) : loadMoreActivity}
          >
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
        <Select
          className="rivalry-hub__heat"
          label={t('rivalries.hub.heatFilter', { defaultValue: 'Filter by heat' })}
          value={activeChip}
          onValueChange={(value) => setActiveChip(value as ChipId)}
          options={CHIPS.map((id) => ({ value: id, label: t(CHIP_LABEL[id]) }))}
        />
      </div>

      <div className="rivalry-hub__layout">
        <section aria-busy={loading}>{renderGrid()}</section>
        <aside className="rivalry-hub__activity" aria-labelledby="rivalry-hub-activity">
          <h2 id="rivalry-hub-activity" className="rivalry-hub__activity-heading">{t('rivalries.hub.activityHeading')}</h2>
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
