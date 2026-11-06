import { Outlet, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Printer } from 'lucide-react';
import Button from './ui/Button';
import WikiBreadcrumbs from './WikiBreadcrumbs';
import WikiSidebar from './WikiSidebar';
import './Wiki.css';

export function WikiLayout() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug?: string }>();
  const isArticleView = Boolean(slug);

  return (
    <div className={`wiki-layout ${isArticleView ? 'wiki-layout-with-sidebar' : ''}`}>
      <div className="wiki-layout-header">
        <WikiBreadcrumbs />
        <Button
          variant="ghost"
          size="sm"
          className="wiki-print-button"
          icon={<Printer aria-hidden="true" size={16} />}
          onClick={() => window.print()}
        >
          {t('common.print')}
        </Button>
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
