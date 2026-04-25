import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { DashboardChampion } from '../types';
import {
  DEFAULT_WRESTLER_IMAGE,
  applyImageFallback,
  resolveImageSrc,
} from '../constants/imageFallbacks';
import './ChampionCarousel.css';

interface ChampionCarouselProps {
  champions: DashboardChampion[];
  /** Initial champion to display. If omitted, picks World Heavyweight then longest reign. */
  initialChampionshipId?: string;
  /** Auto-advance interval in ms. Set to 0 to disable. Defaults to 5000. */
  autoPlayInterval?: number;
}

function computeReignDays(wonDate?: string): number | null {
  if (!wonDate) return null;
  const diff = Date.now() - new Date(wonDate).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function pickInitialIndex(champions: DashboardChampion[], initialId?: string): number {
  if (initialId) {
    const idx = champions.findIndex((c) => c.championshipId === initialId);
    if (idx >= 0) return idx;
  }
  const worldIdx = champions.findIndex((c) =>
    c.championshipName.toLowerCase().includes('world heavyweight')
  );
  if (worldIdx >= 0) return worldIdx;
  let bestIdx = 0;
  let bestDays = -1;
  champions.forEach((c, i) => {
    const d = computeReignDays(c.wonDate) ?? 0;
    if (d > bestDays) {
      bestDays = d;
      bestIdx = i;
    }
  });
  return bestIdx;
}

export default function ChampionCarousel({
  champions,
  initialChampionshipId,
  autoPlayInterval = 5000,
}: ChampionCarouselProps) {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(() =>
    pickInitialIndex(champions, initialChampionshipId)
  );
  const [isPaused, setIsPaused] = useState(false);

  // Reset index when champions list changes (e.g., a champion is removed).
  useEffect(() => {
    setCurrentIndex((prev) =>
      prev < champions.length ? prev : pickInitialIndex(champions, initialChampionshipId)
    );
  }, [champions, initialChampionshipId]);

  const total = champions.length;
  const current = champions[currentIndex];

  const goNext = useCallback(() => {
    setCurrentIndex((i) => (total === 0 ? 0 : (i + 1) % total));
  }, [total]);

  // Auto-advance
  useEffect(() => {
    if (autoPlayInterval <= 0 || isPaused || total <= 1) return;
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;
    const id = window.setInterval(goNext, autoPlayInterval);
    return () => window.clearInterval(id);
  }, [autoPlayInterval, isPaused, total, goNext]);

  const reignDays = useMemo(
    () => (current ? computeReignDays(current.wonDate) : null),
    [current]
  );

  const others = useMemo(
    () => champions.filter((_, idx) => idx !== currentIndex),
    [champions, currentIndex]
  );

  if (total === 0 || !current) {
    return (
      <section className="db-hero db-hero--empty">
        <p className="db-empty-text">{t('dashboard.noChampions')}</p>
        <Link className="db-empty-action" to="/championships">
          {t('dashboard.emptyActions.viewChampionships', 'View championships')}
        </Link>
      </section>
    );
  }

  return (
    <section
      className="db-hero champion-carousel"
      aria-roledescription="carousel"
      aria-label={t('dashboard.viewAllChampions', 'View All Champions')}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="db-hero-image" key={`img-${current.championshipId}`}>
        <img
          src={resolveImageSrc(current.championImageUrl, DEFAULT_WRESTLER_IMAGE)}
          onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
          alt={current.championName}
        />
      </div>
      <div className="db-hero-content" aria-live="polite" aria-atomic="true">
        <span className="db-hero-belt">{current.championshipName}</span>
        <h2 className="db-hero-name">{current.championName}</h2>
        {reignDays !== null && (
          <div className="db-hero-stats">
            <span className="db-hero-stat">
              <span className="db-hero-stat-value">{reignDays}</span>
              <span className="db-hero-stat-label">
                {t('dashboard.daysReign', 'Day Reign')}
              </span>
            </span>
            {current.defenses != null && (
              <span className="db-hero-stat">
                <span className="db-hero-stat-value">{current.defenses}</span>
                <span className="db-hero-stat-label">
                  {t('dashboard.defenses', 'Defenses')}
                </span>
              </span>
            )}
          </div>
        )}
        <Link to="/championships" className="db-hero-link">
          {t('dashboard.viewAllChampions', 'View All Champions')} &rarr;
        </Link>
      </div>

      {others.length > 0 && (
        <div className="db-hero-others">
          {others.map((c) => {
            const idx = champions.findIndex((x) => x.championshipId === c.championshipId);
            return (
              <button
                key={c.championshipId}
                type="button"
                className="db-hero-other btn-unstyled"
                onClick={() => setCurrentIndex(idx)}
                aria-label={`${c.championshipName} — ${c.championName}`}
              >
                <img
                  src={resolveImageSrc(c.championImageUrl, DEFAULT_WRESTLER_IMAGE)}
                  onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
                  alt=""
                />
                <div className="db-hero-other-info">
                  <span className="db-hero-other-belt">{c.championshipName}</span>
                  <span className="db-hero-other-name">{c.championName}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
