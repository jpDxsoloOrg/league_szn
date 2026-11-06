import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAdminPath, getVisibleAdminGroups, type AdminTab } from '../../config/navConfig';
import type { SiteFeatures } from '../../services/api';
import './AdminNav.css';

export interface AdminNavProps {
  activeTab: AdminTab;
  isSuperAdmin: boolean;
  features: SiteFeatures;
}

/** Desktop admin sidebar, built from the same registry as the mobile hub. */
export default function AdminNav({ activeTab, isSuperAdmin, features }: AdminNavProps) {
  const { t } = useTranslation();

  return (
    <nav className="admin-nav" aria-label={t('admin.panel.title')}>
      {getVisibleAdminGroups(isSuperAdmin, features).map((group) => (
        <section key={group.key} className="admin-nav__group">
          <h2 className="admin-nav__heading">{t(group.labelKey)}</h2>
          <ul className="admin-nav__list">
            {group.entries.map((entry) => {
              const Icon = entry.icon;
              const active = entry.tab === activeTab;
              return (
                <li key={entry.tab}>
                  <Link
                    to={getAdminPath(entry.tab)}
                    aria-current={active ? 'page' : undefined}
                    className={[
                      'admin-nav__link',
                      active ? 'admin-nav__link--active' : '',
                      entry.danger ? 'admin-nav__link--danger' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <Icon aria-hidden="true" size={18} />
                    {t(entry.labelKey)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}
