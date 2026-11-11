import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import SectionTabs from '../ui/SectionTabs';

/** Links between the three faction hub pages. */
export default function FactionsHubTabs() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  return (
    <SectionTabs
      variant="compact"
      label={t('factions.title', 'Factions')}
      items={[
        { to: '/factions', label: t('factions.hub.tabAll', 'All Factions') },
        { to: '/factions/standings', label: t('factions.hub.tabStandings', 'Standings') },
        // Same check as the /my-faction route, so the tab never leads to a dead end.
        ...(hasRole('Wrestler') ? [{ to: '/my-faction', label: t('factions.hub.tabMine', 'My Faction') }] : []),
      ]}
    />
  );
}
