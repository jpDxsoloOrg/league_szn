import { useTranslation } from 'react-i18next';
import type { Season } from '../../types';
import Select from '../ui/Select';

interface SeasonSelectorProps {
  seasons: Season[];
  selectedSeasonId: string;
  onSeasonChange: (seasonId: string) => void;
}

function SeasonSelector({ seasons, selectedSeasonId, onSeasonChange }: SeasonSelectorProps) {
  const { t } = useTranslation();

  if (seasons.length === 0) {
    return null;
  }

  return (
    <Select
      id="season-stats-select"
      label={t('standings.season')}
      value={selectedSeasonId}
      onValueChange={onSeasonChange}
      options={[
        { value: '', label: t('standings.allTime') },
        ...seasons.map((season) => ({
          value: season.seasonId,
          label: season.status === 'active' ? `${season.name} (${t('common.active')})` : season.name,
        })),
      ]}
    />
  );
}

export default SeasonSelector;
