import { useTranslation } from 'react-i18next';
import SectionTabs from '../ui/SectionTabs';

/** Links between the three faction hub pages. */
export default function FactionsHubTabs() {
  const { t } = useTranslation();
  return (
    <SectionTabs
      variant="compact"
      label={t('factions.title', 'Factions')}
      items={[
        { to: '/factions', label: t('factions.hub.tabAll', 'All Factions') },
        { to: '/factions/standings', label: t('factions.hub.tabStandings', 'Standings') },
        { to: '/my-faction', label: t('factions.hub.tabMine', 'My Faction') },
      ]}
    />
  );
}
