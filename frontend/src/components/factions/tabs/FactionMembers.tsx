import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { factionsApi } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { logger } from '../../../utils/logger';
import {
  DEFAULT_WRESTLER_IMAGE,
  resolveImageSrc,
  applyImageFallback,
} from '../../../constants/imageFallbacks';
import InviteToFactionModal from '../InviteToFactionModal';
import RemoveMemberModal from '../RemoveMemberModal';
import type { FactionStatsResponse } from '../../../types/faction';
import type { FactionDetailContext } from '../FactionDetail';
import './FactionMembers.css';

type SortKey = 'wins' | 'winPct' | 'activity' | 'tenure';
type FilterKey = 'all' | 'active' | 'inactive';

type FormResult = 'W' | 'L' | 'D';

interface MemberRow {
  playerId: string;
  playerName: string;
  wrestlerName: string;
  imageUrl?: string;
  psnId?: string;
  isLeader: boolean;
  wins: number;
  losses: number;
  draws: number;
  winPercentage: number;
  recentForm: FormResult[];
  currentStreak?: { type: FormResult; count: number };
  /** Performance delta vs the per-faction average wins (integer rounded). */
  deltaVsAvg: number;
}

function tenureLabel(joinedAt: string, now: number, t: (key: string, fallback: string, opts?: Record<string, unknown>) => string): string {
  const start = new Date(joinedAt).getTime();
  if (!Number.isFinite(start)) return '';
  const days = Math.max(0, Math.floor((now - start) / (24 * 60 * 60 * 1000)));
  if (days < 30) return t('factions.members.tenureDays', '{{count}}D', { count: days });
  const months = Math.floor(days / 30);
  if (months < 12) return t('factions.members.tenureMonths', '{{count}}MO', { count: months });
  const years = Math.floor(months / 12);
  const remMonths = months - years * 12;
  return remMonths > 0
    ? t('factions.members.tenureYearsMonths', '{{years}}Y {{months}}MO', { years, months: remMonths })
    : t('factions.members.tenureYears', '{{count}}Y', { count: years });
}

function sortRows(rows: MemberRow[], by: SortKey): MemberRow[] {
  const copy = [...rows];
  switch (by) {
    case 'winPct':
      return copy.sort((a, b) => b.winPercentage - a.winPercentage || b.wins - a.wins);
    case 'activity':
      return copy.sort(
        (a, b) =>
          b.recentForm.length - a.recentForm.length || b.wins + b.losses - (a.wins + a.losses),
      );
    case 'tenure':
      // Until per-member tenure exists every member shares stable.createdAt;
      // fall back to a stable name sort so the order is at least deterministic.
      return copy.sort((a, b) => a.playerName.localeCompare(b.playerName));
    case 'wins':
    default:
      return copy.sort((a, b) => b.wins - a.wins || b.winPercentage - a.winPercentage);
  }
}

function filterRows(rows: MemberRow[], filter: FilterKey): MemberRow[] {
  if (filter === 'all') return rows;
  // An "inactive" member has no recent-form entries yet; "active" is the
  // complement. Until per-member activity timestamps land this is the
  // closest approximation we have without an extra API call.
  if (filter === 'active') return rows.filter((r) => r.recentForm.length > 0);
  return rows.filter((r) => r.recentForm.length === 0);
}

function matchesQuery(row: MemberRow, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    row.playerName.toLowerCase().includes(needle) ||
    row.wrestlerName.toLowerCase().includes(needle)
  );
}

// ─── Right-rail donut ────────────────────────────────────────────────

interface DonutProps {
  segments: ReadonlyArray<{ key: string; value: number; color: string; label: string }>;
}

function CompositionDonut({ segments }: DonutProps) {
  const total = segments.reduce((acc, s) => acc + s.value, 0);
  if (total <= 0) return null;
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" role="img" aria-label="Faction composition">
      <circle cx="48" cy="48" r={radius} fill="none" stroke="#2a2a2a" strokeWidth="14" />
      {segments.map((s) => {
        const portion = s.value / total;
        const length = portion * circumference;
        const el = (
          <circle
            key={s.key}
            cx="48"
            cy="48"
            r={radius}
            fill="none"
            stroke={s.color}
            strokeWidth="14"
            strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 48 48)"
          />
        );
        offset += length;
        return el;
      })}
    </svg>
  );
}

// ─── Main component ─────────────────────────────────────────────────

export default function FactionMembers() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { faction } = useOutletContext<FactionDetailContext>();
  const auth = useAuth();
  const isLeader = auth.playerId !== null && auth.playerId === faction.leaderId;

  const [stats, setStats] = useState<FactionStatsResponse | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sort, setSort] = useState<SortKey>('wins');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<{
    playerId: string;
    playerName: string;
    mode: 'remove' | 'leave';
  } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  // Fetch per-member stats on mount (and on reload).
  useEffect(() => {
    const ac = new AbortController();
    factionsApi
      .getStats(faction.stableId, undefined, ac.signal)
      .then((response) => {
        if (!ac.signal.aborted) {
          setStats(response);
          setStatsError(null);
        }
      })
      .catch((err) => {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Members tab: getStats failed');
          setStatsError(err.message);
        }
      });
    return () => ac.abort();
  }, [faction.stableId, reloadKey]);

  // Click-outside to close the 3-dot menu.
  useEffect(() => {
    if (!openMenuFor) return;
    const onDown = (event: MouseEvent) => {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(event.target as Node)
      ) {
        setOpenMenuFor(null);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenuFor(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openMenuFor]);

  const rows: MemberRow[] = useMemo(() => {
    const statsByPlayer = new Map(
      (stats?.members ?? []).map((m) => [m.playerId, m]),
    );

    const memberCount = Math.max(1, faction.members.length);
    const totalWins = faction.members.reduce((acc, m) => {
      const s = statsByPlayer.get(m.playerId);
      return acc + (s?.wins ?? m.wins ?? 0);
    }, 0);
    const avgWins = totalWins / memberCount;

    return faction.members.map((member) => {
      const s = statsByPlayer.get(member.playerId);
      const wins = s?.wins ?? member.wins ?? 0;
      return {
        playerId: member.playerId,
        playerName: member.playerName,
        wrestlerName: member.wrestlerName,
        imageUrl: member.imageUrl,
        psnId: member.psnId,
        isLeader: member.playerId === faction.leaderId,
        wins,
        losses: s?.losses ?? member.losses ?? 0,
        draws: s?.draws ?? member.draws ?? 0,
        winPercentage: s?.winPercentage ?? 0,
        recentForm: (s?.recentForm ?? []) as FormResult[],
        currentStreak: s?.currentStreak,
        deltaVsAvg: Math.round(wins - avgWins),
      };
    });
  }, [faction.members, faction.leaderId, stats]);

  const visibleRows = useMemo(() => {
    const filtered = filterRows(rows, filter).filter((r) => matchesQuery(r, query));
    return sortRows(filtered, sort);
  }, [rows, filter, sort, query]);

  const totals = useMemo(() => {
    const wins = rows.reduce((acc, r) => acc + r.wins, 0);
    const losses = rows.reduce((acc, r) => acc + r.losses, 0);
    const draws = rows.reduce((acc, r) => acc + r.draws, 0);
    const totalMatches = wins + losses + draws;
    const winPct = totalMatches > 0 ? Math.round((wins / totalMatches) * 1000) / 10 : 0;
    return { wins, losses, draws, winPct };
  }, [rows]);

  const bestPerformer = useMemo(
    () => [...rows].sort((a, b) => b.winPercentage - a.winPercentage)[0] ?? null,
    [rows],
  );

  const needsSupport = useMemo(() => {
    const scoreLosses = (r: MemberRow) => r.recentForm.filter((x) => x === 'L').length;
    return [...rows].sort((a, b) => scoreLosses(b) - scoreLosses(a))[0] ?? null;
  }, [rows]);

  const composition = useMemo(() => {
    const leaderCount = rows.filter((r) => r.isLeader).length;
    const memberCount = rows.length - leaderCount;
    return [
      { key: 'leader', value: leaderCount, color: '#d4af37', label: 'Leader' },
      { key: 'member', value: memberCount, color: '#4a4a4a', label: 'Members' },
    ];
  }, [rows]);

  const handleRemove = async () => {
    if (!memberToRemove) return;
    const { mode } = memberToRemove;
    setRemoving(true);
    setRemoveError(null);
    try {
      const result = (await factionsApi.removeMember(
        faction.stableId,
        memberToRemove.playerId,
      )) as unknown as { status?: string };

      const wasDisbanded = result?.status === 'disbanded';
      const removedName = memberToRemove.playerName;
      setMemberToRemove(null);

      // FAC-23: when the caller is leaving, they lose access to this Detail
      // page entirely — always navigate them back to /factions whether or
      // not the faction also disbanded as a side effect.
      if (mode === 'leave') {
        navigate('/factions', {
          state: {
            toast: wasDisbanded
              ? t(
                  'factions.my.removeMemberDisbanded',
                  'Faction disbanded — only the leader remained.',
                )
              : t('factions.members.leaveSuccess', 'You left {{factionName}}.', {
                  factionName: faction.name,
                }),
          },
        });
        return;
      }

      if (wasDisbanded) {
        navigate('/factions', {
          state: {
            toast: t(
              'factions.my.removeMemberDisbanded',
              'Faction disbanded — only the leader remained.',
            ),
          },
        });
        return;
      }

      setFeedback(
        t('factions.my.removeMemberSuccess', '{{playerName}} removed from the faction.', {
          playerName: removedName,
        }),
      );
      setTimeout(() => setFeedback(null), 3000);
      // Refresh the per-member stats so the row disappears and the totals
      // recalculate. The shell's getById data is stale here but the tab
      // already reflects the new shape on the next mount.
      setReloadKey((k) => k + 1);
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : t('common.error', 'Failed'));
    } finally {
      setRemoving(false);
    }
  };

  const willDisband =
    memberToRemove !== null && (faction.memberIds?.length ?? faction.members.length) <= 2;

  const sortOptions: ReadonlyArray<{ value: SortKey; i18nKey: string; fallback: string }> = [
    { value: 'wins', i18nKey: 'factions.members.sortByWins', fallback: 'By Wins' },
    { value: 'winPct', i18nKey: 'factions.members.sortByWinPct', fallback: 'By Win%' },
    { value: 'activity', i18nKey: 'factions.members.sortByActivity', fallback: 'By Activity' },
    { value: 'tenure', i18nKey: 'factions.members.sortByTenure', fallback: 'By Tenure' },
  ];

  const filterOptions: ReadonlyArray<{ value: FilterKey; i18nKey: string; fallback: string }> = [
    { value: 'all', i18nKey: 'factions.members.filterAll', fallback: 'All' },
    { value: 'active', i18nKey: 'factions.members.filterActive', fallback: 'Active' },
    { value: 'inactive', i18nKey: 'factions.members.filterInactive', fallback: 'Inactive' },
  ];

  return (
    <div className="faction-members">
      {feedback && (
        <div className="faction-members__feedback" role="status">
          {feedback}
        </div>
      )}
      {statsError && (
        <p className="faction-members__error" role="alert">
          {t('factions.members.statsError', 'Could not load member stats.')}: {statsError}
        </p>
      )}

      {/* Utility row */}
      <div className="faction-members__utility">
        <div className="faction-members__sort-wrap">
          <label htmlFor="members-sort" className="visually-hidden">
            {t('factions.members.sortLabel', 'Sort members')}
          </label>
          <select
            id="members-sort"
            className="faction-members__sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.i18nKey, opt.fallback)}
              </option>
            ))}
          </select>
        </div>

        <div
          className="faction-members__filters"
          role="tablist"
          aria-label={t('factions.members.filterLabel', 'Filter by activity')}
        >
          {filterOptions.map((opt) => {
            const isActive = filter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="tab"
                aria-pressed={isActive}
                className={`faction-members__chip ${isActive ? 'faction-members__chip--active' : ''}`}
                onClick={() => setFilter(opt.value)}
              >
                {t(opt.i18nKey, opt.fallback)}
              </button>
            );
          })}
        </div>

        <label className="faction-members__search">
          <span className="visually-hidden">
            {t('factions.members.searchLabel', 'Search members')}
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('factions.members.searchPlaceholder', 'Search…')}
          />
        </label>

        {isLeader && (
          <button
            type="button"
            className="faction-members__invite-cta"
            onClick={() => setInviteOpen(true)}
          >
            {t('factions.members.inviteCta', 'Invite member')}
          </button>
        )}
      </div>

      {/* Main split: list + right rail */}
      <div className="faction-members__main">
        <div className="faction-members__list">
          {visibleRows.length === 0 ? (
            <p className="faction-members__empty">
              {t('factions.members.empty', 'No members match the current filter.')}
            </p>
          ) : (
            visibleRows.map((row) => {
              const role = row.isLeader
                ? t('factions.members.roleLeader', 'LEADER')
                : t('factions.members.roleMember', 'MEMBER');
              const tenure = tenureLabel(faction.createdAt, Date.now(), t);
              const deltaText =
                row.deltaVsAvg === 0
                  ? t('factions.members.deltaEven', '0 vs avg')
                  : row.deltaVsAvg > 0
                    ? t('factions.members.deltaPositive', '+{{n}} vs avg', { n: row.deltaVsAvg })
                    : t('factions.members.deltaNegative', '{{n}} vs avg', { n: row.deltaVsAvg });
              const streakBadge =
                row.currentStreak && row.currentStreak.count > 0
                  ? `${row.currentStreak.count}${row.currentStreak.type}`
                  : null;
              const isMenuOpen = openMenuFor === row.playerId;

              return (
                <article key={row.playerId} className="faction-members__row">
                  <img
                    src={resolveImageSrc(row.imageUrl, DEFAULT_WRESTLER_IMAGE)}
                    onError={(e) => applyImageFallback(e, DEFAULT_WRESTLER_IMAGE)}
                    alt=""
                    className="faction-members__portrait"
                  />

                  <div className="faction-members__row-identity">
                    <h3 className="faction-members__row-name">{row.wrestlerName}</h3>
                    <span className="faction-members__row-player">{row.playerName}</span>
                    <p className="faction-members__row-position">
                      <span
                        className={`faction-members__role faction-members__role--${row.isLeader ? 'leader' : 'member'}`}
                      >
                        {role}
                      </span>
                      <span className="faction-members__row-divider" aria-hidden="true">·</span>
                      <span className="faction-members__row-tenure">{tenure}</span>
                    </p>
                  </div>

                  <div className="faction-members__stats">
                    <div className="faction-members__stat">
                      <span className="faction-members__stat-label">{t('factions.hub.statWins', 'WINS')}</span>
                      <strong className="faction-members__stat-value">{row.wins}</strong>
                    </div>
                    <div className="faction-members__stat">
                      <span className="faction-members__stat-label">{t('factions.hub.statLosses', 'LOSSES')}</span>
                      <strong className="faction-members__stat-value">{row.losses}</strong>
                    </div>
                    <div className="faction-members__stat">
                      <span className="faction-members__stat-label">{t('factions.hub.statDraws', 'DRAWS')}</span>
                      <strong className="faction-members__stat-value">{row.draws}</strong>
                    </div>
                    <div className="faction-members__stat">
                      <span className="faction-members__stat-label">{t('factions.hub.statWinPct', 'WIN%')}</span>
                      <strong className="faction-members__stat-value">
                        {row.winPercentage > 0 ? `${row.winPercentage.toFixed(1)}` : '—'}
                      </strong>
                    </div>
                  </div>

                  <div className="faction-members__delta-form">
                    <span
                      className={`faction-members__delta ${
                        row.deltaVsAvg > 0
                          ? 'faction-members__delta--up'
                          : row.deltaVsAvg < 0
                            ? 'faction-members__delta--down'
                            : 'faction-members__delta--flat'
                      }`}
                    >
                      {deltaText}
                    </span>
                    <div
                      className="faction-members__form"
                      aria-label={t('factions.members.formLabel', 'Recent form')}
                    >
                      {row.recentForm.length === 0 ? (
                        <span className="faction-members__form-empty">—</span>
                      ) : (
                        row.recentForm.slice(0, 5).map((r, i) => (
                          <span
                            key={i}
                            className={`faction-members__form-cell faction-members__form-cell--${r.toLowerCase()}`}
                            aria-hidden="true"
                          />
                        ))
                      )}
                    </div>
                    {streakBadge && (
                      <span
                        className={`faction-members__streak ${
                          row.currentStreak?.type === 'W'
                            ? 'faction-members__streak--hot'
                            : 'faction-members__streak--cold'
                        }`}
                      >
                        {streakBadge}
                      </span>
                    )}
                  </div>

                  <div
                    className="faction-members__actions"
                    ref={isMenuOpen ? menuContainerRef : null}
                  >
                    <button
                      type="button"
                      className="faction-members__menu-trigger"
                      aria-haspopup="menu"
                      aria-expanded={isMenuOpen}
                      aria-label={t('factions.members.menuLabel', 'Actions for {{name}}', {
                        name: row.wrestlerName,
                      })}
                      onClick={() => setOpenMenuFor(isMenuOpen ? null : row.playerId)}
                    >
                      ⋯
                    </button>
                    {isMenuOpen && (
                      <div role="menu" className="faction-members__menu">
                        <Link
                          to={`/player/${row.playerId}`}
                          className="faction-members__menu-item"
                          role="menuitem"
                          onClick={() => setOpenMenuFor(null)}
                        >
                          {t('factions.members.actionViewProfile', 'View profile')}
                        </Link>
                        <Link
                          to={`/factions/${faction.stableId}/messages?dm=${row.playerId}`}
                          className="faction-members__menu-item"
                          role="menuitem"
                          onClick={() => setOpenMenuFor(null)}
                        >
                          {t('factions.members.actionDm', 'Send direct message')}
                        </Link>
                        {isLeader && !row.isLeader && (
                          <button
                            type="button"
                            role="menuitem"
                            className="faction-members__menu-item faction-members__menu-item--destructive"
                            onClick={() => {
                              setOpenMenuFor(null);
                              setMemberToRemove({
                                playerId: row.playerId,
                                playerName: row.wrestlerName,
                                mode: 'remove',
                              });
                              setRemoveError(null);
                            }}
                          >
                            {t('factions.members.actionRemove', 'Remove from faction')}
                          </button>
                        )}
                        {/* FAC-23: caller's own row (only if they aren't the
                            leader) gets a "Leave faction" option. Leaders
                            use transfer-leadership / disband instead. */}
                        {!row.isLeader && row.playerId === auth.playerId && (
                          <button
                            type="button"
                            role="menuitem"
                            className="faction-members__menu-item faction-members__menu-item--destructive"
                            onClick={() => {
                              setOpenMenuFor(null);
                              setMemberToRemove({
                                playerId: row.playerId,
                                playerName: row.wrestlerName,
                                mode: 'leave',
                              });
                              setRemoveError(null);
                            }}
                          >
                            {t('factions.members.actionLeave', 'Leave faction')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })
          )}

          {/* Footer card: faction totals */}
          <section className="faction-members__totals" aria-labelledby="faction-members-totals">
            <h2 id="faction-members-totals" className="faction-members__totals-title">
              {t('factions.members.totalsTitle', 'Faction Totals')}
            </h2>
            <div className="faction-members__totals-grid">
              <div className="faction-members__totals-stat">
                <span className="faction-members__totals-label">
                  {t('factions.hub.statWins', 'WINS')}
                </span>
                <strong>{totals.wins}</strong>
              </div>
              <div className="faction-members__totals-stat">
                <span className="faction-members__totals-label">
                  {t('factions.hub.statLosses', 'LOSSES')}
                </span>
                <strong>{totals.losses}</strong>
              </div>
              <div className="faction-members__totals-stat">
                <span className="faction-members__totals-label">
                  {t('factions.hub.statDraws', 'DRAWS')}
                </span>
                <strong>{totals.draws}</strong>
              </div>
              <div className="faction-members__totals-stat">
                <span className="faction-members__totals-label">
                  {t('factions.hub.statWinPct', 'WIN%')}
                </span>
                <strong>{totals.winPct}%</strong>
              </div>
            </div>

            <div className="faction-members__callouts">
              {bestPerformer && (
                <div className="faction-members__callout">
                  <span className="faction-members__callout-label">
                    {t('factions.members.bestPerformer', 'BEST PERFORMER')}
                  </span>
                  <img
                    src={resolveImageSrc(bestPerformer.imageUrl, DEFAULT_WRESTLER_IMAGE)}
                    onError={(e) => applyImageFallback(e, DEFAULT_WRESTLER_IMAGE)}
                    alt=""
                    className="faction-members__callout-image"
                  />
                  <span className="faction-members__callout-name">{bestPerformer.wrestlerName}</span>
                  <span className="faction-members__callout-value">
                    {bestPerformer.winPercentage > 0 ? `${bestPerformer.winPercentage.toFixed(1)}%` : '—'}
                  </span>
                </div>
              )}
              {needsSupport && needsSupport.playerId !== bestPerformer?.playerId && (
                <div className="faction-members__callout">
                  <span className="faction-members__callout-label">
                    {t('factions.members.needsSupport', 'NEEDS SUPPORT')}
                  </span>
                  <img
                    src={resolveImageSrc(needsSupport.imageUrl, DEFAULT_WRESTLER_IMAGE)}
                    onError={(e) => applyImageFallback(e, DEFAULT_WRESTLER_IMAGE)}
                    alt=""
                    className="faction-members__callout-image"
                  />
                  <span className="faction-members__callout-name">{needsSupport.wrestlerName}</span>
                  <span className="faction-members__callout-value">
                    {needsSupport.recentForm.length > 0
                      ? needsSupport.recentForm.join(' · ')
                      : '—'}
                  </span>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right rail */}
        <aside className="faction-members__rail">
          <section className="faction-members__rail-card">
            <h3 className="faction-members__rail-title">
              {t('factions.members.compositionTitle', 'Faction Composition')}
            </h3>
            <div className="faction-members__rail-donut">
              <CompositionDonut segments={composition} />
              <ul className="faction-members__rail-legend">
                {composition.map((s) => (
                  <li key={s.key}>
                    <span
                      className="faction-members__rail-legend-dot"
                      style={{ backgroundColor: s.color }}
                      aria-hidden="true"
                    />
                    <span>
                      {s.label} ({s.value})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="faction-members__rail-card">
            <h3 className="faction-members__rail-title">
              {t('factions.members.tenureTitle', 'Tenure')}
            </h3>
            <div
              className="faction-members__tenure-bar"
              role="img"
              aria-label={t('factions.members.tenureAria', 'Tenure breakdown')}
            >
              {rows.map((r) => (
                <span
                  key={r.playerId}
                  className={`faction-members__tenure-seg ${
                    r.isLeader ? 'faction-members__tenure-seg--leader' : ''
                  }`}
                  style={{ flex: 1 }}
                  title={r.wrestlerName}
                />
              ))}
            </div>
            <p className="faction-members__tenure-note">
              {t(
                'factions.members.tenureNote',
                'Per-member tenure is approximated from the faction creation date until per-member join tracking ships.',
              )}
            </p>
          </section>
        </aside>
      </div>

      {/* Invite modal */}
      {inviteOpen && (
        <InviteToFactionModal
          isOpen={inviteOpen}
          stableId={faction.stableId}
          currentMemberIds={faction.memberIds}
          onClose={() => setInviteOpen(false)}
          onInvited={() => {
            setInviteOpen(false);
            setReloadKey((k) => k + 1);
          }}
        />
      )}

      {/* Remove-member / leave-faction confirmation modal — shared with the
          Manage tab. The mode flag picks between the two copy variants. */}
      {memberToRemove && (
        <RemoveMemberModal
          factionName={faction.name}
          playerName={memberToRemove.playerName}
          willDisband={willDisband}
          error={removeError}
          busy={removing}
          mode={memberToRemove.mode}
          onCancel={() => {
            setMemberToRemove(null);
            setRemoveError(null);
          }}
          onConfirm={handleRemove}
        />
      )}
    </div>
  );
}
