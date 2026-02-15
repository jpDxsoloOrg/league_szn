import { Link, Outlet, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import WikiBreadcrumbs from './WikiBreadcrumbs';
import WikiSidebar from './WikiSidebar';
import './Wiki.css';

export function WikiLayout() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug?: string }>();
  const isArticleView = Boolean(slug);

  return (
    <div className={`wiki-layout ${isArticleView ? 'wiki-layout-with-sidebar' : ''}`}>
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
      {isArticleView ? (
        <div className="wiki-layout-body">
          <WikiSidebar />
          <div className="wiki-layout-main">
            <Outlet />
          </div>
        </div>
      ) : (
        <Outlet />
      )}
    </div>
  );
}
