import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { mockWrestlersWithCosts, mockDivisions } from '../../mocks/fantasyMockData';
import type { WrestlerWithCost } from '../../types/fantasy';
import './WrestlerCosts.css';

type SortField = 'name' | 'cost' | 'winRate' | 'trend';
type SortDirection = 'asc' | 'desc';

export default function WrestlerCosts() {
  const { t } = useTranslation();
  const [selectedDivision, setSelectedDivision] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('cost');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchQuery, setSearchQuery] = useState('');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const filteredAndSortedWrestlers = useMemo(() => {
    let wrestlers = [...mockWrestlersWithCosts];

    // Filter by division
    if (selectedDivision !== 'all') {
      wrestlers = wrestlers.filter((w) => w.divisionId === selectedDivision);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      wrestlers = wrestlers.filter(
        (w) =>
          w.currentWrestler.toLowerCase().includes(query) ||
          w.name.toLowerCase().includes(query)
      );
    }

    // Sort
    wrestlers.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.currentWrestler.localeCompare(b.currentWrestler);
          break;
        case 'cost':
          comparison = a.currentCost - b.currentCost;
          break;
        case 'winRate':
          comparison = a.winRate30Days - b.winRate30Days;
          break;
        case 'trend':
          const trendOrder = { up: 1, stable: 0, down: -1 };
          comparison = trendOrder[a.costTrend] - trendOrder[b.costTrend];
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return wrestlers;
  }, [selectedDivision, searchQuery, sortField, sortDirection]);

  const getDivisionName = (divisionId?: string): string => {
    if (!divisionId) return '-';
    const division = mockDivisions.find((d) => d.divisionId === divisionId);
    return division?.name || '-';
  };

  const getTrendDisplay = (wrestler: WrestlerWithCost) => {
    const diff = wrestler.currentCost - wrestler.baseCost;
    switch (wrestler.costTrend) {
      case 'up':
        return <span className="trend up">▲ +{diff}</span>;
      case 'down':
        return <span className="trend down">▼ {diff}</span>;
      default:
        return <span className="trend stable">— 0</span>;
    }
  };

  return (
    <div className="wrestler-costs">
      <header className="costs-header">
        <h1>{t('fantasy.costs.title')}</h1>
        <p className="subtitle">{t('fantasy.costs.subtitle')}</p>
      </header>

      <div className="costs-filters">
        <div className="search-box">
          <input
            type="text"
            placeholder={t('fantasy.costs.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="division-filter">
          <button
            className={`filter-btn ${selectedDivision === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedDivision('all')}
          >
            {t('common.all')}
          </button>
          {mockDivisions.map((division) => (
            <button
              key={division.divisionId}
              className={`filter-btn ${selectedDivision === division.divisionId ? 'active' : ''}`}
              onClick={() => setSelectedDivision(division.divisionId)}
            >
              {division.name}
            </button>
          ))}
        </div>
      </div>

      <div className="costs-table-wrapper">
        <table className="costs-table">
          <thead>
            <tr>
              <th className="col-wrestler">
                <button onClick={() => handleSort('name')}>
                  {t('fantasy.costs.wrestler')}
                  {sortField === 'name' && <SortIndicator direction={sortDirection} />}
                </button>
              </th>
              <th className="col-division">{t('fantasy.costs.division')}</th>
              <th className="col-cost">
                <button onClick={() => handleSort('cost')}>
                  {t('fantasy.costs.cost')}
                  {sortField === 'cost' && <SortIndicator direction={sortDirection} />}
                </button>
              </th>
              <th className="col-trend">
                <button onClick={() => handleSort('trend')}>
                  {t('fantasy.costs.trend')}
                  {sortField === 'trend' && <SortIndicator direction={sortDirection} />}
                </button>
              </th>
              <th className="col-record">{t('fantasy.costs.record')}</th>
              <th className="col-winrate">
                <button onClick={() => handleSort('winRate')}>
                  {t('fantasy.costs.winRate')}
                  {sortField === 'winRate' && <SortIndicator direction={sortDirection} />}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedWrestlers.map((wrestler) => (
              <tr key={wrestler.playerId}>
                <td className="col-wrestler">
                  <div className="wrestler-info">
                    {wrestler.imageUrl ? (
                      <img
                        src={wrestler.imageUrl}
                        alt={wrestler.currentWrestler}
                        className="wrestler-thumb"
                      />
                    ) : (
                      <div className="wrestler-thumb placeholder">
                        {wrestler.currentWrestler.charAt(0)}
                      </div>
                    )}
                    <div>
                      <span className="wrestler-name">{wrestler.currentWrestler}</span>
                      <span className="player-name">{wrestler.name}</span>
                    </div>
                  </div>
                </td>
                <td className="col-division">{getDivisionName(wrestler.divisionId)}</td>
                <td className="col-cost">
                  <span className="cost-value">${wrestler.currentCost}</span>
                  <span className="base-cost">(base: ${wrestler.baseCost})</span>
                </td>
                <td className="col-trend">{getTrendDisplay(wrestler)}</td>
                <td className="col-record">{wrestler.recentRecord}</td>
                <td className="col-winrate">
                  <div className="winrate-bar-container">
                    <div
                      className="winrate-bar"
                      style={{ width: `${wrestler.winRate30Days}%` }}
                    />
                    <span className="winrate-value">{wrestler.winRate30Days}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredAndSortedWrestlers.length === 0 && (
        <div className="no-results">
          <p>{t('fantasy.costs.noResults')}</p>
        </div>
      )}

      <div className="costs-info">
        <h3>{t('fantasy.costs.howCostsWork')}</h3>
        <ul>
          <li>{t('fantasy.costs.info1')}</li>
          <li>{t('fantasy.costs.info2')}</li>
          <li>{t('fantasy.costs.info3')}</li>
        </ul>
      </div>
    </div>
  );
}

function SortIndicator({ direction }: { direction: SortDirection }) {
  return <span className="sort-indicator">{direction === 'asc' ? '▲' : '▼'}</span>;
}
