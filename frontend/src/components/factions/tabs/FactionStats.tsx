import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOutletContext } from 'react-router-dom';
import { factionsApi, seasonsApi, championshipsApi } from '../../../services/api';
import { logger } from '../../../utils/logger';
import { formatMatchType, matchFormatKey } from '../../../utils/matchDisplay';
import type { Championship, Season } from '../../../types';
import type {
  FactionStatsResponse,
  FactionStatsHeadToHeadRow,
  FactionStatsMatchTypeRow,
} from '../../../types/faction';
import type { FactionDetailContext } from '../FactionDetail';
import Avatar from '../../ui/Avatar';
import Select from '../../ui/Select';
import Skeleton from '../../ui/Skeleton';
import FactionHeat from '../FactionHeat';
import '../groupUi.css';
import './FactionStats.css';

const LEADERBOARD_LIMIT = 5;
const H2H_LIMIT = 5;
/** One season is a single point, so it reads better as a row than as a chart. */
const MIN_CHART_SEASONS = 2;

type SeasonKey = string | 'all';

function isMemberHoldingTitle(c: Championship, memberIds: Set<string>): boolean {
  if (!c.isActive || !c.currentChampion) return false;
  const champion = c.currentChampion;
  if (typeof champion === 'string') return memberIds.has(champion);
  return champion.some((id) => memberIds.has(id));
}

// ─── Charts ─────────────────────────────────────────────────────────────

interface MatchTypeBarsProps {
  rows: FactionStatsMatchTypeRow[];
  ariaLabel: string;
}

function MatchTypeBars({ rows, ariaLabel }: MatchTypeBarsProps) {
  const { t } = useTranslation();
  if (rows.length === 0) return null;
  return (
    <ul className="faction-stats__bars" aria-label={ariaLabel}>
      {rows.map((row) => {
        const total = row.wins + row.losses + row.draws;
        const winWidth = total > 0 ? (row.wins / total) * 100 : 0;
        const lossWidth = total > 0 ? (row.losses / total) * 100 : 0;
        const drawWidth = total > 0 ? (row.draws / total) * 100 : 0;
        return (
          <li key={row.matchFormat} className="faction-stats__bar-row">
            <div className="faction-stats__bar-label">
              <span>{formatMatchType(row.matchFormat, t)}</span>
              <span className="group-muted">{row.wins}-{row.losses}-{row.draws}</span>
            </div>
            <svg
              className="faction-stats__bar-track"
              viewBox="0 0 100 8"
              preserveAspectRatio="none"
              role="img"
              aria-label={t('factions.redesign.recordAria', '{{label}}: {{wins}} wins, {{losses}} losses, {{draws}} draws', {
                label: formatMatchType(row.matchFormat, t),
                wins: row.wins,
                losses: row.losses,
                draws: row.draws,
              })}
            >
              <rect className="faction-stats__fill--win" x="0" y="0" width={winWidth} height="8" />
              <rect className="faction-stats__fill--loss" x={winWidth} y="0" width={lossWidth} height="8" />
              <rect className="faction-stats__fill--draw" x={winWidth + lossWidth} y="0" width={drawWidth} height="8" />
            </svg>
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
      <path d={buildPath('losses')} className="faction-stats__line--loss" />
      <path d={buildPath('wins')} className="faction-stats__line--win" />
      {points.map((point, index) => (
        <g key={point.seasonId}>
          <circle cx={padX + index * stepX} cy={yFor(point.wins)} r="3.5" className="faction-stats__fill--win" />
          <circle cx={padX + index * stepX} cy={yFor(point.losses)} r="3" className="faction-stats__fill--loss" />
          <text x={padX + index * stepX} y={height - 2} textAnchor="middle" className="faction-stats__axis-label">
            {point.seasonName.length > 8 ? `${point.seasonName.slice(0, 6)}…` : point.seasonName}
          </text>
        </g>
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
  const { t } = useTranslation();
  const total = wins + losses + draws;
  if (total === 0) return null;

  const segments = [
    { key: 'win', value: wins },
    { key: 'loss', value: losses },
    { key: 'draw', value: draws },
  ];
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label={ariaLabel} className="faction-stats__donut">
      <circle cx="70" cy="70" r={radius} className="faction-stats__donut-track" />
      {segments.map((segment) => {
        const length = (segment.value / total) * circumference;
        const arc = (
          <circle
            key={segment.key}
            cx="70"
            cy="70"
            r={radius}
            className={`faction-stats__donut-arc faction-stats__donut-arc--${segment.key}`}
            strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 70 70)"
          />
        );
        offset += length;
        return arc;
      })}
      <text x="70" y="70" textAnchor="middle" className="faction-stats__donut-total">{total}</text>
      <text x="70" y="88" textAnchor="middle" className="faction-stats__axis-label">
        {t('factions.redesign.matchesLabel', 'Matches')}
      </text>
    </svg>
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
    const controller = new AbortController();
    setLoadingActive(true);
    setError(null);

    const loadInitial = async () => {
      try {
        const [allTimeStats, seasonList, championshipList] = await Promise.all([
          factionsApi.getStats(faction.stableId, undefined, controller.signal),
          seasonsApi.getAll(controller.signal).catch(() => [] as Season[]),
          championshipsApi.getAll(controller.signal).catch(() => [] as Championship[]),
        ]);
        if (controller.signal.aborted) return;
        setStatsByKey((previous) => new Map(previous).set('all', allTimeStats));
        setSeasons(seasonList);
        setChampionships(championshipList);
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Stats tab: initial load failed');
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) setLoadingActive(false);
      }
    };

    loadInitial();
    return () => controller.abort();
  }, [faction.stableId]);

  // Fetch a season's slice on demand when the user selects it (and not already cached).
  useEffect(() => {
    if (seasonKey === 'all' || statsByKey.has(seasonKey)) return;
    const controller = new AbortController();
    setLoadingActive(true);

    const loadSeason = async () => {
      try {
        const response = await factionsApi.getStats(faction.stableId, { seasonId: seasonKey }, controller.signal);
        if (!controller.signal.aborted) {
          setStatsByKey((previous) => new Map(previous).set(seasonKey, response));
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Stats tab: season fetch failed');
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) setLoadingActive(false);
      }
    };

    loadSeason();
    return () => controller.abort();
  }, [seasonKey, statsByKey, faction.stableId]);

  // Prefetch each season so the season-by-season chart can render. One call
  // per season, because there is no batch endpoint.
  useEffect(() => {
    if (seasons.length === 0) return;
    const missing = seasons.filter((season) => !statsByKey.has(season.seasonId));
    if (missing.length === 0) return;
    const controller = new AbortController();

    const prefetchSeason = async (seasonId: string) => {
      try {
        const response = await factionsApi.getStats(faction.stableId, { seasonId }, controller.signal);
        return [seasonId, response] as const;
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.warn(`Stats tab: prefetch ${seasonId} failed`);
        }
        return null;
      }
    };

    const prefetchAll = async () => {
      const results = await Promise.all(missing.map((season) => prefetchSeason(season.seasonId)));
      if (controller.signal.aborted) return;
      setStatsByKey((previous) => {
        const next = new Map(previous);
        for (const result of results) {
          if (result) next.set(result[0], result[1]);
        }
        return next;
      });
    };

    prefetchAll();
    return () => controller.abort();
  }, [seasons, statsByKey, faction.stableId]);

  const activeStats = statsByKey.get(seasonKey) ?? null;

  const titleReigns = useMemo(
    () => championships.filter((c) => isMemberHoldingTitle(c, memberIds)).length,
    [championships, memberIds],
  );

  // Stored formats vary in spelling, so "Single" and "singles" share one row.
  const matchTypeRows = useMemo(() => {
    const merged = new Map<string, FactionStatsMatchTypeRow>();
    for (const row of activeStats?.matchTypeBreakdown ?? []) {
      const key = matchFormatKey(row.matchFormat);
      const existing = merged.get(key);
      merged.set(key, existing
        ? { ...existing, wins: existing.wins + row.wins, losses: existing.losses + row.losses, draws: existing.draws + row.draws }
        : row);
    }
    return [...merged.values()];
  }, [activeStats]);

  const dominantFormat = useMemo<{ format: string; winPct: number } | null>(() => {
    const rows = matchTypeRows;
    if (rows.length === 0) return null;
    const ranked = rows
      .map((r) => {
        const total = r.wins + r.losses + r.draws;
        return { format: r.matchFormat, winPct: total > 0 ? (r.wins / total) * 100 : 0 };
      })
      .sort((a, b) => b.winPct - a.winPct);
    return ranked[0] ?? null;
  }, [matchTypeRows]);

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

  // Stats still count people who have since left the roster.
  const leaderName = (member: { playerId: string; wrestlerName: string }) =>
    (faction.members.some((current) => current.playerId === member.playerId)
      ? member.wrestlerName
      : t('factions.stats.formerMember', 'Former member'));

  const h2hOrdered: FactionStatsHeadToHeadRow[] = useMemo(() => {
    const rows = activeStats?.headToHead ?? [];
    if (!comparisonFactionId) return rows.slice(0, H2H_LIMIT);
    const focused = rows.filter((r) => r.factionId === comparisonFactionId);
    const others = rows.filter((r) => r.factionId !== comparisonFactionId);
    return [...focused, ...others].slice(0, H2H_LIMIT);
  }, [activeStats, comparisonFactionId]);

  const bestCurrentStreak = useMemo(() => {
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

  const imageByMember = useMemo(
    () => new Map(faction.members.map((member) => [member.playerId, member.imageUrl])),
    [faction.members],
  );

  if (loadingActive && !activeStats) return <Skeleton variant="cards" count={4} />;

  if (error && !activeStats) {
    return (
      <p className="group-error" role="alert">
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
    <div className="group-page">
      <div className="group-toolbar">
        <Select
          label={t('factions.stats.seasonsLabel', 'Time window')}
          value={seasonKey}
          onValueChange={setSeasonKey}
          options={[
            { value: 'all', label: t('factions.stats.allTime', 'ALL TIME') },
            ...seasons.map((season) => ({ value: season.seasonId, label: season.name })),
          ]}
        />
        {opponentOptions.length > 0 && (
          <div className="faction-stats__compare">
            <span className="group-muted">{t('factions.stats.compareLabel', 'Compare against')}</span>
            <Select
              label={t('factions.stats.compareLabel', 'Compare against')}
              value={comparisonFactionId ?? ''}
              onValueChange={(value) => setComparisonFactionId(value || null)}
              options={[
                { value: '', label: t('factions.stats.compareNone', 'No focus') },
                ...opponentOptions.map((opponent) => ({ value: opponent.factionId, label: opponent.factionName })),
              ]}
            />
          </div>
        )}
      </div>

      <div className="faction-stats__kpis">
        <section>
          <h3 className="faction-stats__kpi-title">{t('factions.stats.kpiTotalWins', 'Total Wins')}</h3>
          <span className="faction-stats__kpi-value">{totals.wins}</span>
        </section>
        <section>
          <h3 className="faction-stats__kpi-title">{t('factions.stats.kpiWinPct', 'Win %')}</h3>
          <span className="faction-stats__kpi-value">
            {totals.winPercentage > 0 ? `${totals.winPercentage.toFixed(1)}%` : '—'}
          </span>
        </section>
        <section>
          <h3 className="faction-stats__kpi-title">{t('factions.stats.kpiTitleReigns', 'Title Reigns')}</h3>
          <span className="faction-stats__kpi-value">{titleReigns}</span>
        </section>
        <section>
          <h3 className="faction-stats__kpi-title">{t('factions.stats.kpiHeat', 'Heat Score')}</h3>
          <FactionHeat count={activeStats?.totals.currentStreak.count} className="faction-stats__kpi-heat" />
        </section>
      </div>

      <div className="faction-stats__main">
        <div className="faction-stats__column">
          <section className="group-section">
            <h2 className="group-heading">{t('factions.stats.matchTypeTitle', 'Performance by Match Type')}</h2>
            {totals.matchCount === 0 || matchTypeRows.length === 0 ? (
              <p className="group-empty">{t('factions.stats.matchTypeEmpty', 'No completed matches yet.')}</p>
            ) : (
              <>
                <MatchTypeBars
                  rows={matchTypeRows}
                  ariaLabel={t('factions.stats.matchTypeAria', 'Performance by match type')}
                />
                {dominantFormat && (
                  <p className="faction-stats__callout">
                    {t('factions.stats.dominantIn', 'DOMINANT IN: {{format}} ({{pct}}%)', {
                      format: formatMatchType(dominantFormat.format, t),
                      pct: dominantFormat.winPct.toFixed(1),
                    })}
                  </p>
                )}
              </>
            )}
          </section>

          <section className="group-section">
            <h2 className="group-heading">{t('factions.stats.seasonByTitle', 'Season-by-Season Record')}</h2>
            {seasonPoints.length === 0 ? (
              <p className="group-empty">{t('factions.stats.seasonByEmpty', 'No season data available yet.')}</p>
            ) : seasonPoints.length < MIN_CHART_SEASONS ? (
              <ul className="group-list">
                {seasonPoints.map((point) => (
                  <li key={point.seasonId} className="faction-stats__h2h-row">
                    <span className="group-person__name">{point.seasonName}</span>
                    <span>{point.wins}-{point.losses}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <SeasonLineChart
                  points={seasonPoints}
                  ariaLabel={t('factions.stats.seasonByAria', 'Season-by-season wins and losses')}
                />
                <ul className="faction-stats__legend">
                  <li>
                    <span className="faction-stats__legend-dot faction-stats__legend-dot--win" />
                    {t('factions.stats.legendWins', 'Wins')}
                  </li>
                  <li>
                    <span className="faction-stats__legend-dot faction-stats__legend-dot--loss" />
                    {t('factions.stats.legendLosses', 'Losses')}
                  </li>
                </ul>
              </>
            )}
          </section>

          <section className="group-section">
            <h2 className="group-heading">{t('factions.stats.outcomeTitle', 'Match Outcome Distribution')}</h2>
            {totals.matchCount === 0 ? (
              <p className="group-empty">{t('factions.stats.outcomeEmpty', 'No outcomes to distribute yet.')}</p>
            ) : (
              <div className="faction-stats__outcome">
                <OutcomeDonut
                  wins={totals.wins}
                  losses={totals.losses}
                  draws={totals.draws}
                  ariaLabel={t('factions.stats.outcomeAria', 'Outcome distribution donut')}
                />
                <ul className="faction-stats__legend faction-stats__legend--stacked">
                  <li>
                    <span className="faction-stats__legend-dot faction-stats__legend-dot--win" />
                    {totals.wins} {t('factions.stats.legendWins', 'Wins')}
                  </li>
                  <li>
                    <span className="faction-stats__legend-dot faction-stats__legend-dot--loss" />
                    {totals.losses} {t('factions.stats.legendLosses', 'Losses')}
                  </li>
                  <li>
                    <span className="faction-stats__legend-dot faction-stats__legend-dot--draw" />
                    {totals.draws} {t('factions.stats.legendDraws', 'Draws')}
                  </li>
                </ul>
              </div>
            )}
          </section>
        </div>

        <aside className="faction-stats__column">
          <section className="group-section">
            <h2 className="group-heading">{t('factions.stats.leaderboardTitle', 'Individual Leaderboard')}</h2>
            {leaderboard.length === 0 ? (
              <p className="group-empty">{t('factions.stats.leaderboardEmpty', 'No member stats yet.')}</p>
            ) : (
              <ol className="group-list">
                {leaderboard.map((member, index) => (
                  <li key={member.playerId} className="faction-stats__leader-row">
                    <span className="group-muted">{index + 1}</span>
                    <Avatar src={imageByMember.get(member.playerId)} name={leaderName(member)} size="sm" />
                    <span className="group-person__name">{leaderName(member)}</span>
                    <span>{member.winPercentage > 0 ? `${member.winPercentage.toFixed(1)}%` : '—'}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="group-section">
            <h2 className="group-heading">{t('factions.stats.h2hTitle', 'vs Other Factions')}</h2>
            {h2hOrdered.length === 0 ? (
              <p className="group-empty">{t('factions.stats.h2hEmpty', 'No cross-faction matches yet.')}</p>
            ) : (
              <ul className="group-list">
                {h2hOrdered.map((row) => (
                  <li
                    key={row.factionId}
                    className={`faction-stats__h2h-row ${
                      row.factionId === comparisonFactionId ? 'faction-stats__h2h-row--focus' : ''
                    }`}
                  >
                    <span className="group-person__name">{row.factionName}</span>
                    <span>{row.wins}-{row.losses}-{row.draws}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="group-section">
            <h2 className="group-heading">{t('factions.stats.milestonesTitle', 'Records & Milestones')}</h2>
            <ul className="group-list">
              <li className="faction-stats__h2h-row">
                <span>{t('factions.redesign.bestCurrentStreak', 'Best current win streak')}</span>
                <strong>{bestCurrentStreak > 0 ? bestCurrentStreak : '—'}</strong>
              </li>
              <li className="faction-stats__h2h-row">
                <span>{t('factions.stats.milestoneMostWinsSeason', 'Most wins in a season')}</span>
                <strong>{mostWinsInASeason > 0 ? mostWinsInASeason : '—'}</strong>
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
