import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Trophy } from 'lucide-react';
import { useSiteConfig } from '../../contexts/SiteConfigContext';
import { useTagTeamContenderRanks } from '../../hooks/useTagTeamContenderRanks';
import './TagTeamContenderChip.css';

interface TagTeamContenderChipProps {
  tagTeamId: string;
}

/**
 * "#3 contender — World Tag Team Championship" chips, one per tag title the
 * team is ranked on. Renders nothing while loading, when the team is not
 * ranked anywhere, or when the contenders feature is off.
 */
export default function TagTeamContenderChip({ tagTeamId }: TagTeamContenderChipProps) {
  const { t } = useTranslation();
  const { features } = useSiteConfig();
  const { standings } = useTagTeamContenderRanks(features.contenders ? tagTeamId : null);

  const ranked = standings.flatMap((standing) => (standing.status === 'ranked' ? [standing] : []));
  if (ranked.length === 0) return null;

  return (
    <ul className="tag-contender-chips" aria-label={t('tagTeams.contenderChip.listLabel')}>
      {ranked.map((standing) => (
        <li key={standing.championshipId}>
          <Link to="/contenders" className="tag-contender-chip">
            <Trophy aria-hidden="true" size={14} />
            {t('tagTeams.contenderChip.label', {
              rank: standing.rank,
              championship: standing.championshipName,
            })}
          </Link>
        </li>
      ))}
    </ul>
  );
}
