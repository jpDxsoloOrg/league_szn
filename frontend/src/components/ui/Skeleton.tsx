import React from 'react';
import { useTranslation } from 'react-i18next';
import './Skeleton.css';

export type SkeletonVariant = 'table' | 'cards' | 'calendar' | 'block';

export interface SkeletonProps {
  variant: SkeletonVariant;
  /** Number of table rows or card items (default: 5 for table, 6 for cards) */
  count?: number;
  /** Optional className for the wrapper */
  className?: string;
}

export default function Skeleton({ variant, count, className = '' }: SkeletonProps) {
  const { t } = useTranslation();
  const ariaLabel = t('common.loading', 'Loading');

  if (variant === 'table') {
    const rows = count ?? 5;
    return (
      <div className={`skeleton skeleton-table ${className}`} role="status" aria-label={ariaLabel}>
        <div className="skeleton-table-header">
          <span className="skeleton-line skeleton-th" />
          <span className="skeleton-line skeleton-th" />
          <span className="skeleton-line skeleton-th" />
          <span className="skeleton-line skeleton-th" />
          <span className="skeleton-line skeleton-th" />
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="skeleton-table-row">
            <span className="skeleton-line" />
            <span className="skeleton-line" />
            <span className="skeleton-line" />
            <span className="skeleton-line" />
            <span className="skeleton-line" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'cards') {
    const cards = count ?? 6;
    return (
      <div className={`skeleton skeleton-cards ${className}`} role="status" aria-label={ariaLabel}>
        <div className="skeleton-cards-grid">
          {Array.from({ length: cards }, (_, i) => (
            <div key={i} className="skeleton-card">
              <div className="skeleton-card-image" />
              <div className="skeleton-line skeleton-card-title" />
              <div className="skeleton-line skeleton-card-sub" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'calendar') {
    const weeks = 5;
    const daysPerWeek = 7;
    return (
      <div className={`skeleton skeleton-calendar ${className}`} role="status" aria-label={ariaLabel}>
        <div className="skeleton-calendar-header">
          <span className="skeleton-line skeleton-calendar-title" />
        </div>
        <div className="skeleton-calendar-weekdays">
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className="skeleton-line skeleton-weekday" />
          ))}
        </div>
        <div className="skeleton-calendar-grid">
          {Array.from({ length: weeks * daysPerWeek }, (_, i) => (
            <div key={i} className="skeleton-calendar-cell" />
          ))}
        </div>
      </div>
    );
  }

  // block: generic blocks
  const blocks = count ?? 3;
  return (
    <div className={`skeleton skeleton-block ${className}`} role="status" aria-label={ariaLabel}>
      {Array.from({ length: blocks }, (_, i) => (
        <div key={i} className="skeleton-block-item" />
      ))}
    </div>
  );
}
