import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Film, Tv } from 'lucide-react';
import PageHeader from '../ui/PageHeader';
import SectionTabs from '../ui/SectionTabs';
import EpisodeList from './EpisodeList';
import HighlightsList from './HighlightsList';
import './Episodes.css';

const EPISODES_PATH = '/episodes';
const HIGHLIGHTS_PATH = '/episodes/highlights';

/** Episodes section: Full Episodes (YouTube) and Highlights (site-hosted) as route tabs. */
export default function Episodes() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const showHighlights = pathname.replace(/\/+$/, '') === HIGHLIGHTS_PATH;

  return (
    <div className="episodes-page">
      <PageHeader title={t('episodes.title')} subtitle={t('episodes.subtitle')} />
      <SectionTabs
        className="episodes-tabs"
        variant="compact"
        label={t('episodes.tabsLabel')}
        activeTo={showHighlights ? HIGHLIGHTS_PATH : EPISODES_PATH}
        items={[
          { to: EPISODES_PATH, label: t('episodes.tabs.full'), icon: <Tv aria-hidden="true" size={16} /> },
          { to: HIGHLIGHTS_PATH, label: t('episodes.tabs.highlights'), icon: <Film aria-hidden="true" size={16} /> },
        ]}
      />
      {showHighlights ? <HighlightsList /> : <EpisodeList />}
    </div>
  );
}
