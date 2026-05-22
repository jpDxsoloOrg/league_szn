import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Routes, Route, useParams, useNavigate, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { playersApi, rivalriesApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import type { Player } from '../../types';
import type { HydratedRivalry, RivalryStatus } from '../../types/rivalry';
import {
  DEFAULT_WRESTLER_IMAGE,
  applyImageFallback,
  resolveImageSrc,
} from '../../constants/imageFallbacks';
import OverviewTab from './tabs/OverviewTab';
import MatchHistoryTab from './tabs/MatchHistoryTab';
import FutureMatchesTab from './tabs/FutureMatchesTab';
import PromosTab from './tabs/PromosTab';
import NotesPlansTab from './tabs/NotesPlansTab';
import MessagesTab from './tabs/MessagesTab';
import { resolveWrestlerName } from './rivalryUtils';
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

const STATUS_KEY: Record<RivalryStatus, string> = {
  pending: 'rivalries.status.pending',
  active: 'rivalries.status.active',
  completed: 'rivalries.status.completed',
  rejected: 'rivalries.status.rejected',
  cancelled: 'rivalries.status.cancelled',
};

export default function RivalryDetail() {
  const { t } = useTranslation();
  const { rivalryId } = useParams<{ rivalryId: string }>();
  const navigate = useNavigate();
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
    ])
      .then(([res, p]) => {
        if (!mounted) return;
        setHydrated(res);
        setPlayers(p);
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

  if (loading) {
    return (
      <div className="rivalry-detail">
        <div className="rivalry-detail__hero rivalry-detail__hero--skeleton" />
        <div className="rivalry-detail__stats rivalry-detail__stats--skeleton" />
      </div>
    );
  }

  if (error || !hydrated) {
    return (
      <div className="rivalry-detail">
        <Link to="/rivalries" className="rivalry-detail__back">
          ← {t('rivalries.detail.backToHub')}
        </Link>
        <p className="rivalry-detail__error">{error ?? 'Not found'}</p>
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

  const callerLabel = email ? email.split('@')[0] : '';
  const isBooker = !!r.bookerName && r.bookerName === callerLabel;
  async function assignSelfAsBooker() {
    if (!isAdminOrModerator || !callerLabel) return;
    setBookerBusy(true);
    try {
      const updated = await rivalriesApi.update(rivalryId!, { bookerName: callerLabel });
      setHydrated((prev) => (prev ? { ...prev, rivalry: updated } : prev));
    } finally {
      setBookerBusy(false);
    }
  }
  async function clearBooker() {
    if (!isAdminOrModerator) return;
    setBookerBusy(true);
    try {
      const updated = await rivalriesApi.update(rivalryId!, { bookerName: '' });
      setHydrated((prev) => (prev ? { ...prev, rivalry: updated } : prev));
    } finally {
      setBookerBusy(false);
    }
  }

  const winsA = (pidA && hydrated.headToHead.winsByParticipant[pidA]) ?? 0;
  const winsB = (pidB && hydrated.headToHead.winsByParticipant[pidB]) ?? 0;

  return (
    <div className="rivalry-detail">
      <Link to="/rivalries" className="rivalry-detail__back">
        ← {t('rivalries.detail.backToHub')}
      </Link>

      <header className="rivalry-detail__hero">
        <div className="rivalry-detail__portrait">
          <img
            src={resolveImageSrc(a?.imageUrl, DEFAULT_WRESTLER_IMAGE)}
            alt={nameA}
            loading="lazy"
            decoding="async"
            onError={(e) => applyImageFallback(e, DEFAULT_WRESTLER_IMAGE)}
          />
          <h2 className="rivalry-detail__name">{nameA}</h2>
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
          <h2 className="rivalry-detail__name">{nameB}</h2>
        </div>
      </header>

      <h1 className="rivalry-detail__title">{r.title}</h1>

      <div className="rivalry-detail__booker">
        {r.bookerName ? (
          <>
            <span className="rivalry-detail__booker-badge">
              {t('rivalries.detail.bookerBadge', {
                defaultValue: 'Booked by {{name}}',
                name: r.bookerName,
              })}
            </span>
            {isAdminOrModerator && (
              <button
                type="button"
                className="rivalry-detail__booker-btn"
                disabled={bookerBusy}
                onClick={isBooker ? clearBooker : assignSelfAsBooker}
              >
                {isBooker
                  ? t('rivalries.detail.clearBooker', { defaultValue: 'Clear booker' })
                  : t('rivalries.detail.takeBooker', { defaultValue: 'Take over booking' })}
              </button>
            )}
          </>
        ) : (
          isAdminOrModerator && isAuthenticated && (
            <button
              type="button"
              className="rivalry-detail__booker-btn"
              disabled={bookerBusy || !callerLabel}
              onClick={assignSelfAsBooker}
            >
              {t('rivalries.detail.assignBooker', { defaultValue: "I'll book this" })}
            </button>
          )
        )}
      </div>

      <section className="rivalry-detail__stats">
        <div className="rivalry-detail__stat">
          <span className="rivalry-detail__stat-label">
            {t('rivalries.detail.headToHead')}
          </span>
          <span className="rivalry-detail__stat-value">
            {winsA}W – {winsB}L – {hydrated.headToHead.draws}D
          </span>
        </div>
        <div className="rivalry-detail__stat rivalry-detail__stat--center">
          <span className="rivalry-detail__stat-label">
            {t('rivalries.detail.matchesInRivalry', { defaultValue: 'Matches in Rivalry' })}
          </span>
          <span className="rivalry-detail__stat-value">
            {hydrated.headToHead.totalMatches}
          </span>
        </div>
        <div className="rivalry-detail__stat">
          <span className="rivalry-detail__stat-label">Heat</span>
          <span className="rivalry-detail__stat-value">
            <HeatBadge heat={r.heat} heatScore={r.heatScore} size="md" />
          </span>
        </div>
        <div className="rivalry-detail__stat">
          <span className="rivalry-detail__stat-label">Status</span>
          <span className={`rivalry-detail__pill rivalry-detail__pill--${r.status}`}>
            {t(STATUS_KEY[r.status])}
          </span>
        </div>
        {daysToNext !== null && (
          <div className="rivalry-detail__stat">
            <span className="rivalry-detail__stat-label">
              {t('rivalries.detail.nextEvent')}
            </span>
            <span className="rivalry-detail__stat-value">
              {daysToNext}d
            </span>
          </div>
        )}
      </section>

      <nav className="rivalry-detail__tabs" role="tablist">
        {TAB_DEFS.map((tab) => (
          <NavLink
            key={tab.id}
            to={tab.id === 'overview' ? '' : tab.id}
            end={tab.id === 'overview'}
            className={({ isActive }) =>
              `rivalry-detail__tab ${isActive ? 'is-active' : ''}`
            }
          >
            {t(tab.labelKey)}
          </NavLink>
        ))}
      </nav>

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

      <button
        type="button"
        className="rivalry-detail__message-gm"
        onClick={() => navigate('messages')}
        aria-label="Message GM"
      >
        💬
      </button>
    </div>
  );
}
