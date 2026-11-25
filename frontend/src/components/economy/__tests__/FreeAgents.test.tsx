import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const { mockContractsApi, mockDivisionsApi, mockEconomyApi, mockSeasonsApi, mockUseAuth } = vi.hoisted(() => ({
  mockContractsApi: { getFreeAgents: vi.fn(), offer: vi.fn() },
  mockDivisionsApi: { getAll: vi.fn() },
  mockEconomyApi: { getConfig: vi.fn() },
  mockSeasonsApi: { getAll: vi.fn() },
  mockUseAuth: vi.fn(),
}));

vi.mock('../../../services/api/contracts.api', () => ({ contractsApi: mockContractsApi }));
vi.mock('../../../services/api/divisions.api', () => ({ divisionsApi: mockDivisionsApi }));
vi.mock('../../../services/api/economy.api', async () => {
  const actual = await vi.importActual<typeof import('../../../services/api/economy.api')>('../../../services/api/economy.api');
  return { ...actual, economyApi: mockEconomyApi };
});
vi.mock('../../../services/api/seasons.api', () => ({ seasonsApi: mockSeasonsApi }));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: mockUseAuth }));

import i18n from '../../../i18n';
import FreeAgents from '../FreeAgents';

const freeAgents = [
  {
    playerId: 'p1', name: 'Alex', currentWrestler: 'Cody Rhodes', wins: 7, losses: 3, draws: 1,
    divisionId: 'd1', hasLinkedAccount: true, createdAt: '', updatedAt: '',
  },
  {
    playerId: 'p2', name: 'Sam', currentWrestler: 'Seth Rollins', wins: 0, losses: 0, draws: 0,
    hasLinkedAccount: false, createdAt: '', updatedAt: '',
  },
];

function renderPage() {
  return render(<MemoryRouter><FreeAgents /></MemoryRouter>);
}

describe('FreeAgents', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    mockUseAuth.mockReturnValue({ isAdminOrModerator: false });
    mockContractsApi.getFreeAgents.mockResolvedValue(freeAgents);
    mockDivisionsApi.getAll.mockResolvedValue([{ divisionId: 'd1', name: 'Raw' }]);
    mockEconomyApi.getConfig.mockResolvedValue({
      settings: {
        currencySymbol: '$',
        offerExpiryDays: 3,
        contractDefaults: {
          tryout: { matches: 3, perMatchPay: 100, weeklySalary: 0, winBonus: 50 },
          matches: { perMatchPay: 150, weeklySalary: 0, winBonus: 75 },
          season: { perMatchPay: 120, weeklySalary: 250, winBonus: 100 },
        },
      },
    });
    mockSeasonsApi.getAll.mockResolvedValue([{ seasonId: 's4', name: 'Season 4', status: 'active' }]);
  });

  it('lists free agents with record and division and no offer button for the public', async () => {
    renderPage();

    const row = (await screen.findByText('Cody Rhodes')).closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('7-3-1')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('Raw')).toBeInTheDocument();
    expect(screen.getByText('No division')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Offer contract' })).not.toBeInTheDocument();
  });

  it('gives GMs an offer button that opens the composer for that player', async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({ isAdminOrModerator: true });
    renderPage();

    const buttons = await screen.findAllByRole('button', { name: 'Offer contract' });
    expect(buttons).toHaveLength(2);
    // No linked account: they could not answer the offer.
    expect(buttons[1]).toBeDisabled();

    await user.click(buttons[0]);
    expect(await screen.findByRole('dialog', { name: 'Offer a contract to Cody Rhodes' })).toBeInTheDocument();
  });
});
