import { useTranslation } from 'react-i18next';
import Select from '../ui/Select';
import SeasonSelector from './SeasonSelector';
import type { LeaderboardFilterState } from './useLeaderboardFilters';

interface LeaderboardFiltersProps {
  filters: LeaderboardFilterState;
}

function LeaderboardFilters({ filters }: LeaderboardFiltersProps) {
  const { t } = useTranslation();
  // Both filters default to "All", so the option text says which one it is.
  const allOption = (label: string) => ({ value: '', label: `${label}: ${t('common.all')}` });
  const matchTypeLabel = t('statistics.labels.matchType');
  const stipulationLabel = t('statistics.labels.stipulation');

  return (
    <>
      <SeasonSelector
        seasons={filters.seasons}
        selectedSeasonId={filters.seasonId}
        onSeasonChange={filters.setSeason}
      />
      {filters.matchTypes.length > 0 && (
        <Select
          label={matchTypeLabel}
          value={filters.matchTypeId}
          onValueChange={filters.setMatchType}
          options={[allOption(matchTypeLabel), ...filters.matchTypes.map((matchType) => ({ value: matchType.matchTypeId, label: matchType.name }))]}
        />
      )}
      {filters.stipulations.length > 0 && (
        <Select
          label={stipulationLabel}
          value={filters.stipulationId}
          onValueChange={filters.setStipulation}
          options={[allOption(stipulationLabel), ...filters.stipulations.map((stipulation) => ({ value: stipulation.stipulationId, label: stipulation.name }))]}
        />
      )}
    </>
  );
}

export default LeaderboardFilters;
