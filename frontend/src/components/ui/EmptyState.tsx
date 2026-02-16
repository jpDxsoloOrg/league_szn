import React from 'react';
import './EmptyState.css';

export interface EmptyStateProps {
  /** Optional icon (ReactNode) or icon name for future icon set */
  icon?: React.ReactNode;
  title: string;
  description: string;
  /** CTA button label; if not provided, no button is shown */
  actionLabel?: string;
  /** CTA click handler */
  onAction?: () => void;
  /** Optional class name for the container */
  className?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`empty-state-ui ${className}`} role="status" aria-label={title}>
      {icon && <div className="empty-state-ui__icon">{icon}</div>}
      <h2 className="empty-state-ui__title">{title}</h2>
      <p className="empty-state-ui__description">{description}</p>
      {actionLabel && onAction && (
        <button type="button" className="empty-state-ui__action" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
