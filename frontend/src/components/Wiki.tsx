import { Link, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import WikiBreadcrumbs from './WikiBreadcrumbs';
import './Wiki.css';

export function WikiLayout() {
  const { t } = useTranslation();
  return (
    <div className="wiki-layout">
      <WikiBreadcrumbs />
      <div className="wiki-layout-header">
        <Link to="/guide" className="wiki-back-link">
          {t('wiki.backToGuide')}
        </Link>
        <button
          type="button"
          className="wiki-print-btn"
          onClick={() => window.print()}
          aria-label={t('common.print')}
        >
          {t('common.print')}
        </button>
      </div>
      <Outlet />
    </div>
  );
}
