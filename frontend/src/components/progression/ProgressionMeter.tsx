import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProgressionKind } from '../../types/progression';
import { clampPct } from './progressionFormat';
import './ProgressionMeter.css';

export interface ProgressionMeterProps {
  /** 0-100; values outside the range are clamped. */
  pct: number;
  /** Sets the colour: callup green, promotion gold, relegation red. */
  kind: ProgressionKind;
  /** Defaults to the kind's label, e.g. "Call-Up Progress". */
  label?: string;
  /** Secondary line under the label, e.g. the track name. */
  caption?: string;
  size?: 'md' | 'sm';
  className?: string;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A labelled progress bar toward a progression goal. The fill grows in from
 * zero on mount; the CSS transition is off under prefers-reduced-motion.
 */
export default function ProgressionMeter({
  pct,
  kind,
  label,
  caption,
  size = 'md',
  className = '',
}: ProgressionMeterProps) {
  const { t } = useTranslation();
  const target = clampPct(pct);
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? target : 0));

  useEffect(() => {
    // One frame at the old value lets the transition run.
    const frame = window.requestAnimationFrame(() => setShown(target));
    return () => window.cancelAnimationFrame(frame);
  }, [target]);

  const title = label ?? t(`progression.meter.label.${kind}`);
  const rounded = Math.round(target);

  return (
    <div className={`progression-meter progression-meter--${kind} progression-meter--${size} ${className}`.trim()}>
      <div className="progression-meter__header">
        <span className="progression-meter__label">{title}</span>
        <span className="progression-meter__pct" data-testid="progression-meter-pct">
          {t('progression.meter.percent', { pct: rounded })}
        </span>
      </div>
      <progress
        className="progression-meter__bar"
        value={shown}
        max={100}
        aria-label={title}
        aria-valuetext={t('progression.meter.percent', { pct: rounded })}
      />
      {caption && <span className="progression-meter__caption">{caption}</span>}
    </div>
  );
}
