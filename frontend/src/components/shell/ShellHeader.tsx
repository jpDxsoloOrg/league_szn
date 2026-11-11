import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CircleHelp } from 'lucide-react';
import LanguageSwitcher from '../LanguageSwitcher';
import NotificationBell from '../NotificationBell';
import SearchLauncher from '../search/SearchLauncher';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { useLeaguePulse } from '../../hooks/useLeaguePulse';
import { useNavContext } from '../../hooks/useNavContext';
import { findSectionForPath, getPageInfo, isAdminPath, isHelpPath } from '../../config/navConfig';
import { formatCalendarDate } from '../../utils/dateUtils';
import './ShellHeader.css';

const SHORT_DATE: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

/**
 * Desktop top bar: where you are, the league's status strip (season, next
 * show, a live flag), then search and utilities. Navigation is in the sidebar.
 */
export default function ShellHeader() {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();
  const navContext = useNavContext();
  const { dashboard } = useLeaguePulse();

  const helpActive = isHelpPath(pathname);
  const sectionLabel = isAdminPath(pathname) ? t('nav.admin') : t(findSectionForPath(pathname)?.labelKey ?? 'nav.sections.home');
  const pageTitle = getPageInfo(pathname, t).title;

  const season = dashboard?.seasonInfo;
  const liveEvent = dashboard?.inProgressEvents[0];
  const nextEvent = dashboard?.upcomingEvents[0];

  return (
    <header className="shell-header">
      <div className="shell-header__inner">
        <p className="shell-header__crumb">
          <span className="shell-header__crumb-section">{sectionLabel}</span>
          {pageTitle !== sectionLabel && <span className="shell-header__crumb-page">{pageTitle}</span>}
        </p>
        <ul className="shell-header__status">
          {season && (
            <li className="shell-header__stat">
              <span className="shell-header__stat-label">{t('shell.status.season')}</span>
              <span className="shell-header__stat-value">{season.name}</span>
            </li>
          )}
          {nextEvent && (
            <li className="shell-header__stat">
              <span className="shell-header__stat-label">{t('shell.status.nextShow')}</span>
              <Link to={`/events/${nextEvent.eventId}`} className="shell-header__stat-value shell-header__stat-value--link">
                {nextEvent.name} · {formatCalendarDate(nextEvent.date, i18n.language, SHORT_DATE)}
              </Link>
            </li>
          )}
          {liveEvent && (
            <li className="shell-header__stat">
              <Link to={`/events/${liveEvent.eventId}`} className="shell-header__live" aria-label={`${t('shell.status.live')}: ${liveEvent.name}`}>
                <Badge tone="live">{t('shell.status.live')}</Badge>
              </Link>
            </li>
          )}
        </ul>
        <div className="shell-header__tools">
          <SearchLauncher />
          <NotificationBell />
          <LanguageSwitcher />
          <Link
            to="/guide"
            className={helpActive ? 'shell-header__icon-link shell-header__icon-link--active' : 'shell-header__icon-link'}
            aria-label={t('nav.help')}
            aria-current={helpActive ? 'page' : undefined}
          >
            <CircleHelp aria-hidden="true" size={22} />
          </Link>
          {!navContext.isAuthenticated && (
            <Button to="/login" variant="primary" size="sm" className="shell-header__sign-in">{t('common.signIn')}</Button>
          )}
        </div>
      </div>
    </header>
  );
}
