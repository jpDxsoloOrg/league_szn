import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '../../../i18n';
import type { EconomyCatalog } from '../../../services/api/economy.api';
import type { Match } from '../../../types';

const { mockEconomyApi, mockShopApi, mockMatchesApi, mockPlayersApi, mockProfileApi, pendingItems } = vi.hoisted(() => ({
  mockEconomyApi: { getCatalog: vi.fn() },
  mockShopApi: { purchase: vi.fn(), requestGmInterference: vi.fn(), listMyGmInterference: vi.fn() },
  mockMatchesApi: { getAll: vi.fn() },
  mockPlayersApi: { getDirectory: vi.fn() },
  mockProfileApi: { getMyProfile: vi.fn() },
  pendingItems: new Set<string>(),
}));

vi.mock('../../../services/api/economy.api', async () => {
  const actual = await vi.importActual<typeof import('../../../services/api/economy.api')>('../../../services/api/economy.api');
  return { ...actual, economyApi: mockEconomyApi };
});
vi.mock('../../../services/api/shop.api', async () => {
  const actual = await vi.importActual<typeof import('../../../services/api/shop.api')>('../../../services/api/shop.api');
  return { ...actual, shopApi: mockShopApi };
});
vi.mock('../../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../../services/api')>('../../../services/api');
  return { ...actual, matchesApi: mockMatchesApi, playersApi: mockPlayersApi, profileApi: mockProfileApi };
});
vi.mock('../shopItems', async () => {
  const actual = await vi.importActual<typeof import('../shopItems')>('../shopItems');
  return { ...actual, PENDING_EFFECT_ITEMS: pendingItems };
});

import Shop from '../Shop';
import { ApiError } from '../../../services/api/apiClient';

const catalog: EconomyCatalog = {
  currencyName: 'League Dollars',
  currencySymbol: '$',
  version: 1,
  items: [
    { key: 'injuryShield', enabled: true, price: 300, chanceReduction: 0.5, matches: 3 },
    { key: 'rehab', enabled: true, price: 500, weeksOff: 1 },
    { key: 'staminaTopUp', enabled: true, price: 150, amount: 20 },
    { key: 'simInterference', enabled: true, price: 250, ratingBoost: 5 },
    { key: 'gmInterference', enabled: true, price: 1000 },
  ],
};

const scheduled: Match = {
  matchId: 'm1',
  date: '2026-12-01T20:00:00Z',
  matchFormat: 'singles',
  participants: ['me', 'rival'],
  isChampionship: false,
  status: 'scheduled',
  createdAt: '2026-11-01T00:00:00Z',
  userHasRated: false,
  userRating: null,
};

function setup({ balance = 2000, matches = [scheduled] }: { balance?: number; matches?: Match[] } = {}) {
  mockProfileApi.getMyProfile.mockResolvedValue({ playerId: 'me', name: 'Me', balance, effects: [] });
  mockMatchesApi.getAll.mockResolvedValue(matches);
}

const card = (name: string) => screen.getByRole('heading', { name }).closest('li') as HTMLElement;

describe('Shop', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.clearAllMocks();
    pendingItems.clear();
    mockEconomyApi.getCatalog.mockResolvedValue(catalog);
    mockShopApi.listMyGmInterference.mockResolvedValue({ requests: [] });
    mockPlayersApi.getDirectory.mockResolvedValue([
      { playerId: 'me', name: 'Me', currentWrestler: null },
      { playerId: 'rival', name: 'Rival', currentWrestler: null },
    ]);
    setup();
  });

  it('lists items waiting on injuries and the sim as coming soon, with buying off', async () => {
    pendingItems.add('injuryShield').add('simInterference');
    render(<Shop />);

    const shieldCard = within(await screen.findByRole('list', { name: 'Shop items' })).getByRole('heading', { name: 'Injury shield' }).closest('li') as HTMLElement;
    expect(within(shieldCard).getByText('Coming soon')).toBeInTheDocument();
    expect(within(shieldCard).getByText('Takes effect once injuries and the match sim launch.')).toBeInTheDocument();
    expect(within(shieldCard).getByRole('button', { name: 'Buy Injury shield' })).toBeDisabled();
    expect(within(card('Stamina top-up')).getByRole('button', { name: 'Buy Stamina top-up' })).toBeEnabled();
  });

  it('greys out what the player can\'t afford', async () => {
    setup({ balance: 200 });
    render(<Shop />);

    await screen.findByRole('list', { name: 'Shop items' });
    expect(within(card('Rehab')).getByText('You don\'t have enough money for this.')).toBeInTheDocument();
    expect(within(card('Rehab')).getByRole('button', { name: 'Buy Rehab' })).toBeDisabled();
    expect(within(card('Stamina top-up')).getByRole('button', { name: 'Buy Stamina top-up' })).toBeEnabled();
  });

  it('shows the missing injury and the missing match as reasons', async () => {
    setup({ balance: 2000, matches: [] });
    render(<Shop />);

    await screen.findByRole('list', { name: 'Shop items' });
    expect(within(card('Rehab')).getByText('Needs an active injury.')).toBeInTheDocument();
    expect(within(card('Rehab')).getByRole('button', { name: 'Buy Rehab' })).toBeDisabled();
    expect(within(card('Sim interference')).getByText('Needs a scheduled match you haven\'t boosted yet.')).toBeInTheDocument();
  });

  it('locks the whole shop while the player is in debt', async () => {
    setup({ balance: -40 });
    render(<Shop />);

    expect(await screen.findByRole('alert')).toHaveTextContent('You are in debt');
    expect(screen.getByText('Balance: -$40')).toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: /^Buy / })) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: 'Make a request' })).toBeDisabled();
  });

  it('confirms a purchase, then shows the new balance', async () => {
    const user = userEvent.setup();
    mockShopApi.purchase.mockResolvedValue({ item: 'staminaTopUp', balance: 1850, alreadyApplied: false });
    render(<Shop />);

    await user.click(await screen.findByRole('button', { name: 'Buy Stamina top-up' }));
    const dialog = await screen.findByRole('dialog', { name: 'Buy Stamina top-up?' });
    expect(within(dialog).getByText('$1,850')).toBeInTheDocument();
    setup({ balance: 1850 });
    await user.click(within(dialog).getByRole('button', { name: 'Pay $150' }));

    expect(mockShopApi.purchase).toHaveBeenCalledWith({ item: 'staminaTopUp', requestId: expect.any(String) });
    expect(await screen.findByText('Balance: $1,850')).toBeInTheDocument();
  });

  it('buys a sim boost for the picked scheduled match', async () => {
    const user = userEvent.setup();
    mockShopApi.purchase.mockResolvedValue({ item: 'simInterference', balance: 1750, alreadyApplied: false });
    render(<Shop />);

    await user.click(await screen.findByRole('button', { name: 'Buy Sim interference' }));
    const dialog = await screen.findByRole('dialog', { name: 'Buy Sim interference?' });
    expect(within(dialog).getByRole('combobox', { name: 'Match' })).toHaveTextContent('vs Rival');
    await user.click(within(dialog).getByRole('button', { name: 'Pay $250' }));

    expect(mockShopApi.purchase).toHaveBeenCalledWith({ item: 'simInterference', target: 'm1' });
  });

  it('shows a refusal by its code', async () => {
    const user = userEvent.setup();
    mockShopApi.purchase.mockRejectedValue(new ApiError('server text', 409, { code: 'SHIELD_ACTIVE' }));
    render(<Shop />);

    await user.click(await screen.findByRole('button', { name: 'Buy Injury shield' }));
    const dialog = await screen.findByRole('dialog', { name: 'Buy Injury shield?' });
    await user.click(within(dialog).getByRole('button', { name: 'Pay $300' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('You already have an active injury shield.');
  });

  describe('GM interference', () => {
    it('warns, needs the request and the acknowledgement, then pays', async () => {
      const user = userEvent.setup();
      mockShopApi.requestGmInterference.mockResolvedValue({ request: {}, entry: {}, balance: 1000 });
      render(<Shop />);

      await user.click(await screen.findByRole('button', { name: 'Make a request' }));
      const dialog = await screen.findByRole('dialog', { name: 'Ask the GM' });
      expect(within(dialog).getByRole('note')).toHaveTextContent('The GM may keep your money and do nothing.');
      const pay = within(dialog).getByRole('button', { name: 'Pay $1,000 and send' });
      expect(pay).toBeDisabled();

      await user.type(within(dialog).getByLabelText('What do you want?'), 'Put me in the title picture');
      expect(pay).toBeDisabled();
      await user.click(within(dialog).getByLabelText('I understand the GM can keep my money and do nothing.'));
      expect(pay).toBeEnabled();
      await user.click(pay);

      expect(mockShopApi.requestGmInterference).toHaveBeenCalledWith({ request: 'Put me in the title picture' });
    });

    it('shows outcomes and public notes in my requests, and blocks a second request', async () => {
      mockShopApi.listMyGmInterference.mockResolvedValue({
        requests: [
          { requestId: 'r2', request: 'Again please', status: 'pending', price: 1000, createdAt: '2026-11-21T00:00:00Z' },
          { requestId: 'r1', request: 'Screw my rival', status: 'taken', price: 1000, createdAt: '2026-11-10T00:00:00Z', publicNote: 'Nice try' },
        ],
      });
      render(<Shop />);

      expect(await screen.findByText('The GM took your money. Better luck next time.')).toBeInTheDocument();
      expect(screen.getByText('GM\'s note: Nice try')).toBeInTheDocument();
      expect(screen.getByText('Waiting on the GM')).toBeInTheDocument();
      expect(screen.getByText('You already have a request waiting on the GM.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Make a request' })).toBeDisabled();
    });
  });
});
