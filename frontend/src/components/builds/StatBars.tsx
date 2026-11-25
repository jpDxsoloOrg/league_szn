import { useTranslation } from 'react-i18next';
import type { BuildCoreStat } from '../../services/api/builds.api';
import { BUILD_CORE_STATS, BUILD_STAT_CAP } from './buildDisplay';

type BuildStats = Record<BuildCoreStat, number>;
import './StatBars.css';

export interface StatBarProps {
  stat: BuildCoreStat;
  /** The value to show, style bonus included. */
  value: number;
  /** Part of `value` that comes from the style. Drawn in a second colour. */
  bonus?: number;
  /** Length of a full bar. Defaults to the stat cap (100). */
  max?: number;
}

/**
 * One labelled stat bar. The paid-for part and the style bonus are two
 * stacked <progress> bars, so no inline widths are needed.
 */
export function StatBar({ stat, value, bonus = 0, max = BUILD_STAT_CAP }: StatBarProps) {
  const { t } = useTranslation();
  const label = t(`builds.stats.${stat}`);
  const base = Math.max(0, value - bonus);
  const valueText = bonus > 0
    ? t('builds.statValueWithBonus', { value, bonus })
    : String(value);

  return (
    <li className="stat-bar" data-testid={`stat-bar-${stat}`}>
      <div className="stat-bar__header">
        <span className="stat-bar__label">{label}</span>
        <span className="stat-bar__value">
          {value}
          {bonus > 0 && (
            <span className="stat-bar__bonus">{t('builds.styleBonus', { bonus })}</span>
          )}
        </span>
      </div>
      <div className="stat-bar__track">
        <progress
          className="stat-bar__fill stat-bar__fill--total"
          value={value}
          max={max}
          aria-label={label}
          aria-valuetext={valueText}
        />
        <progress className="stat-bar__fill stat-bar__fill--base" value={base} max={max} aria-hidden="true" />
      </div>
    </li>
  );
}

export interface StatBarsProps {
  /** Values to show, style bonus included. */
  stats: BuildStats;
  /** Style bonus per stat (see `styleBonuses`). Omit to show plain bars. */
  bonuses?: Partial<BuildStats>;
  max?: number;
  className?: string;
}

/** The four core stats as bars, in the fixed stat order. */
export default function StatBars({ stats, bonuses, max, className = '' }: StatBarsProps) {
  return (
    <ul className={`stat-bars ${className}`.trim()}>
      {BUILD_CORE_STATS.map((stat) => (
        <StatBar key={stat} stat={stat} value={stats[stat]} bonus={bonuses?.[stat] ?? 0} max={max} />
      ))}
    </ul>
  );
}
