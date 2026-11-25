import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockListActive, mockHeal, mockUpdateCurrent, mockAdjustStamina, mockGetConfig, mockGetPlayers } = vi.hoisted(() => ({
  mockListActive: vi.fn(),
  mockHeal: vi.fn(),
  mockUpdateCurrent: vi.fn(),
  mockAdjustStamina: vi.fn(),
  mockGetConfig: vi.fn(),
  mockGetPlayers: vi.fn(),
}));

vi.mock('../../../services/api/injuries.api', () => ({
  injuriesApi: {
    listActive: mockListActive,
    heal: mockHeal,
    updateCurrent: mockUpdateCurrent,
    adjustStamina: mockAdjustStamina,
    getConfig: mockGetConfig,
  },
}));
vi.mock('../../../services/api', () => ({ playersApi: { getAll: mockGetPlayers } }));
vi.mock('react-i18next', async () => (await import('./i18nMock')).i18nMock);

import InjuryReport from '../InjuryReport';
import type { InjuryBoardEntry } from '../../../types/injuryReport';

const returnsAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

const entry: InjuryBoardEntry = {
  injury: {
    playerId: 'p1',
    startedAt: '2024-01-01T00:00:00Z',
    injuryId: 'inj-1',
    source: 'match',
    severity: 'moderate',
    weeks: 2,
    returnsAt,
    matchId: 'm1',
    changes: [],
  },
  player: { playerId: 'p1', name: 'Rock', currentWrestler: 'The Rock', stamina: 30 },
  pastReturnDate: false,
  impact: { scheduledMatchIds: ['m2', 'm3'], titles: ['World Title'] },
};

const roster = [
  { playerId: 'p1', name: 'Rock', currentWrestler: 'The Rock', stamina: 30, wins: 0, losses: 0, draws: 0,
    currentInjury: { startedAt: entry.injury.startedAt, returnsAt, severity: 'moderate', weeks: 2 } },
  { playerId: 'p2', name: 'Steve', currentWrestler: 'Stone Cold', wins: 0, losses: 0, draws: 0 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockListActive.mockResolvedValue([entry]);
  mockGetPlayers.mockResolvedValue(roster);
  mockGetConfig.mockResolvedValue({ settings: { maxStamina: 100 }, history: [] });
});

describe('InjuryReport', () => {
  it('lists active injuries with what they affect', async () => {
    render(<InjuryReport />);
    const table = await screen.findByRole('table', { name: 'injuryReport.activeTitle' });
    const row = within(table).getByText('The Rock (Rock)').closest('tr')!;
    expect(row).toHaveTextContent('injuryReport.severity.moderate');
    expect(row).toHaveTextContent('injuryReport.affectedMatches');
    expect(row).toHaveTextContent('World Title');
  });

  it('highlights low stamina in the roster table', async () => {
    render(<InjuryReport />);
    const table = await screen.findByRole('table', { name: 'injuryReport.rosterTitle' });
    expect(within(table).getByText('Stone Cold').closest('tr')).not.toHaveClass('injury-report__row--low');
    expect(within(table).getByText('The Rock').closest('tr')).toHaveClass('injury-report__row--low');
  });

  it('heals an injury after confirming and reloads the board', async () => {
    mockHeal.mockResolvedValue({});
    render(<InjuryReport />);
    await userEvent.click(await screen.findByRole('button', { name: 'injuryReport.heal' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'injuryReport.heal' }));

    await waitFor(() => expect(mockHeal).toHaveBeenCalledWith('p1', undefined));
    await waitFor(() => expect(mockListActive).toHaveBeenCalledTimes(2));
  });

  it('extends an injury to a new total length in weeks', async () => {
    mockUpdateCurrent.mockResolvedValue({ ...entry.injury, weeks: 4, returnsAt });
    render(<InjuryReport />);
    await userEvent.click(await screen.findByRole('button', { name: 'injuryReport.extend' }));
    const weeks = await screen.findByLabelText('injuryReport.totalWeeks');
    await userEvent.clear(weeks);
    await userEvent.type(weeks, '4');
    await userEvent.click(screen.getByRole('button', { name: 'injuryReport.save' }));

    await waitFor(() => expect(mockUpdateCurrent).toHaveBeenCalledWith('p1', { weeks: 4 }));
  });

  it('sets a player\'s stamina', async () => {
    mockAdjustStamina.mockResolvedValue({ playerId: 'p2', staminaBefore: null, stamina: 55 });
    render(<InjuryReport />);
    const table = await screen.findByRole('table', { name: 'injuryReport.rosterTitle' });
    const row = within(table).getByText('Stone Cold').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: 'injuryReport.adjust' }));
    const input = await screen.findByLabelText('injuryReport.staminaLabel');
    await userEvent.clear(input);
    await userEvent.type(input, '55');
    await userEvent.click(screen.getByRole('button', { name: 'injuryReport.save' }));

    await waitFor(() => expect(mockAdjustStamina).toHaveBeenCalledWith('p2', 55, undefined));
  });
});
