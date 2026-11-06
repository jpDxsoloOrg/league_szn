import type { ReactNode } from 'react';
import './PageHeader.css';

export interface PageHeaderProps {
  title: string;
  /** Small label above the title. */
  eyebrow?: string;
  subtitle?: string;
  /** Filters or buttons, aligned right on desktop and below on mobile. */
  actions?: ReactNode;
  className?: string;
}

/** Page title block. Renders the page's h1. */
export default function PageHeader({ title, eyebrow, subtitle, actions, className = '' }: PageHeaderProps) {
  return (
    <header className={`page-header ${className}`.trim()}>
      <div className="page-header__text">
        {eyebrow && <p className="page-header__eyebrow">{eyebrow}</p>}
        <h1 className="page-header__title">{title}</h1>
        {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}
