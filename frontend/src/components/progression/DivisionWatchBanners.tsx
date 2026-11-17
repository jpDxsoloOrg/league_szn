import { useSiteConfig } from '../../contexts/SiteConfigContext';
import ConsiderationBanner from './ConsiderationBanner';
import { canSeeRelegationFlag } from './divisionProgressVisibility';
import type { ProfileViewer } from './divisionProgressVisibility';

export interface DivisionWatchBannersProps {
  playerId: string;
  viewer: ProfileViewer;
}

/**
 * The "Promotion watch" banner for everyone, and the relegation banner only
 * for staff or when the league made the relegation watch public. The owner
 * never sees a relegation flag, and the relegation list is never requested
 * when it would answer 403.
 */
export default function DivisionWatchBanners({ playerId, viewer }: DivisionWatchBannersProps) {
  const { tickerSettings } = useSiteConfig();
  return (
    <>
      <ConsiderationBanner playerId={playerId} kind="promotion" />
      {canSeeRelegationFlag(viewer, tickerSettings.publicRelegationWatch) && (
        <ConsiderationBanner playerId={playerId} kind="relegation" />
      )}
    </>
  );
}
