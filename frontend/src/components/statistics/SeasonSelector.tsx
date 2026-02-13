import { useTranslation } from 'react-i18next';
import type { Season } from '../../types';
import './SeasonSelector.css';

interface SeasonSelectorProps {
  seasons: Season[];
  selectedSeasonId: string;
  onSeasonChange: (seasonId: string) => void;
  compact?: boolean;
}

function SeasonSelector({ seasons, selectedSeasonId, onSeasonChange, compact }: SeasonSelectorProps) {
  const { t } = useTranslation();

  if (seasons.length === 0) {
    return null;
  }

  return (
    <div className={`ps-season-selector${compact ? ' ps-season-selector--compact' : ''}`}>
      <label htmlFor="season-stats-select">{t('standings.season')}:</label>
      <select
        id="season-stats-select"
        value={selectedSeasonId}
        onChange={(e) => onSeasonChange(e.target.value)}
      >
        <option value="">{t('standings.allTime')}</option>
        {seasons.map((season) => (
          <option key={season.seasonId} value={season.seasonId}>
            {season.name} {season.status === 'active' ? `(${t('common.active')})` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

export default SeasonSelector;
