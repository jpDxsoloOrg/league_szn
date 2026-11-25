import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileSignature } from 'lucide-react';
import { useSiteConfig } from '../../contexts/SiteConfigContext';
import { contractsApi, type PublicContract } from '../../services/api/contracts.api';
import { seasonsApi } from '../../services/api/seasons.api';
import Badge from '../ui/Badge';
import { contractBadgeLabel } from './contractDisplay';
import './ContractBadge.css';

interface BadgeState {
  contract: PublicContract | null;
  seasonNames: Map<string, string>;
}

export interface ContractBadgeProps {
  playerId: string;
}

/**
 * Public contract badge on a profile (ECO-12): "Season contract, through
 * Season 4" or "Free agent". Never shows money. Renders nothing while the
 * economy is off, while loading, or if the lookup fails.
 */
export default function ContractBadge({ playerId }: ContractBadgeProps) {
  const { t } = useTranslation();
  const { features } = useSiteConfig();
  const enabled = Boolean(features.economy);
  const [state, setState] = useState<BadgeState | null>(null);

  useEffect(() => {
    setState(null);
    if (!enabled) return undefined;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await contractsApi.getPlayerContract(playerId, controller.signal);
        const seasons = response.contract?.seasonId ? await seasonsApi.getAll(controller.signal) : [];
        if (controller.signal.aborted) return;
        setState({
          contract: response.contract,
          seasonNames: new Map(seasons.map((season) => [season.seasonId, season.name])),
        });
      } catch {
        // The badge is extra information; the profile stays usable without it.
      }
    };
    void load();
    return () => controller.abort();
  }, [enabled, playerId]);

  if (!enabled || !state) return null;

  return (
    <div className="contract-badge" data-testid="contract-badge">
      <Badge
        tone={state.contract ? 'primary' : 'neutral'}
        icon={<FileSignature size={14} aria-hidden="true" />}
      >
        {contractBadgeLabel(state.contract, state.seasonNames, t)}
      </Badge>
    </div>
  );
}
