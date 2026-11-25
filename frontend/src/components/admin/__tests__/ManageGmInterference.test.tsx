import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '../../../i18n';
import type { StaffGmInterferenceRequest } from '../../../services/api/shop.api';

const { mockGmApi, mockEconomyApi, mockMatchesApi, mockPlayersApi } = vi.hoisted(() => ({
  mockGmApi: { list: vi.fn(), resolve: vi.fn() },
  mockEconomyApi: { getCatalog: vi.fn() },
  mockMatchesApi: { getAll: vi.fn() },
  mockPlayersApi: { getDirectory: vi.fn() },
}));

vi.mock('../../../services/api/shop.api', async () => {
  const actual = await vi.importActual<typeof import('../../../services/api/shop.api')>('../../../services/api/shop.api');
  return { ...actual, gmInterferenceApi: mockGmApi };
});
vi.mock('../../../services/api/economy.api', async () => {
  const actual = await vi.importActual<typeof import('../../../services/api/economy.api')>('../../../services/api/economy.api');
  return { ...actual, economyApi: mockEconomyApi };
});
vi.mock('../../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../../services/api')>('../../../services/api');
  return { ...actual, matchesApi: mockMatchesApi, playersApi: mockPlayersApi };
});

import ManageGmInterference from '../ManageGmInterference';
import { ApiError } from '../../../services/api/apiClient';

const pending: StaffGmInterferenceRequest = {
  requestId: 'r1',
  playerId: 'p1',
  playerName: 'Rock',
  request: 'Put me in the title picture',
  matchId: 'm1',
  status: 'pending',
  price: 1000,
  createdAt: '2026-11-20T10:00:00Z',
  updatedAt: '2026-11-20T10:00:00Z',
};

describe('ManageGmInterference', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.clearAllMocks();
    mockGmApi.list.mockResolvedValue({ requests: [pending] });
    mockEconomyApi.getCatalog.mockResolvedValue({ currencyName: 'Dollars', currencySymbol: '$', version: 1, items: [] });
    mockMatchesApi.getAll.mockResolvedValue([{
      matchId: 'm1', date: '2026-12-01T20:00:00Z', matchFormat: 'singles', participants: ['p1', 'p2'],
      isChampionship: false, status: 'scheduled', createdAt: 'x', userHasRated: false, userRating: null,
    }]);
    mockPlayersApi.getDirectory.mockResolvedValue([
      { playerId: 'p1', name: 'Rock', currentWrestler: null },
      { playerId: 'p2', name: 'Austin', currentWrestler: null },
    ]);
  });

  it('lists pending requests with the player, the text and the linked match', async () => {
    render(<ManageGmInterference />);

    expect(await screen.findByText('Put me in the title picture')).toBeInTheDocument();
    expect(mockGmApi.list).toHaveBeenCalledWith('pending', expect.anything());
    expect(screen.getByText('Rock')).toBeInTheDocument();
    expect(await screen.findByText(/About: .*Rock vs Austin/)).toBeInTheDocument();
  });

  it('resolves with an outcome and both notes', async () => {
    const user = userEvent.setup();
    mockGmApi.resolve.mockResolvedValue({ request: { ...pending, status: 'taken' } });
    render(<ManageGmInterference />);

    await user.click(await screen.findByRole('button', { name: 'Resolve' }));
    const dialog = await screen.findByRole('dialog', { name: 'Resolve Rock\'s request' });
    const submit = within(dialog).getByRole('button', { name: 'Resolve' });
    expect(submit).toBeDisabled();

    await user.click(within(dialog).getByRole('radio', { name: /Take the money/ }));
    await user.type(within(dialog).getByLabelText('Note to the player (optional)'), 'Nice try');
    await user.type(within(dialog).getByLabelText('Staff note (optional)'), 'Never again');
    await user.click(submit);

    expect(mockGmApi.resolve).toHaveBeenCalledWith('r1', { outcome: 'taken', publicNote: 'Nice try', privateNote: 'Never again' });
    expect(mockGmApi.list).toHaveBeenCalledTimes(2);
  });

  it('explains when a GM tries to resolve their own request', async () => {
    const user = userEvent.setup();
    mockGmApi.resolve.mockRejectedValue(new ApiError('Another GM has to resolve your own request', 409, { code: 'OWN_REQUEST' }));
    render(<ManageGmInterference />);

    await user.click(await screen.findByRole('button', { name: 'Resolve' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: /Refund/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Resolve' }));

    expect(await within(dialog).findByText('This is your own request. Another GM has to resolve it.')).toBeInTheDocument();
  });
});
