import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './TopBar.css';

export default function TopBar() {
  const location = useLocation();
  const { t } = useTranslation();

  const getPageTitle = (): string => {
    const path = location.pathname;

    if (path === '/') return t('nav.standings');
    if (path === '/championships') return t('nav.championships');
    if (path === '/matches') return t('nav.matches');
    if (path === '/tournaments') return t('nav.tournaments');
    if (path === '/guide') return t('nav.help');
    if (path.startsWith('/admin')) return t('nav.admin');
    if (path.startsWith('/challenges')) return t('nav.challenges');
    if (path.startsWith('/promos')) return t('nav.promos');
    if (path.startsWith('/stats')) return t('nav.statistics');
    if (path.startsWith('/events')) return t('nav.events');
    if (path.startsWith('/contenders')) return t('nav.contenders');
    if (path.startsWith('/fantasy')) return t('nav.fantasy');

    return t('nav.standings');
  };

  return (
    <div className="top-bar">
      <h1 className="page-title">{getPageTitle()}</h1>
    </div>
  );
}
