import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getAdminPath, getVisibleAdminGroups } from '../../config/navConfig';
import PageHeader from '../ui/PageHeader';
import './AdminHub.css';

/**
 * Mobile admin hub: a grouped, tappable list of every admin page the viewer can
 * open, rendered by AdminPanel at phone widths when no tab is selected.
 */

interface AdminHubProps {
  isSuperAdmin: boolean;
}

export default function AdminHub({ isSuperAdmin }: AdminHubProps) {
  const { t } = useTranslation();

  return (
    <>
      <PageHeader title={t('admin.panel.title')} />
      <nav className="admin-hub" aria-label={t('admin.panel.title')}>
        {getVisibleAdminGroups(isSuperAdmin).map((group) => (
          <section key={group.key} className="admin-hub-group">
            <h2 className="admin-hub-group-title">{t(group.labelKey)}</h2>
            <div className="admin-hub-card">
              {group.entries.map((entry) => {
                const Icon = entry.icon;
                return (
                  <Link
                    key={entry.tab}
                    to={getAdminPath(entry.tab)}
                    className={entry.danger ? 'admin-hub-row admin-hub-row-danger' : 'admin-hub-row'}
                  >
                    <span className="admin-hub-row-leading">
                      <span className={entry.danger ? 'admin-hub-icon-chip admin-hub-icon-chip-danger' : 'admin-hub-icon-chip'}>
                        <Icon aria-hidden="true" className="admin-hub-row-icon" size={20} />
                      </span>
                      <span className={entry.danger ? 'admin-hub-row-label admin-hub-row-label-danger' : 'admin-hub-row-label'}>
                        {t(entry.labelKey)}
                      </span>
                    </span>
                    <ChevronRight
                      aria-hidden="true"
                      size={20}
                      className={entry.danger ? 'admin-hub-row-chevron admin-hub-row-chevron-danger' : 'admin-hub-row-chevron'}
                    />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </nav>
    </>
  );
}

/** Small back row shown above a tab's content on mobile, navigating to the hub. */
export function AdminHubBackRow() {
  const { t } = useTranslation();
  return (
    <Link to="/admin" className="admin-hub-back-row">
      <ChevronLeft aria-hidden="true" size={20} className="admin-hub-back-chevron" />
      <span className="admin-hub-back-label">{t('admin.hub.back')}</span>
    </Link>
  );
}
