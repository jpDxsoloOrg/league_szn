import { useEffect, useMemo, useState } from 'react';
import { Routes, Route, useParams, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { playersApi, rivalriesApi } from '../../services/api';
import type { PlayerDirectoryEntry } from '../../services/api/players.api';
import { useAuth } from '../../contexts/AuthContext';
import type { Player } from '../../types';
import type { HydratedRivalry } from '../../types/rivalry';
import {
  DEFAULT_WRESTLER_IMAGE,
  applyImageFallback,
  resolveImageSrc,
} from '../../constants/imageFallbacks';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import SectionTabs from '../ui/SectionTabs';
import Skeleton from '../ui/Skeleton';
import { useToast } from '../ui/toastContext';
import OverviewTab from './tabs/OverviewTab';
import MatchHistoryTab from './tabs/MatchHistoryTab';
import FutureMatchesTab from './tabs/FutureMatchesTab';
import PromosTab from './tabs/PromosTab';
import NotesPlansTab from './tabs/NotesPlansTab';
import MessagesTab from './tabs/MessagesTab';
import {
  RIVALRY_STATUS_KEY,
  heatScorePercent,
  resolvePlayerCaption,
  resolveWrestlerName,
  withDirectoryPlayers,
} from './rivalryUtils';
import HeatBadge from './HeatBadge';
import './RivalryDetail.css';

const TAB_DEFS: Array<{ id: string; labelKey: string }> = [
  { id: 'overview', labelKey: 'rivalries.detail.overviewTab' },
  { id: 'matches', labelKey: 'rivalries.detail.matchesTab' },
  { id: 'future', labelKey: 'rivalries.detail.futureTab' },
  { id: 'promos', labelKey: 'rivalries.detail.promosTab' },
  { id: 'notes', labelKey: 'rivalries.detail.notesTab' },
  { id: 'messages', labelKey: 'rivalries.detail.messagesTab' },
];

export default function RivalryDetail() {
  const { t } = useTranslation();
  const { rivalryId } = useParams<{ rivalryId: string }>();
  const { showToast } = useToast();
  const { isAdminOrModerator, email, isAuthenticated } = useAuth();
  const [hydrated, setHydrated] = useState<HydratedRivalry | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookerBusy, setBookerBusy] = useState(false);

  useEffect(() => {
    if (!rivalryId) return;
    const controller = new AbortController();
    let mounted = true;
    setLoading(true);
    Promise.all([
      rivalriesApi.get(rivalryId, controller.signal),
      playersApi.getAll(controller.signal).catch(() => [] as Player[]),
      playersApi.getDirectory(controller.signal).catch(() => [] as PlayerDirectoryEntry[]),
    ])
      .then(([res, roster, directory]) => {
        if (!mounted) return;
        setHydrated(res);
        setPlayers(withDirectoryPlayers(roster, directory));
        setError(null);
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
  }, [rivalryId]);

  const playerLookup = useMemo(
    () => new Map(players.map((p) => [p.playerId, p] as const)),
    [players],
  );

  const daysToNext = useMemo(() => {
    if (!hydrated?.nextEvent?.date) return null;
    const ms = new Date(hydrated.nextEvent.date).getTime() - Date.now();
    if (Number.isNaN(ms)) return null;
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  }, [hydrated]);

  const backLink = (
    <Button
      variant="ghost"
      size="sm"
      to="/rivalries"
      icon={<ArrowLeft aria-hidden="true" size={18} />}
      className="rivalry-detail__back"
    >
      {t('rivalries.detail.backToHub')}
    </Button>
  );

  if (loading) {
    return (
      <div className="rivalry-detail">
        <Skeleton variant="block" count={3} />
      </div>
    );
  }

  if (error || !hydrated) {
    return (
      <div className="rivalry-detail">
        {backLink}
        <EmptyState title={t('rivalries.detail.notFound', { defaultValue: 'Rivalry not found' })} description={error ?? undefined} />
      </div>
    );
  }

  const r = hydrated.rivalry;
  const [partA, partB] = r.participants;
  const pidA = partA?.playerId ?? '';
  const pidB = partB?.playerId ?? '';
  const a = playerLookup.get(pidA);
  const b = playerLookup.get(pidB);
  const nameA = resolveWrestlerName(partA, a);
  const nameB = resolveWrestlerName(partB, b);
  const captionA = resolvePlayerCaption(a);
  const captionB = resolvePlayerCaption(b);

  const callerLabel = email?.split('@')[0] ?? '';
  const isBooker = !!r.bookerName && r.bookerName === callerLabel;
  async function updateBooker(bookerName: string) {
    if (!isAdminOrModerator) return;
    setBookerBusy(true);
    try {
      const updated = await rivalriesApi.update(rivalryId!, { bookerName });
      setHydrated((prev) => (prev ? { ...prev, rivalry: updated } : prev));
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBookerBusy(false);
    }
  }

  const winsA = hydrated.headToHead.winsByParticipant[pidA] ?? 0;
  const winsB = hydrated.headToHead.winsByParticipant[pidB] ?? 0;
  const heatPercent = heatScorePercent(r.heatScore);
  const basePath = `/rivalries/${rivalryId}`;
  const tabItems = TAB_DEFS.map((tab) => ({
    to: tab.id === 'overview' ? basePath : `${basePath}/${tab.id}`,
    label: t(tab.labelKey),
  }));

  return (
    <div className="rivalry-detail">
      {backLink}

      <header className="rivalry-detail__hero">
        <div className="rivalry-detail__headline">
          <h1 className="rivalry-detail__title">{r.title}</h1>
          <div className="rivalry-detail__booker">
            {r.status !== 'active' && <Badge>{t(RIVALRY_STATUS_KEY[r.status])}</Badge>}
            {r.bookerName && (
              <span className="rivalry-detail__booker-name">
                {t('rivalries.detail.bookerBadge', { defaultValue: 'Booked by {{name}}', name: r.bookerName })}
              </span>
            )}
            {isAdminOrModerator && isAuthenticated && (
              <Button
                variant="secondary"
                size="sm"
                disabled={bookerBusy || (!isBooker && !callerLabel)}
                onClick={() => updateBooker(isBooker ? '' : callerLabel)}
              >
                {isBooker && t('rivalries.detail.clearBooker', { defaultValue: 'Clear booker' })}
                {!isBooker && r.bookerName && t('rivalries.detail.takeBooker', { defaultValue: 'Take over booking' })}
                {!isBooker && !r.bookerName && t('rivalries.detail.assignBooker', { defaultValue: "I'll book this" })}
              </Button>
            )}
          </div>
        </div>
        <div className="rivalry-detail__faceoff">
          <div className="rivalry-detail__portrait">
            <img
              src={resolveImageSrc(a?.imageUrl, DEFAULT_WRESTLER_IMAGE)}
              alt={nameA}
              loading="lazy"
              decoding="async"
              onError={(e) => applyImageFallback(e, DEFAULT_WRESTLER_IMAGE)}
            />
            <p className="rivalry-detail__name">{nameA}</p>
            {captionA && <p className="rivalry-detail__caption">{captionA}</p>}
          </div>
          <span className="rivalry-detail__vs" aria-hidden="true">VS</span>
          <div className="rivalry-detail__portrait">
            <img
              src={resolveImageSrc(b?.imageUrl, DEFAULT_WRESTLER_IMAGE)}
              alt={nameB}
              loading="lazy"
              decoding="async"
              onError={(e) => applyImageFallback(e, DEFAULT_WRESTLER_IMAGE)}
            />
            <p className="rivalry-detail__name">{nameB}</p>
            {captionB && <p className="rivalry-detail__caption">{captionB}</p>}
          </div>
        </div>
      </header>

      <section className="rivalry-detail__stats">
        <div className="rivalry-detail__stat rivalry-detail__stat--heat">
          <div className="rivalry-detail__heat-top">
            <span className="rivalry-detail__stat-label">
              {t('rivalries.detail.heatMeterLabel', { defaultValue: 'Rivalry Heat' })}
            </span>
            <HeatBadge heat={r.heat} heatScore={r.heatScore} size="sm" />
          </div>
          <progress
            className="rivalry-detail__heat-meter"
            value={heatPercent}
            max={100}
            aria-label={t('rivalries.detail.heatScoreOutOf', { defaultValue: 'Heat: {{score}}/100', score: heatPercent })}
          />
        </div>
        <div className="rivalry-detail__stat">
          <span className="rivalry-detail__stat-label">{t('rivalries.detail.headToHead')}</span>
          <span className="rivalry-detail__stat-value">
            {winsA}W – {winsB}L – {hydrated.headToHead.draws}D
          </span>
        </div>
        <div className="rivalry-detail__stat">
          <span className="rivalry-detail__stat-label">
            {t('rivalries.detail.matchesInRivalry', { defaultValue: 'Matches in Rivalry' })}
          </span>
          <span className="rivalry-detail__stat-value">{hydrated.headToHead.totalMatches}</span>
        </div>
        {daysToNext !== null && (
          <div className="rivalry-detail__stat">
            <span className="rivalry-detail__stat-label">{t('rivalries.detail.nextEvent')}</span>
            <span className="rivalry-detail__stat-value">{daysToNext}d</span>
          </div>
        )}
      </section>

      <SectionTabs items={tabItems} label={r.title} variant="compact" className="rivalry-detail__tabs" />

      <div className="rivalry-detail__content">
        <Routes>
          <Route index element={<OverviewTab hydrated={hydrated} players={players} />} />
          <Route path="matches" element={<MatchHistoryTab hydrated={hydrated} players={players} />} />
          <Route path="future" element={<FutureMatchesTab hydrated={hydrated} players={players} />} />
          <Route path="promos" element={<PromosTab hydrated={hydrated} players={players} />} />
          <Route path="notes" element={<NotesPlansTab hydrated={hydrated} players={players} />} />
          <Route path="messages" element={<MessagesTab hydrated={hydrated} players={players} />} />
          <Route path="*" element={<Navigate to="" replace />} />
        </Routes>
      </div>
    </div>
  );
}
