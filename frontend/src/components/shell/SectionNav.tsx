import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SectionTabs from '../ui/SectionTabs';
import { useNavContext } from '../../hooks/useNavContext';
import {
  SIGN_IN_PATHS,
  findActiveTab,
  findSectionForPath,
  getVisibleTabs,
  isTabVisible,
  type NavTab,
} from '../../config/navConfig';
import type { SectionTabItem } from '../ui/SectionTabs';
import './SectionNav.css';

/** Secondary tabs for the current section, plus third-level tabs where a tab has them. */
export default function SectionNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navContext = useNavContext();

  const section = findSectionForPath(pathname);
  if (!section || SIGN_IN_PATHS.includes(pathname)) return null;

  const tabs = getVisibleTabs(section, navContext);
  if (tabs.length < 2) return null;

  const toItems = (items: NavTab[]): SectionTabItem[] =>
    items.map((tab) => ({ to: tab.path, label: t(tab.labelKey) }));

  const activeTab = findActiveTab(tabs, pathname);
  const childTabs = activeTab?.children?.filter((tab) => isTabVisible(tab, navContext)) ?? [];
  const activeChild = findActiveTab(childTabs, pathname);

  return (
    <div className="section-nav">
      <SectionTabs
        className="section-nav__row"
        items={toItems(tabs)}
        activeTo={activeTab?.path ?? null}
        label={t(section.labelKey)}
      />
      {activeTab && childTabs.length > 0 && (
        <SectionTabs
          className="section-nav__row"
          variant="compact"
          items={toItems(childTabs)}
          activeTo={activeChild?.path ?? null}
          label={t(activeTab.labelKey)}
        />
      )}
    </div>
  );
}
