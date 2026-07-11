import type { ReactElement } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useSiteConfig } from '../../contexts/SiteConfigContext';
import { USER_NAV_GROUPS, type NavItem } from '../../config/navConfig';
import './BottomTabBar.css';

interface BottomTabBarProps {
  /** Called when the "More" tab is tapped (opens the More sheet/menu). */
  onMoreClick: () => void;
  /** When true, the "More" tab renders in its active state. */
  isMoreOpen: boolean;
}

type TabIconName = 'home' | 'standings' | 'rivalries' | 'championships' | 'profile' | 'more';

interface TabDefinition {
  key: string;
  path: string;
  labelKey: string;
  icon: TabIconName;
  /** Active only on an exact pathname match (used for Home). */
  exact: boolean;
}

/** Look up a nav item from the shared nav config so labels stay in sync with the Sidebar. */
function findNavItem(path: string): NavItem | undefined {
  for (const group of USER_NAV_GROUPS) {
    for (const item of group.items) {
      if (item.path === path) return item;
    }
  }
  return undefined;
}

function navLabelKey(path: string, fallbackKey: string): string {
  return findNavItem(path)?.i18nKey ?? fallbackKey;
}

function TabIcon({ name, filled }: { name: TabIconName; filled: boolean }): ReactElement {
  const strokeProps = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: filled ? 'currentColor' : 'none',
    stroke: 'currentColor',
    strokeWidth: filled ? 1.5 : 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className: 'bottom-tab-bar__icon',
  };

  switch (name) {
    case 'home':
      return (
        <svg {...strokeProps}>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" fill={filled ? 'var(--color-surface)' : 'none'} />
        </svg>
      );
    case 'standings':
      return (
        <svg {...strokeProps} fill="none" strokeWidth={2.5}>
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      );
    case 'rivalries':
      return (
        <svg {...strokeProps}>
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        </svg>
      );
    case 'championships':
      return (
        <svg {...strokeProps}>
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" fill="none" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" fill="none" />
          <path d="M4 22h16" fill="none" />
          <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22h10c0-1.76-.85-3.25-2.03-3.79-.5-.23-.97-.66-.97-1.21v-2.34" fill="none" />
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
        </svg>
      );
    case 'profile':
      return (
        <svg {...strokeProps}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" fill="none" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case 'more':
      return (
        <svg {...strokeProps} fill="none" strokeWidth={filled ? 3 : 2}>
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      );
  }
}

export default function BottomTabBar({ onMoreClick, isMoreOpen }: BottomTabBarProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const { features } = useSiteConfig();

  // Third slot: Rivalries when the feature is on, Championships otherwise.
  const thirdTab: TabDefinition = features.rivalries
    ? { key: 'rivalries', path: '/rivalries', labelKey: navLabelKey('/rivalries', 'nav.rivalries'), icon: 'rivalries', exact: false }
    : { key: 'championships', path: '/championships', labelKey: navLabelKey('/championships', 'nav.championships'), icon: 'championships', exact: false };

  // Profile slot: signed-out users are sent to the login page instead.
  const profileTab: TabDefinition = {
    key: 'profile',
    path: isAuthenticated ? '/profile' : '/login',
    labelKey: 'mobileNav.profile',
    icon: 'profile',
    exact: false,
  };

  const tabs: TabDefinition[] = [
    { key: 'home', path: '/', labelKey: 'mobileNav.home', icon: 'home', exact: true },
    { key: 'standings', path: '/standings', labelKey: navLabelKey('/standings', 'nav.standings'), icon: 'standings', exact: false },
    thirdTab,
    profileTab,
  ];

  const isTabActive = (tab: TabDefinition): boolean => {
    if (isMoreOpen) return false;
    if (tab.exact) return location.pathname === tab.path;
    return location.pathname === tab.path || location.pathname.startsWith(tab.path + '/');
  };

  return (
    <nav className="bottom-tab-bar" aria-label={t('mobileNav.ariaLabel')}>
      {tabs.map((tab) => {
        const active = isTabActive(tab);
        return (
          <Link
            key={tab.key}
            to={tab.path}
            className={`bottom-tab-bar__item ${active ? 'bottom-tab-bar__item--active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <TabIcon name={tab.icon} filled={active} />
            <span className="bottom-tab-bar__label">{t(tab.labelKey)}</span>
          </Link>
        );
      })}
      <button
        type="button"
        className={`bottom-tab-bar__item ${isMoreOpen ? 'bottom-tab-bar__item--active' : ''}`}
        onClick={onMoreClick}
        aria-expanded={isMoreOpen}
        aria-haspopup="true"
      >
        <TabIcon name="more" filled={isMoreOpen} />
        <span className="bottom-tab-bar__label">{t('mobileNav.more')}</span>
      </button>
    </nav>
  );
}
