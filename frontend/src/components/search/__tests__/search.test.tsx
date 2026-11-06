import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { Championship } from '../../../types';
import type { LeagueEvent } from '../../../types/event';

const { mockUseAuth, mockUseSiteConfig, mockApis } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockUseSiteConfig: vi.fn(),
  mockApis: {
    getDirectory: vi.fn(),
    getEvents: vi.fn(),
    getChampionships: vi.fn(),
  },
}));

vi.mock('../../../contexts/AuthContext', () => ({ useAuth: mockUseAuth }));
vi.mock('../../../contexts/SiteConfigContext', () => ({ useSiteConfig: mockUseSiteConfig }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../../services/api', () => ({
  playersApi: { getDirectory: mockApis.getDirectory },
  eventsApi: { getAll: mockApis.getEvents },
  championshipsApi: { getAll: mockApis.getChampionships },
}));

import SiteSearch from '../SiteSearch';
import SearchLauncher from '../SearchLauncher';
import { toChampionshipEntries, toEventEntries, toPageEntries, toWrestlerEntries } from '../searchIndex';

const FEATURES = { challenges: true, promos: true, contenders: true, statistics: true, stables: true, notifications: true, rivalries: true };
const t = (key: string) => key;

const DIRECTORY = [
  { playerId: 'p1', name: 'JP', currentWrestler: 'Edge' },
  { playerId: 'p2', name: 'Unassigned Larry', currentWrestler: null },
  { playerId: 'p3', name: 'Blank Betty', currentWrestler: '   ' },
  { playerId: 'p4', name: 'Placeholder Pete', currentWrestler: 'Needs Wrestler' },
];

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

function renderSearch() {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <SiteSearch open onClose={onClose} />
      <Where />
    </MemoryRouter>,
  );
  return onClose;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ isAuthenticated: false, isWrestler: false, isAdminOrModerator: false, isSuperAdmin: false });
  mockUseSiteConfig.mockReturnValue({ features: FEATURES });
  mockApis.getDirectory.mockResolvedValue(DIRECTORY);
  mockApis.getEvents.mockResolvedValue([{ eventId: 'e1', name: 'Toxic Tuesday', date: '2026-11-01T00:00:00Z' }]);
  mockApis.getChampionships.mockResolvedValue([{ championshipId: 'c1', name: 'World Heavyweight', isActive: true }]);
});

describe('search index', () => {
  it('never includes a player without a wrestler', () => {
    expect(toWrestlerEntries(DIRECTORY)).toEqual([
      { id: 'wrestler-p1', kind: 'wrestler', title: 'Edge', subtitle: 'JP', to: '/player/p1' },
    ]);
  });

  it('links events to their page and drops retired titles', () => {
    expect(toEventEntries([{ eventId: 'e1', name: 'Show', date: '2026-11-01T00:00:00Z' } as LeagueEvent])[0]?.to).toBe('/events/e1');
    const titles = toChampionshipEntries([
      { championshipId: 'c1', name: 'Live', isActive: true },
      { championshipId: 'c2', name: 'Retired', isActive: false },
    ] as Championship[]);
    expect(titles.map((entry) => entry.title)).toEqual(['Live']);
  });

  it('respects flags and roles for pages', () => {
    const visitor = { features: FEATURES, isAuthenticated: false, isWrestler: false, isAdminOrModerator: false, isSuperAdmin: false };
    const visitorPaths = toPageEntries(visitor, t).map((entry) => entry.to);
    expect(visitorPaths).toContain('/stats/records');
    expect(visitorPaths).not.toContain('/profile');
    expect(visitorPaths).not.toContain('/admin/players');

    const noStats = toPageEntries({ ...visitor, features: { ...FEATURES, statistics: false } }, t).map((entry) => entry.to);
    expect(noStats).not.toContain('/stats/records');

    const moderator = toPageEntries({ ...visitor, isAuthenticated: true, isAdminOrModerator: true }, t).map((entry) => entry.to);
    expect(moderator).toContain('/admin/players');
    expect(moderator).not.toContain('/admin/users');

    const admin = toPageEntries({ ...visitor, isAuthenticated: true, isAdminOrModerator: true, isSuperAdmin: true }, t).map((entry) => entry.to);
    expect(admin).toContain('/admin/users');
  });
});

describe('SiteSearch', () => {
  it('finds a wrestler and navigates with Enter', async () => {
    const user = userEvent.setup();
    const onClose = renderSearch();
    await waitFor(() => expect(mockApis.getDirectory).toHaveBeenCalled());

    await user.type(screen.getByRole('combobox'), 'edge');
    expect(await screen.findByRole('option', { name: /Edge/ })).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Enter}');
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByTestId('where')).toHaveTextContent('/player/p1');
  });

  it('does not surface a wrestlerless player by their name', async () => {
    const user = userEvent.setup();
    renderSearch();
    await waitFor(() => expect(mockApis.getDirectory).toHaveBeenCalled());

    await user.type(screen.getByRole('combobox'), 'Larry');
    expect(await screen.findByText('search.noResults')).toBeInTheDocument();
  });

  it('moves the active option with the arrow keys', async () => {
    const user = userEvent.setup();
    renderSearch();

    const options = await screen.findAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('combobox'));
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(screen.getAllByRole('option').at(-1)).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps pages searchable when every data source fails', async () => {
    const user = userEvent.setup();
    mockApis.getDirectory.mockRejectedValue(new Error('down'));
    mockApis.getEvents.mockRejectedValue(new Error('down'));
    mockApis.getChampionships.mockRejectedValue(new Error('down'));
    renderSearch();

    expect(await screen.findByText('search.loadFailed')).toBeInTheDocument();
    await user.type(screen.getByRole('combobox'), 'nav.standings');
    expect(await screen.findByRole('option', { name: /nav\.standings/ })).toBeInTheDocument();
  });
});

describe('SearchLauncher', () => {
  it('opens from the button and from Ctrl+K', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><SearchLauncher /></MemoryRouter>);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.keyboard('{Control>}k{/Control}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'search.open' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
