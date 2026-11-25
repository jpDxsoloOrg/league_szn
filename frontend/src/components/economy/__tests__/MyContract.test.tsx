import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Contract, MyContractsResponse, OwnLedgerEntry } from '../../../services/api/contracts.api';

const { mockContractsApi, mockEconomyApi, mockSeasonsApi, mockShowToast } = vi.hoisted(() => ({
  mockContractsApi: { getMine: vi.fn(), accept: vi.fn(), decline: vi.fn(), getMyLedger: vi.fn() },
  mockEconomyApi: { getCatalog: vi.fn() },
  mockSeasonsApi: { getAll: vi.fn() },
  mockShowToast: vi.fn(),
}));

vi.mock('../../../services/api/contracts.api', () => ({ contractsApi: mockContractsApi }));
vi.mock('../../../services/api/economy.api', () => ({ economyApi: mockEconomyApi }));
vi.mock('../../../services/api/seasons.api', () => ({ seasonsApi: mockSeasonsApi }));
vi.mock('../../ui/toastContext', () => ({ useToast: () => ({ showToast: mockShowToast }) }));

import i18n from '../../../i18n';
import MyContract from '../MyContract';

const DAY_MS = 24 * 60 * 60 * 1000;

function contract(overrides: Partial<Contract>): Contract {
  return {
    contractId: 'c1',
    playerId: 'p1',
    type: 'matches',
    status: 'active',
    matchesTotal: 5,
    matchesPlayed: 2,
    perMatchPay: 150,
    weeklySalary: 0,
    winBonus: 75,
    offeredBy: 'gm',
    offeredAt: '2026-11-01T00:00:00.000Z',
    offerExpiresAt: '2026-11-04T00:00:00.000Z',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-02T00:00:00.000Z',
    ...overrides,
  };
}

function mine(overrides: Partial<MyContractsResponse> = {}): MyContractsResponse {
  return { playerId: 'p1', balance: 900, activeContract: null, offers: [], pastContracts: [], ...overrides };
}

function ledgerEntry(overrides: Partial<OwnLedgerEntry>): OwnLedgerEntry {
  return {
    playerId: 'p1',
    entryId: 'e1',
    createdAt: '2026-11-20T12:00:00.000Z',
    sortKey: '',
    kind: 'perMatchPay',
    amount: 150,
    balanceAfter: 150,
    ...overrides,
  };
}

function renderPage(path = '/my-contract') {
  return render(<MemoryRouter initialEntries={[path]}><MyContract /></MemoryRouter>);
}

describe('MyContract', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    mockEconomyApi.getCatalog.mockResolvedValue({ currencySymbol: '$', currencyName: 'Dollars', version: 1, items: [] });
    mockSeasonsApi.getAll.mockResolvedValue([{ seasonId: 's4', name: 'Season 4', status: 'active' }]);
    mockContractsApi.getMyLedger.mockResolvedValue({ playerId: 'p1', balance: 900, items: [] });
  });

  it('shows the active contract with its progress and terms', async () => {
    mockContractsApi.getMine.mockResolvedValue(mine({ activeContract: contract({}) }));

    renderPage();

    expect(await screen.findByText('2 of 5 matches played')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '2');
    expect(screen.getByText('$150')).toBeInTheDocument();
    expect(screen.getByText('$75')).toBeInTheDocument();
    expect(await screen.findByText('$900')).toBeInTheDocument();
  });

  it('names the season of a season contract', async () => {
    mockContractsApi.getMine.mockResolvedValue(mine({
      activeContract: contract({ type: 'season', matchesTotal: undefined, seasonId: 's4' }),
    }));

    renderPage();

    expect(await screen.findByText('Through Season 4')).toBeInTheDocument();
  });

  it('says so when the player is a free agent', async () => {
    mockContractsApi.getMine.mockResolvedValue(mine());

    renderPage();

    expect(await screen.findByText("You're a free agent.")).toBeInTheDocument();
    expect(screen.getByText('No open offers right now.')).toBeInTheDocument();
  });

  it('marks a negative balance as debt', async () => {
    mockContractsApi.getMine.mockResolvedValue(mine({ balance: -40 }));

    renderPage();

    const balance = await screen.findByText('-$40');
    expect(balance).toHaveClass('my-contract__balance-value--debt');
    expect(screen.getByText(/The shop stays locked/)).toBeInTheDocument();
  });

  it('lists offers with the time left and accepts one', async () => {
    const offer = contract({
      contractId: 'offer-1', status: 'offered', matchesTotal: 3, matchesPlayed: 0, note: 'Welcome to the main roster',
      offerExpiresAt: new Date(Date.now() + 2 * DAY_MS + 60_000).toISOString(),
    });
    mockContractsApi.getMine
      .mockResolvedValueOnce(mine({ offers: [offer] }))
      .mockResolvedValue(mine({ activeContract: { ...offer, status: 'active' } }));
    mockContractsApi.accept.mockResolvedValue({ contract: { ...offer, status: 'active' }, withdrawnOfferIds: [] });

    renderPage();

    const card = (await screen.findByText('Welcome to the main roster')).closest('li') as HTMLElement;
    expect(within(card).getByText('2 days left')).toBeInTheDocument();
    expect(within(card).getByText('3 matches')).toBeInTheDocument();

    await userEvent.click(within(card).getByRole('button', { name: 'Accept' }));

    expect(mockContractsApi.accept).toHaveBeenCalledWith('offer-1');
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Contract signed. Welcome aboard!', 'success'));
    expect(await screen.findByText('0 of 3 matches played')).toBeInTheDocument();
  });

  it('declines an offer', async () => {
    const offer = contract({
      contractId: 'offer-2', status: 'offered',
      offerExpiresAt: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
    });
    mockContractsApi.getMine.mockResolvedValueOnce(mine({ offers: [offer] })).mockResolvedValue(mine());
    mockContractsApi.decline.mockResolvedValue({ ...offer, status: 'declined' });

    renderPage();

    expect(await screen.findByText('5 hours left')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Decline' }));

    expect(mockContractsApi.decline).toHaveBeenCalledWith('offer-2');
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Offer declined.', 'success'));
  });

  it('shows the server message when an answer fails', async () => {
    const offer = contract({ contractId: 'offer-3', status: 'offered', offerExpiresAt: new Date(Date.now() + DAY_MS * 2).toISOString() });
    mockContractsApi.getMine.mockResolvedValue(mine({ offers: [offer] }));
    mockContractsApi.accept.mockRejectedValue(new Error('This offer has expired'));

    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Accept' }));

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('This offer has expired', 'error'));
  });

  it('keeps Accept off while another contract is active', async () => {
    const offer = contract({ contractId: 'offer-4', status: 'offered', offerExpiresAt: new Date(Date.now() + DAY_MS * 2).toISOString() });
    mockContractsApi.getMine.mockResolvedValue(mine({ activeContract: contract({}), offers: [offer] }));

    renderPage();

    expect(await screen.findByRole('button', { name: 'Accept' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeEnabled();
  });

  it('lists past contracts with their status', async () => {
    mockContractsApi.getMine.mockResolvedValue(mine({
      pastContracts: [contract({ contractId: 'old', type: 'tryout', status: 'completed', matchesTotal: 3, matchesPlayed: 3 })],
    }));

    renderPage();

    const row = (await screen.findByText('Tryout')).closest('li') as HTMLElement;
    expect(within(row).getByText('Completed')).toBeInTheDocument();
    expect(within(row).getByText('3 of 3 matches played')).toBeInTheDocument();
  });

  it('opens the wallet tab from the URL and pages the ledger', async () => {
    mockContractsApi.getMine.mockResolvedValue(mine());
    mockContractsApi.getMyLedger
      .mockResolvedValueOnce({
        playerId: 'p1',
        balance: 900,
        items: [
          ledgerEntry({ entryId: 'e2', kind: 'fine', amount: -50, balanceAfter: 100, note: 'Late to the show' }),
          ledgerEntry({ entryId: 'e1', kind: 'perMatchPay', amount: 150, balanceAfter: 150 }),
        ],
        nextCursor: 'next',
      })
      .mockResolvedValueOnce({
        playerId: 'p1',
        balance: 900,
        items: [ledgerEntry({ entryId: 'e0', kind: 'salary', amount: 200, balanceAfter: 0 })],
      });

    renderPage('/my-contract?tab=wallet');

    expect(await screen.findByText('Late to the show')).toBeInTheDocument();
    expect(screen.getByText('Fine')).toBeInTheDocument();
    expect(screen.getByText('-$50')).toBeInTheDocument();
    expect(screen.getByText('+$150')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Show older entries' }));

    expect(await screen.findByText('Weekly salary')).toBeInTheDocument();
    expect(mockContractsApi.getMyLedger).toHaveBeenLastCalledWith({ cursor: 'next', limit: 25 });
    expect(screen.queryByRole('button', { name: 'Show older entries' })).not.toBeInTheDocument();
  });

  it('renders in German', async () => {
    await i18n.changeLanguage('de');
    mockContractsApi.getMine.mockResolvedValue(mine());

    renderPage();

    expect(await screen.findByText('Du bist Free Agent.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Geldbörse' })).toBeInTheDocument();
  });
});
