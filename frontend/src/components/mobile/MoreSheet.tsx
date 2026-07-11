import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useSiteConfig } from '../../contexts/SiteConfigContext';
import LanguageSwitcher from '../LanguageSwitcher';
import {
  USER_NAV_GROUPS,
  USER_NAV_STANDALONE,
  isUserItemVisible,
  type NavItem,
} from '../../config/navConfig';
import './MoreSheet.css';

/** Paths already present on the mobile bottom tab bar — never repeated here. */
const TAB_BAR_PATHS = ['/', '/standings', '/rivalries', '/profile'];

interface MoreSheetProps {
  open: boolean;
  onClose: () => void;
}

/** Feather-style icon shapes keyed by nav path (plus a few named extras). */
const ICON_SHAPES: Record<string, JSX.Element> = {
  '/activity': <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
  '/championships': (
    <>
      <circle cx="12" cy="8" r="6" />
      <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
    </>
  ),
  '/events': (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </>
  ),
  '/matches': <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  '/tournaments': (
    <>
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </>
  ),
  '/awards': (
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  ),
  '/contenders': (
    <>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </>
  ),
  '/stats': (
    <>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </>
  ),
  '/highlights': (
    <>
      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
      <line x1="7" y1="2" x2="7" y2="22" />
      <line x1="17" y1="2" x2="17" y2="22" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="2" y1="7" x2="7" y2="7" />
      <line x1="2" y1="17" x2="7" y2="17" />
      <line x1="17" y1="17" x2="22" y2="17" />
      <line x1="17" y1="7" x2="22" y2="7" />
    </>
  ),
  '/factions': (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  '/tag-teams': (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </>
  ),
  '/my-videos': (
    <>
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </>
  ),
  '/promos': (
    <>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </>
  ),
  '/my-faction': (
    <>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </>
  ),
  '/my-tag-team': (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
  '/guide': (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </>
  ),
  admin: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  language: (
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </>
  ),
  login: (
    <>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </>
  ),
  chevron: <polyline points="9 18 15 12 9 6" />,
};

function RowIcon({ iconKey, className }: { iconKey: string; className?: string }) {
  const shape = ICON_SHAPES[iconKey] ?? <circle cx="12" cy="12" r="9" />;
  return (
    <svg
      className={className ?? 'more-sheet-row-icon'}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {shape}
    </svg>
  );
}

export default function MoreSheet({ open, onClose }: MoreSheetProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isAdminOrModerator, isWrestler, signOut } = useAuth();
  const { features } = useSiteConfig();
  const previousPathnameRef = useRef(location.pathname);

  // Close on route change (same pattern as Sidebar's mobile drawer)
  useEffect(() => {
    if (location.pathname !== previousPathnameRef.current) {
      previousPathnameRef.current = location.pathname;
      onClose();
    }
  }, [location.pathname, onClose]);

  // Close on escape key
  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  // Prevent body scroll while the sheet is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const handleNavigate = useCallback(
    (path: string) => {
      onClose();
      navigate(path);
    },
    [navigate, onClose]
  );

  const handleLogout = useCallback(async () => {
    onClose();
    await signOut();
  }, [onClose, signOut]);

  if (!open) return null;

  const renderItemRow = (item: NavItem) => {
    const { show, disabled, disabledLabel } = isUserItemVisible(item, features, isWrestler);
    if (!show) return null;
    if (disabled && disabledLabel) {
      return (
        <div key={item.path} className="more-sheet-row more-sheet-row-disabled">
          <span className="more-sheet-row-leading">
            <RowIcon iconKey={item.path} />
            <span className="more-sheet-row-label">{t(item.i18nKey)}</span>
          </span>
          <span className="more-sheet-row-locked">{disabledLabel}</span>
        </div>
      );
    }
    return (
      <button
        key={item.path}
        type="button"
        className="more-sheet-row"
        onClick={() => handleNavigate(item.path)}
      >
        <span className="more-sheet-row-leading">
          <RowIcon iconKey={item.path} />
          <span className="more-sheet-row-label">{t(item.i18nKey)}</span>
        </span>
        <RowIcon iconKey="chevron" className="more-sheet-row-chevron" />
      </button>
    );
  };

  return (
    <>
      <div className="more-sheet-scrim" onClick={onClose} aria-hidden="true" />
      <div className="more-sheet" role="dialog" aria-modal="true" aria-label={t('mobileNav.more')}>
        <div className="more-sheet-handle" aria-hidden="true" />
        <h2 className="more-sheet-title">{t('mobileNav.more')}</h2>
        <div className="more-sheet-content">
          {isAdminOrModerator && (
            <button
              type="button"
              className="more-sheet-row more-sheet-admin-row"
              onClick={() => handleNavigate('/admin')}
            >
              <span className="more-sheet-row-leading">
                <span className="more-sheet-admin-icon">
                  <RowIcon iconKey="admin" className="more-sheet-admin-shield" />
                </span>
                <span className="more-sheet-admin-label">{t('admin.panel.title')}</span>
              </span>
              <RowIcon iconKey="chevron" className="more-sheet-row-chevron more-sheet-admin-chevron" />
            </button>
          )}

          {USER_NAV_GROUPS.map((group) => {
            const visibleItems = group.items.filter(
              (item) =>
                !TAB_BAR_PATHS.includes(item.path) &&
                isUserItemVisible(item, features, isWrestler).show
            );
            if (visibleItems.length === 0) return null;
            return (
              <section key={group.key} className="more-sheet-group">
                <h3 className="more-sheet-group-title">{t(group.i18nKey)}</h3>
                <div className="more-sheet-card">{visibleItems.map(renderItemRow)}</div>
              </section>
            );
          })}

          <section className="more-sheet-group">
            <div className="more-sheet-card">
              {USER_NAV_STANDALONE.filter((item) => !TAB_BAR_PATHS.includes(item.path)).map(
                renderItemRow
              )}
              <div className="more-sheet-row more-sheet-language-row">
                <span className="more-sheet-row-leading">
                  <RowIcon iconKey="language" />
                  <span className="more-sheet-row-label">{t('languageSwitcher.label')}</span>
                </span>
                <LanguageSwitcher />
              </div>
              {isAuthenticated ? (
                <button
                  type="button"
                  className="more-sheet-row more-sheet-logout-row"
                  onClick={handleLogout}
                >
                  <span className="more-sheet-row-leading">
                    <RowIcon iconKey="logout" className="more-sheet-row-icon more-sheet-logout-icon" />
                    <span className="more-sheet-row-label">{t('common.logout')}</span>
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  className="more-sheet-row more-sheet-login-row"
                  onClick={() => handleNavigate('/login')}
                >
                  <span className="more-sheet-row-leading">
                    <RowIcon iconKey="login" />
                    <span className="more-sheet-row-label">{t('common.signIn')}</span>
                  </span>
                  <RowIcon iconKey="chevron" className="more-sheet-row-chevron" />
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
