import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Contract, RosterPlayer } from '../../../services/api/contracts.api';

const { mockContractsApi, mockEconomyApi, mockPlayersApi, mockSeasonsApi, mockUseAuth } = vi.hoisted(() => ({
  mockContractsApi: {
    list: vi.fn(),
    getFreeAgents: vi.fn(),
    withdraw: vi.fn(),
    release: vi.fn(),
    adjustBalance: vi.fn(),
    offer: vi.fn(),
  },
  mockEconomyApi: { getConfig: vi.fn() },
  mockPlayersApi: { getAllIncludingHidden: vi.fn() },
  mockSeasonsApi: { getAll: vi.fn() },
  mockUseAuth: vi.fn(),
}));

vi.mock('../../../services/api/contracts.api', () => ({ contractsApi: mockContractsApi }));
vi.mock('../../../services/api/economy.api', async () => {
  const actual = await vi.importActual<typeof import('../../../services/api/economy.api')>('../../../services/api/economy.api');
  return { ...actual, economyApi: mockEconomyApi };
});
vi.mock('../../../services/api/players.api', () => ({ playersApi: mockPlayersApi }));
vi.mock('../../../services/api/seasons.api', () => ({ seasonsApi: mockSeasonsApi }));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: mockUseAuth }));

import i18n from '../../../i18n';
import ManageContracts from '../ManageContracts';

function makePlayer(overrides: Partial<RosterPlayer>): RosterPlayer {
  return {
    playerId: 'p1',
    name: 'Alex',
    currentWrestler: 'Cody Rhodes',
    wins: 4,
    losses: 2,
    draws: 0,
    hasLinkedAccount: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeContract(overrides: Partial<Contract>): Contract {
  return {
    contractId: 'c1',
    playerId: 'p1',
    type: 'season',
    status: 'active',
    matchesPlayed: 2,
    seasonId: 's4',
    perMatchPay: 100,
    weeklySalary: 250,
    winBonus: 50,
    offeredBy: 'gm',
    offeredAt: '2026-11-01T00:00:00.000Z',
    offerExpiresAt: '2026-11-04T00:00:00.000Z',
    startedAt: '2026-11-02T00:00:00.000Z',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-02T00:00:00.000Z',
    ...overrides,
  };
}

const players = [
  makePlayer({ activeContractId: 'c1', balance: 900 }),
  makePlayer({ playerId: 'p2', name: 'Sam', currentWrestler: 'Seth Rollins', balance: 120 }),
];

const contracts = [
  makeContract({}),
  makeContract({
    contractId: 'c2', playerId: 'p2', type: 'matches', status: 'offered',
    seasonId: undefined, matchesTotal: 5, matchesPlayed: 0, weeklySalary: 0, startedAt: undefined,
  }),
  makeContract({ contractId: 'c3', playerId: 'p2', status: 'released', note: 'No-shows', endedAt: '2026-10-01T00:00:00.000Z' }),
];

describe('ManageContracts', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    mockUseAuth.mockReturnValue({ isSuperAdmin: false });
    mockContractsApi.list.mockResolvedValue(contracts);
    mockContractsApi.getFreeAgents.mockResolvedValue([players[1]]);
    mockPlayersApi.getAllIncludingHidden.mockResolvedValue(players);
    mockSeasonsApi.getAll.mockResolvedValue([{ seasonId: 's4', name: 'Season 4', status: 'active' }]);
    mockEconomyApi.getConfig.mockResolvedValue({ settings: { currencySymbol: '$' } });
  });

  it('lists active contracts with their terms and counts each filter', async () => {
    render(<ManageContracts />);

    const table = await screen.findByRole('table', { name: 'Active' });
    expect(within(table).getByText('Cody Rhodes')).toBeInTheDocument();
    expect(within(table).getByText('Through Season 4')).toBeInTheDocument();
    expect(within(table).getByText('$250')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Offered (1)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Free agents (1)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'History (1)' })).toBeInTheDocument();
  });

  it('releases a contract only with a reason and sends it', async () => {
    const user = userEvent.setup();
    mockContractsApi.release.mockResolvedValue(makeContract({ status: 'released' }));
    render(<ManageContracts />);

    await user.click(await screen.findByRole('button', { name: 'Release' }));
    const dialog = await screen.findByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: 'Release' });
    expect(submit).toBeDisabled();

    await user.type(within(dialog).getByLabelText('Reason'), 'Missed three shows');
    await user.click(submit);

    await waitFor(() => expect(mockContractsApi.release).toHaveBeenCalledWith('c1', 'Missed three shows'));
    expect(mockContractsApi.list).toHaveBeenCalledTimes(2);
  });

  it('withdraws an open offer after confirming', async () => {
    const user = userEvent.setup();
    mockContractsApi.withdraw.mockResolvedValue(makeContract({ contractId: 'c2', status: 'withdrawn' }));
    render(<ManageContracts />);

    await user.click(await screen.findByRole('tab', { name: 'Offered (1)' }));
    const table = await screen.findByRole('table', { name: 'Offered' });
    expect(within(table).getByText('5 of 5 matches left')).toBeInTheDocument();
    await user.click(within(table).getByRole('button', { name: 'Withdraw' }));
    const dialog = await screen.findByRole('dialog', { name: 'Withdraw this offer?' });
    await user.click(within(dialog).getByRole('button', { name: 'Withdraw' }));

    await waitFor(() => expect(mockContractsApi.withdraw).toHaveBeenCalledWith('c2'));
  });

  it('shows history with the status and note', async () => {
    const user = userEvent.setup();
    render(<ManageContracts />);

    await user.click(await screen.findByRole('tab', { name: 'History (1)' }));
    const table = await screen.findByRole('table', { name: 'History' });
    expect(within(table).getByText('Released')).toBeInTheDocument();
    expect(within(table).getByText('No-shows')).toBeInTheDocument();
  });

  it('hides balance adjustments from Moderators', async () => {
    render(<ManageContracts />);
    await screen.findByRole('table', { name: 'Active' });
    expect(screen.queryByRole('button', { name: 'Adjust balance' })).not.toBeInTheDocument();
  });

  it('lets an Admin adjust a balance with a reason', async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({ isSuperAdmin: true });
    mockContractsApi.adjustBalance.mockResolvedValue({ balance: 800, alreadyApplied: false });
    render(<ManageContracts />);

    await user.click(await screen.findByRole('button', { name: 'Adjust balance' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Current balance: $900')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Amount ($)'), '-100');
    await user.type(within(dialog).getByLabelText('Reason'), 'Refund');
    await user.click(within(dialog).getByRole('button', { name: 'Adjust balance' }));

    await waitFor(() => expect(mockContractsApi.adjustBalance).toHaveBeenCalledWith('p1', expect.objectContaining({
      amount: -100,
      note: 'Refund',
      requestId: expect.any(String),
    })));
  });
});
