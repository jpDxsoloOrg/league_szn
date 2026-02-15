import { Link, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './Wiki.css';

export function WikiLayout() {
  const { t } = useTranslation();
  return (
    <div className="wiki-layout">
      <Link to="/guide" className="wiki-back-link">
        {t('wiki.backToGuide')}
      </Link>
      <Outlet />
    </div>
  );
}
