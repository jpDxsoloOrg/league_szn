import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useScrollFade } from '../../hooks/useScrollFade';
import './SectionTabs.css';

export interface SectionTabItem {
  to: string;
  label: string;
  icon?: ReactNode;
}

export interface SectionTabsProps {
  items: SectionTabItem[];
  /** Names the navigation landmark for screen readers. */
  label: string;
  /** `to` of the active item. Defaults to an exact match on the current path. */
  activeTo?: string | null;
  /** `default` is the underlined section row. `compact` is the third-level row of pills. */
  variant?: 'default' | 'compact';
  className?: string;
}

/** Route-driven tab row. Scrolls horizontally when it does not fit. */
export default function SectionTabs({ items, label, activeTo, variant = 'default', className = '' }: SectionTabsProps) {
  const { pathname } = useLocation();
  const activeLinkRef = useRef<HTMLAnchorElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useScrollFade(listRef);
  const currentTo = activeTo === undefined ? pathname : activeTo;

  useEffect(() => {
    const link = activeLinkRef.current;
    const list = link?.parentElement?.parentElement;
    if (!link || !list) return;
    const start = link.offsetLeft - list.offsetLeft;
    list.scrollLeft = start - (list.clientWidth - link.offsetWidth) / 2;
  }, [currentTo]);

  return (
    <nav className={`section-tabs section-tabs--${variant} ${className}`.trim()} aria-label={label}>
      <ul ref={listRef} className="section-tabs__list">
        {items.map((item) => {
          const active = item.to === currentTo;
          return (
            <li key={item.to} className="section-tabs__item">
              <Link
                ref={active ? activeLinkRef : undefined}
                to={item.to}
                className={active ? 'section-tabs__link section-tabs__link--active' : 'section-tabs__link'}
                aria-current={active ? 'page' : undefined}
              >
                {item.icon}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
