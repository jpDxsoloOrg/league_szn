import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { mockContractsApi, mockSeasonsApi, mockUseSiteConfig } = vi.hoisted(() => ({
  mockContractsApi: { getPlayerContract: vi.fn() },
  mockSeasonsApi: { getAll: vi.fn() },
  mockUseSiteConfig: vi.fn(),
}));

vi.mock('../../../services/api/contracts.api', () => ({ contractsApi: mockContractsApi }));
vi.mock('../../../services/api/seasons.api', () => ({ seasonsApi: mockSeasonsApi }));
vi.mock('../../../contexts/SiteConfigContext', () => ({ useSiteConfig: mockUseSiteConfig }));

import i18n from '../../../i18n';
import ContractBadge from '../ContractBadge';

describe('ContractBadge', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    mockUseSiteConfig.mockReturnValue({ features: { economy: true } });
    mockSeasonsApi.getAll.mockResolvedValue([{ seasonId: 's4', name: 'Season 4', status: 'active' }]);
  });

  it('shows nothing and asks for nothing while the economy is off', () => {
    mockUseSiteConfig.mockReturnValue({ features: { economy: false } });
    const { container } = render(<ContractBadge playerId="p1" />);

    expect(container).toBeEmptyDOMElement();
    expect(mockContractsApi.getPlayerContract).not.toHaveBeenCalled();
  });

  it('marks a free agent', async () => {
    mockContractsApi.getPlayerContract.mockResolvedValue({ playerId: 'p1', freeAgent: true, contract: null });
    render(<ContractBadge playerId="p1" />);

    expect(await screen.findByText('Free agent')).toBeInTheDocument();
    expect(mockSeasonsApi.getAll).not.toHaveBeenCalled();
  });

  it('names the season a season contract runs through', async () => {
    mockContractsApi.getPlayerContract.mockResolvedValue({
      playerId: 'p1',
      freeAgent: false,
      contract: { contractId: 'c1', playerId: 'p1', type: 'season', status: 'active', matchesPlayed: 2, seasonId: 's4' },
    });
    render(<ContractBadge playerId="p1" />);

    expect(await screen.findByText('Season contract, through Season 4')).toBeInTheDocument();
  });
});
