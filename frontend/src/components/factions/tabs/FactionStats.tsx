import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOutletContext } from 'react-router-dom';
import { factionsApi, seasonsApi, championshipsApi } from '../../../services/api';
import { logger } from '../../../utils/logger';
import {
  DEFAULT_WRESTLER_IMAGE,
  resolveImageSrc,
  applyImageFallback,
} from '../../../constants/imageFallbacks';
import type { Championship, Season } from '../../../types';
import type {
  FactionStatsResponse,
  FactionStatsHeadToHeadRow,
  FactionStatsMatchTypeRow,
} from '../../../types/faction';
import type { FactionDetailContext } from '../FactionDetail';
import './FactionStats.css';

const HEAT_FLAME_COUNT = 5;
const LEADERBOARD_LIMIT = 5;
const H2H_LIMIT = 5;

type SeasonKey = string | 'all';

function clampHeat(count: number | undefined): number {
  if (!count || count < 0) return 0;
  return Math.min(HEAT_FLAME_COUNT, Math.floor(count));
}

function isMemberHoldingTitle(c: Championship, memberIds: Set<string>): boolean {
  if (!c.isActive || !c.currentChampion) return false;
  const champion = c.currentChampion;
  if (typeof champion === 'string') return memberIds.has(champion);
  return champion.some((id) => memberIds.has(id));
}

// ─── Inline SVG components ─────────────────────────────────────────────

interface CircularProgressProps {
  /** Percentage 0–100. */
  value: number;
}

function CircularProgress({ value }: CircularProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
      <circle cx="36" cy="36" r={radius} fill="none" stroke="#2a2a2a" strokeWidth="6" />
      <circle
        cx="36"
        cy="36"
        r={radius}
        fill="none"
        stroke="#d4af37"
        strokeWidth="6"
        strokeDasharray={`${dash} ${circumference - dash}`}
        strokeDashoffset={circumference / 4}
        transform="rotate(-90 36 36)"
        strokeLinecap="butt"
      />
    </svg>
  );
}

function FlameIcon({ lit }: { lit: boolean }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 16 16"
      className={`faction-stats__flame ${lit ? 'faction-stats__flame--lit' : 'faction-stats__flame--dim'}`}
    >
      <path
        d="M8 .5s2.5 3 2.5 5.5a2.5 2.5 0 0 1-1 2 1.5 1.5 0 0 0 1.5-2.5C12.5 7 14 9 14 11a6 6 0 1 1-12 0c0-2.5 2-4.5 2-7 0 2 2 3 4 3.5 0-2-1-3-1-4.5 0-1 1-2.5 1-2.5z"
        fill="currentColor"
      />
    </svg>
  );
}

interface MatchTypeBarsProps {
  rows: FactionStatsMatchTypeRow[];
  ariaLabel: string;
}

function MatchTypeBars({ rows, ariaLabel }: MatchTypeBarsProps) {
  if (rows.length === 0) return null;
  return (
    <ul className="faction-stats__bars" aria-label={ariaLabel}>
      {rows.map((row) => {
        const total = row.wins + row.losses + row.draws;
        const w = total > 0 ? (row.wins / total) * 100 : 0;
        const l = total > 0 ? (row.losses / total) * 100 : 0;
        const d = total > 0 ? (row.draws / total) * 100 : 0;
        return (
          <li key={row.matchFormat} className="faction-stats__bar-row">
            <div className="faction-stats__bar-label">
              <span className="faction-stats__bar-format">{row.matchFormat}</span>
              <span className="faction-stats__bar-record">
                {row.wins}-{row.losses}-{row.draws}
              </span>
            </div>
            <div className="faction-stats__bar-track" role="img" aria-label={`${row.matchFormat}: ${row.wins} wins, ${row.losses} losses, ${row.draws} draws`}>
              <span className="faction-stats__bar-seg faction-stats__bar-seg--w" style={{ width: `${w}%` }} />
              <span className="faction-stats__bar-seg faction-stats__bar-seg--l" style={{ width: `${l}%` }} />
              <span className="faction-stats__bar-seg faction-stats__bar-seg--d" style={{ width: `${d}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

interface SeasonPoint {
  seasonId: string;
  seasonName: string;
  wins: number;
  losses: number;
}

interface SeasonLineChartProps {
  points: SeasonPoint[];
  ariaLabel: string;
}

function SeasonLineChart({ points, ariaLabel }: SeasonLineChartProps) {
  if (points.length === 0) {
    return null;
  }

  const width = 320;
  const height = 140;
  const padX = 24;
  const padY = 16;
  const maxValue = Math.max(1, ...points.flatMap((p) => [p.wins, p.losses]));
  const stepX = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0;
  const yFor = (v: number) => padY + (1 - v / maxValue) * (height - padY * 2);

  const buildPath = (key: 'wins' | 'losses') =>
    points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${padX + i * stepX} ${yFor(p[key])}`)
      .join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel}
      className="faction-stats__lines"
    >
      <path d={buildPath('losses')} fill="none" stroke="#dc3545" strokeWidth="2" opacity="0.7" />
      <path d={buildPath('wins')} fill="none" stroke="#d4af37" strokeWidth="2.5" />
      {points.map((p, i) => (
        <g key={p.seasonId}>
          <circle cx={padX + i * stepX} cy={yFor(p.wins)} r="3.5" fill="#d4af37" />
          <circle cx={padX + i * stepX} cy={yFor(p.losses)} r="3" fill="#dc3545" />
        </g>
      ))}
      {points.map((p, i) => (
        <text
          key={`${p.seasonId}-label`}
          x={padX + i * stepX}
          y={height - 2}
          textAnchor="middle"
          fontSize="9"
          fill="#888"
        >
          {p.seasonName.length > 8 ? p.seasonName.slice(0, 6) + '…' : p.seasonName}
        </text>
      ))}
    </svg>
  );
}

interface OutcomeDonutProps {
  wins: number;
  losses: number;
  draws: number;
  ariaLabel: string;
}

function OutcomeDonut({ wins, losses, draws, ariaLabel }: OutcomeDonutProps) {
  const total = wins + losses + draws;
  if (total === 0) return null;

  const segments = [
    { key: 'w', value: wins, color: '#d4af37' },
    { key: 'l', value: losses, color: '#dc3545' },
    { key: 'd', value: draws, color: '#fbbf24' },
  ];
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="faction-stats__donut-wrap">
      <svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label={ariaLabel}>
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#2a2a2a" strokeWidth="14" />
        {segments.map((s) => {
          const length = (s.value / total) * circumference;
          const el = (
            <circle
              key={s.key}
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth="14"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 70 70)"
            />
          );
          offset += length;
          return el;
        })}
        <text x="70" y="68" textAnchor="middle" fontSize="22" fontWeight="800" fill="#fff">
          {total}
        </text>
        <text x="70" y="85" textAnchor="middle" fontSize="9" fill="#888" letterSpacing="1.5">
          MATCHES
        </text>
      </svg>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────

export default function FactionStats() {
  const { t } = useTranslation();
  const { faction } = useOutletContext<FactionDetailContext>();

  const [seasonKey, setSeasonKey] = useState<SeasonKey>('all');
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [statsByKey, setStatsByKey] = useState<Map<SeasonKey, FactionStatsResponse>>(new Map());
  const [loadingActive, setLoadingActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comparisonFactionId, setComparisonFactionId] = useState<string | null>(null);

  const memberIds = useMemo(() => new Set(faction.memberIds ?? []), [faction.memberIds]);

  // Initial parallel load: all-time stats + seasons list + championships.
  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;
    setLoadingActive(true);
    setError(null);

    Promise.all([
      factionsApi.getStats(faction.stableId, undefined, ac.signal),
      seasonsApi.getAll(ac.signal).catch(() => [] as Season[]),
      championshipsApi.getAll(ac.signal).catch(() => [] as Championship[]),
    ])
      .then(([allTimeStats, seasonList, championshipList]) => {
        if (cancelled || ac.signal.aborted) return;
        setStatsByKey((prev) => new Map(prev).set('all', allTimeStats));
        setSeasons(seasonList);
        setChampionships(championshipList);
      })
      .catch((err) => {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Stats tab: initial load failed');
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled && !ac.signal.aborted) setLoadingActive(false);
      });

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [faction.stableId]);

  // Fetch a season's slice on demand when the user selects it (and not already cached).
  useEffect(() => {
    if (seasonKey === 'all' || statsByKey.has(seasonKey)) return;
    const ac = new AbortController();
    setLoadingActive(true);
    factionsApi
      .getStats(faction.stableId, { seasonId: seasonKey }, ac.signal)
      .then((response) => {
        if (!ac.signal.aborted) {
          setStatsByKey((prev) => new Map(prev).set(seasonKey, response));
        }
      })
      .catch((err) => {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Stats tab: season fetch failed');
          setError(err.message);
        }
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoadingActive(false);
      });
    return () => ac.abort();
  }, [seasonKey, statsByKey, faction.stableId]);

  // Background-prefetch each season's slice so the season-by-season chart can render
  // without flashing as the user clicks around. N+1 calls — acceptable for v1 per ticket.
  useEffect(() => {
    if (seasons.length === 0) return;
    const ac = new AbortController();
    const missing = seasons.filter((s) => !statsByKey.has(s.seasonId));
    if (missing.length === 0) return;

    Promise.all(
      missing.map((s) =>
        factionsApi
          .getStats(faction.stableId, { seasonId: s.seasonId }, ac.signal)
          .then((res) => [s.seasonId, res] as const)
          .catch((err) => {
            if (err instanceof Error && err.name !== 'AbortError') {
              logger.warn(`Stats tab: prefetch ${s.seasonId} failed`);
            }
            return null;
          }),
      ),
    ).then((results) => {
      if (ac.signal.aborted) return;
      setStatsByKey((prev) => {
        const next = new Map(prev);
        for (const r of results) {
          if (r) next.set(r[0], r[1]);
        }
        return next;
      });
    });
    return () => ac.abort();
  }, [seasons, statsByKey, faction.stableId]);

  const activeStats = statsByKey.get(seasonKey) ?? null;

  const titleReigns = useMemo(
    () => championships.filter((c) => isMemberHoldingTitle(c, memberIds)).length,
    [championships, memberIds],
  );

  const dominantFormat = useMemo<{ format: string; winPct: number } | null>(() => {
    const rows = activeStats?.matchTypeBreakdown ?? [];
    if (rows.length === 0) return null;
    const ranked = rows
      .map((r) => {
        const total = r.wins + r.losses + r.draws;
        return { format: r.matchFormat, winPct: total > 0 ? (r.wins / total) * 100 : 0 };
      })
      .sort((a, b) => b.winPct - a.winPct);
    return ranked[0] ?? null;
  }, [activeStats]);

  const seasonPoints: SeasonPoint[] = useMemo(() => {
    return seasons
      .filter((s) => statsByKey.has(s.seasonId))
      .map((s) => {
        const stats = statsByKey.get(s.seasonId);
        return {
          seasonId: s.seasonId,
          seasonName: s.name,
          wins: stats?.totals.wins ?? 0,
          losses: stats?.totals.losses ?? 0,
        };
      });
  }, [seasons, statsByKey]);

  const leaderboard = useMemo(() => {
    const members = activeStats?.members ?? [];
    return [...members]
      .sort((a, b) => b.winPercentage - a.winPercentage || b.wins - a.wins)
      .slice(0, LEADERBOARD_LIMIT);
  }, [activeStats]);

  const h2hOrdered: FactionStatsHeadToHeadRow[] = useMemo(() => {
    const rows = activeStats?.headToHead ?? [];
    if (!comparisonFactionId) return rows.slice(0, H2H_LIMIT);
    const focused = rows.filter((r) => r.factionId === comparisonFactionId);
    const others = rows.filter((r) => r.factionId !== comparisonFactionId);
    return [...focused, ...others].slice(0, H2H_LIMIT);
  }, [activeStats, comparisonFactionId]);

  const longestWinStreak = useMemo(() => {
    const members = activeStats?.members ?? [];
    let best = 0;
    for (const m of members) {
      if (m.currentStreak?.type === 'W') {
        best = Math.max(best, m.currentStreak.count);
      }
    }
    return best;
  }, [activeStats]);

  const mostWinsInASeason = useMemo(() => {
    let max = 0;
    for (const stats of statsByKey.values()) {
      if (stats.seasonId !== null) {
        max = Math.max(max, stats.totals.wins);
      }
    }
    return max;
  }, [statsByKey]);

  const litHeat = clampHeat(activeStats?.totals.currentStreak.count);

  if (loadingActive && !activeStats) {
    return (
      <p className="faction-stats__loading">
        {t('common.loading', 'Loading…')}
      </p>
    );
  }

  if (error && !activeStats) {
    return (
      <p className="faction-stats__error" role="alert">
        {t('factions.stats.error', 'Could not load stats.')}: {error}
      </p>
    );
  }

  const totals = activeStats?.totals ?? {
    wins: 0,
    losses: 0,
    draws: 0,
    winPercentage: 0,
    matchCount: 0,
    recentForm: [],
    currentStreak: { type: 'W' as const, count: 0 },
  };

  const opponentOptions = activeStats?.headToHead ?? [];

  return (
    <div className="faction-stats">
      {/* Utility row */}
      <div className="faction-stats__utility">
        <div
          className="faction-stats__seasons"
          role="tablist"
          aria-label={t('factions.stats.seasonsLabel', 'Time window')}
        >
          <button
            type="button"
            role="tab"
            aria-pressed={seasonKey === 'all'}
            className={`faction-stats__season ${seasonKey === 'all' ? 'faction-stats__season--active' : ''}`}
            onClick={() => setSeasonKey('all')}
          >
            {t('factions.stats.allTime', 'ALL TIME')}
          </button>
          {seasons.map((s) => (
            <button
              key={s.seasonId}
              type="button"
              role="tab"
              aria-pressed={seasonKey === s.seasonId}
              className={`faction-stats__season ${seasonKey === s.seasonId ? 'faction-stats__season--active' : ''}`}
              onClick={() => setSeasonKey(s.seasonId)}
            >
              {s.name}
            </button>
          ))}
        </div>

        {opponentOptions.length > 0 && (
          <label className="faction-stats__compare">
            <span>{t('factions.stats.compareLabel', 'Compare against')}</span>
            <select
              value={comparisonFactionId ?? ''}
              onChange={(e) => setComparisonFactionId(e.target.value || null)}
            >
              <option value="">{t('factions.stats.compareNone', 'No focus')}</option>
              {opponentOptions.map((opp) => (
                <option key={opp.factionId} value={opp.factionId}>
                  {opp.factionName}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* KPI grid */}
      <div className="faction-stats__kpis">
        <section className="faction-stats__kpi">
          <h3 className="faction-stats__kpi-title">
            {t('factions.stats.kpiTotalWins', 'Total Wins')}
          </h3>
          <span className="faction-stats__kpi-value">{totals.wins}</span>
        </section>

        <section className="faction-stats__kpi">
          <h3 className="faction-stats__kpi-title">
            {t('factions.stats.kpiWinPct', 'Win %')}
          </h3>
          <div className="faction-stats__kpi-pct">
            <CircularProgress value={totals.winPercentage} />
            <span className="faction-stats__kpi-pct-value">
              {totals.winPercentage > 0 ? `${totals.winPercentage.toFixed(1)}%` : '—'}
            </span>
          </div>
        </section>

        <section className="faction-stats__kpi">
          <h3 className="faction-stats__kpi-title">
            {t('factions.stats.kpiTitleReigns', 'Title Reigns')}
          </h3>
          <span className="faction-stats__kpi-value">{titleReigns}</span>
          <span className="faction-stats__kpi-subtitle">
            {/* No reign-history endpoint yet — "last won" stays as an em dash until that lands. */}
            {t('factions.stats.kpiTitleReignsSubtitle', '—')}
          </span>
        </section>

        <section className="faction-stats__kpi">
          <h3 className="faction-stats__kpi-title">
            {t('factions.stats.kpiHeat', 'Heat Score')}
          </h3>
          <div
            className="faction-stats__kpi-heat"
            role="img"
            aria-label={t('factions.hub.heatLabel', 'Heat: {{lit}} of {{total}}', {
              lit: litHeat,
              total: HEAT_FLAME_COUNT,
            })}
          >
            {Array.from({ length: HEAT_FLAME_COUNT }, (_, i) => (
              <FlameIcon key={i} lit={i < litHeat} />
            ))}
          </div>
        </section>
      </div>

      {/* Two-column layout */}
      <div className="faction-stats__main">
        <div className="faction-stats__left">
          <section className="faction-stats__card">
            <h2 className="faction-stats__card-title">
              {t('factions.stats.matchTypeTitle', 'Performance by Match Type')}
            </h2>
            {totals.matchCount === 0 || (activeStats?.matchTypeBreakdown ?? []).length === 0 ? (
              <p className="faction-stats__empty">
                {t('factions.stats.matchTypeEmpty', 'No completed matches yet.')}
              </p>
            ) : (
              <>
                <MatchTypeBars
                  rows={activeStats?.matchTypeBreakdown ?? []}
                  ariaLabel={t('factions.stats.matchTypeAria', 'Performance by match type')}
                />
                {dominantFormat && (
                  <p className="faction-stats__callout">
                    {t('factions.stats.dominantIn', 'DOMINANT IN: {{format}} ({{pct}}%)', {
                      format: dominantFormat.format,
                      pct: dominantFormat.winPct.toFixed(1),
                    })}
                  </p>
                )}
              </>
            )}
          </section>

          <section className="faction-stats__card">
            <h2 className="faction-stats__card-title">
              {t('factions.stats.seasonByTitle', 'Season-by-Season Record')}
            </h2>
            {seasonPoints.length === 0 ? (
              <p className="faction-stats__empty">
                {t('factions.stats.seasonByEmpty', 'No season data available yet.')}
              </p>
            ) : (
              <>
                <SeasonLineChart
                  points={seasonPoints}
                  ariaLabel={t('factions.stats.seasonByAria', 'Season-by-season wins and losses')}
                />
                <ul className="faction-stats__legend">
                  <li>
                    <span className="faction-stats__legend-dot faction-stats__legend-dot--w" />
                    {t('factions.stats.legendWins', 'Wins')}
                  </li>
                  <li>
                    <span className="faction-stats__legend-dot faction-stats__legend-dot--l" />
                    {t('factions.stats.legendLosses', 'Losses')}
                  </li>
                </ul>
              </>
            )}
          </section>

          <section className="faction-stats__card">
            <h2 className="faction-stats__card-title">
              {t('factions.stats.outcomeTitle', 'Match Outcome Distribution')}
            </h2>
            {totals.matchCount === 0 ? (
              <p className="faction-stats__empty">
                {t('factions.stats.outcomeEmpty', 'No outcomes to distribute yet.')}
              </p>
            ) : (
              <div className="faction-stats__outcome">
                <OutcomeDonut
                  wins={totals.wins}
                  losses={totals.losses}
                  draws={totals.draws}
                  ariaLabel={t('factions.stats.outcomeAria', 'Outcome distribution donut')}
                />
                <ul className="faction-stats__legend">
                  <li>
                    <span className="faction-stats__legend-dot faction-stats__legend-dot--w" />
                    {totals.wins} {t('factions.stats.legendWins', 'Wins')}
                  </li>
                  <li>
                    <span className="faction-stats__legend-dot faction-stats__legend-dot--l" />
                    {totals.losses} {t('factions.stats.legendLosses', 'Losses')}
                  </li>
                  <li>
                    <span className="faction-stats__legend-dot faction-stats__legend-dot--d" />
                    {totals.draws} {t('factions.stats.legendDraws', 'Draws')}
                  </li>
                </ul>
              </div>
            )}
          </section>
        </div>

        <aside className="faction-stats__right">
          <section className="faction-stats__card">
            <h2 className="faction-stats__card-title">
              {t('factions.stats.leaderboardTitle', 'Individual Leaderboard')}
            </h2>
            {leaderboard.length === 0 ? (
              <p className="faction-stats__empty">
                {t('factions.stats.leaderboardEmpty', 'No member stats yet.')}
              </p>
            ) : (
              <ol className="faction-stats__leaderboard">
                {leaderboard.map((m, i) => (
                  <li key={m.playerId} className="faction-stats__leader-row">
                    <span className="faction-stats__leader-rank">{i + 1}</span>
                    <img
                      src={resolveImageSrc(undefined, DEFAULT_WRESTLER_IMAGE)}
                      onError={(e) => applyImageFallback(e, DEFAULT_WRESTLER_IMAGE)}
                      alt=""
                      className="faction-stats__leader-avatar"
                    />
                    <span className="faction-stats__leader-name">{m.wrestlerName}</span>
                    <span className="faction-stats__leader-pct">
                      {m.winPercentage > 0 ? `${m.winPercentage.toFixed(1)}%` : '—'}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="faction-stats__card">
            <h2 className="faction-stats__card-title">
              {t('factions.stats.h2hTitle', 'vs Other Factions')}
            </h2>
            {h2hOrdered.length === 0 ? (
              <p className="faction-stats__empty">
                {t('factions.stats.h2hEmpty', 'No cross-faction matches yet.')}
              </p>
            ) : (
              <ul className="faction-stats__h2h">
                {h2hOrdered.map((row) => (
                  <li
                    key={row.factionId}
                    className={`faction-stats__h2h-row ${
                      row.factionId === comparisonFactionId
                        ? 'faction-stats__h2h-row--focus'
                        : ''
                    }`}
                  >
                    <span className="faction-stats__h2h-name">{row.factionName}</span>
                    <span className="faction-stats__h2h-record">
                      {row.wins}-{row.losses}-{row.draws}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="faction-stats__card">
            <h2 className="faction-stats__card-title">
              {t('factions.stats.milestonesTitle', 'Records & Milestones')}
            </h2>
            <ul className="faction-stats__milestones">
              <li>
                <span className="faction-stats__milestone-label">
                  {t('factions.stats.milestoneLongestStreak', 'Longest win streak')}
                </span>
                <span className="faction-stats__milestone-value">
                  {longestWinStreak > 0 ? longestWinStreak : '—'}
                </span>
              </li>
              <li>
                <span className="faction-stats__milestone-label">
                  {t('factions.stats.milestoneMostWinsSeason', 'Most wins in a season')}
                </span>
                <span className="faction-stats__milestone-value">
                  {mostWinsInASeason > 0 ? mostWinsInASeason : '—'}
                </span>
              </li>
              <li>
                <span className="faction-stats__milestone-label">
                  {t('factions.stats.milestoneTitleReigns', 'Title reigns')}
                </span>
                <span className="faction-stats__milestone-value">{titleReigns}</span>
              </li>
              <li>
                <span className="faction-stats__milestone-label">
                  {t('factions.stats.milestoneBestMonth', 'Best month')}
                </span>
                <span className="faction-stats__milestone-value">—</span>
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
