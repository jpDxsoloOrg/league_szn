import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- Hoisted mocks ---
const { mockDivisionLadderApi, mockPlayersApi } = vi.hoisted(() => ({
  mockDivisionLadderApi: {
    get: vi.fn(),
    update: vi.fn(),
  },
  mockPlayersApi: {
    getAll: vi.fn(),
  },
}));

vi.mock('../../../services/api', () => ({
  divisionLadderApi: mockDivisionLadderApi,
  playersApi: mockPlayersApi,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown> | string) => {
      if (typeof opts === 'string') return opts;
      if (opts && typeof opts === 'object') {
        const suffix = Object.entries(opts)
          .filter(([name]) => name !== 'defaultValue')
          .map(([, value]) => String(value))
          .join(',');
        return suffix ? `${key}:${suffix}` : key;
      }
      return key;
    },
  }),
}));

vi.mock('../ManageDivisionLadder.css', () => ({}));

import ManageDivisionLadder from '../ManageDivisionLadder';
import type { Division, DivisionLadderResponse, DivisionMovement } from '../../../types';

const base = { createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' };

const jobber: Division = { divisionId: 'div-jobber', name: 'Jobber', rank: 0, ...base };
const midcard: Division = { divisionId: 'div-mid', name: 'Midcard', rank: 1, ...base };
const mainEvent: Division = { divisionId: 'div-main', name: 'Main Event', rank: 2, ...base };
const unranked: Division = { divisionId: 'div-new', name: 'Women', ...base };

const movements: DivisionMovement[] = [
  {
    movementId: 'mv-1',
    playerId: 'p-1',
    movedAt: '2024-03-01T12:00:00.000Z',
    fromDivisionId: 'div-mid',
    toDivisionId: 'div-main',
    direction: 'promoted',
    trigger: 'streak',
    streakCount: 5,
  },
  {
    movementId: 'mv-2',
    playerId: 'p-2',
    movedAt: '2024-03-02T12:00:00.000Z',
    fromDivisionId: 'div-mid',
    toDivisionId: 'div-jobber',
    direction: 'demoted',
    trigger: 'admin',
  },
];

function buildResponse(overrides: Partial<DivisionLadderResponse> = {}): DivisionLadderResponse {
  return {
    rules: { enabled: true, promoteWinStreak: 5, demoteLossStreak: 5 },
    divisions: [jobber, midcard, mainEvent, unranked],
    recentMovements: [],
    ...overrides,
  };
}

async function renderLoaded() {
  render(<ManageDivisionLadder />);
  await waitFor(() => {
    expect(screen.getAllByText('Main Event').length).toBeGreaterThan(0);
  });
}

function ladderNames(): string[] {
  const list = screen.getByRole('list', { name: 'admin.divisionLadder.orderTitle' });
  return within(list).getAllByRole('listitem').map((row) =>
    within(row).getByText(/Jobber|Midcard|Main Event|Women/).textContent ?? '',
  );
}

describe('ManageDivisionLadder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDivisionLadderApi.get.mockResolvedValue(buildResponse());
    mockDivisionLadderApi.update.mockImplementation(async () => buildResponse());
    mockPlayersApi.getAll.mockResolvedValue([
      { playerId: 'p-1', name: 'Alice', currentWrestler: 'Becky', wins: 0, losses: 0, draws: 0 },
    ]);
  });

  it('renders the ladder top to bottom with tier captions and the unranked list', async () => {
    await renderLoaded();

    expect(ladderNames()).toEqual(['Main Event', 'Midcard', 'Jobber']);
    expect(screen.getByText('admin.divisionLadder.topTierCaption')).toBeInTheDocument();
    expect(screen.getByText('admin.divisionLadder.bottomTierCaption')).toBeInTheDocument();
    expect(screen.getByText('Women')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'admin.divisionLadder.addToLadder' })).toBeInTheDocument();

    // End buttons are disabled.
    expect(screen.getByRole('button', { name: 'admin.divisionLadder.moveUp: Main Event' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'admin.divisionLadder.moveDown: Jobber' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'admin.divisionLadder.moveUp: Midcard' })).toBeEnabled();
  });

  it('reordering with the arrows produces the expected bottom-to-top order payload on save', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    // Move Midcard above Main Event.
    await user.click(screen.getByRole('button', { name: 'admin.divisionLadder.moveUp: Midcard' }));
    expect(ladderNames()).toEqual(['Midcard', 'Main Event', 'Jobber']);

    // Move Jobber up one (swap with Main Event).
    await user.click(screen.getByRole('button', { name: 'admin.divisionLadder.moveUp: Jobber' }));
    expect(ladderNames()).toEqual(['Midcard', 'Jobber', 'Main Event']);

    // Add the unranked division: it lands at the bottom.
    await user.click(screen.getByRole('button', { name: 'admin.divisionLadder.addToLadder' }));
    expect(ladderNames()).toEqual(['Midcard', 'Jobber', 'Main Event', 'Women']);
    expect(screen.queryByRole('button', { name: 'admin.divisionLadder.addToLadder' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'admin.divisionLadder.save' }));

    await waitFor(() => {
      expect(mockDivisionLadderApi.update).toHaveBeenCalledTimes(1);
    });
    expect(mockDivisionLadderApi.update).toHaveBeenCalledWith({
      rules: { enabled: true, promoteWinStreak: 5, demoteLossStreak: 5 },
      order: ['div-new', 'div-main', 'div-jobber', 'div-mid'],
    });
    await waitFor(() => {
      expect(screen.getByText('admin.divisionLadder.saved')).toBeInTheDocument();
    });
  });

  it('clamps out-of-range rule values into 2..20 and sends the enabled flag', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    const promote = screen.getByLabelText('admin.divisionLadder.promoteWinStreak');
    const demote = screen.getByLabelText('admin.divisionLadder.demoteLossStreak');

    await user.clear(promote);
    await user.type(promote, '99');
    await user.tab();
    expect(promote).toHaveValue(20);

    await user.clear(demote);
    await user.type(demote, '1');
    await user.tab();
    expect(demote).toHaveValue(2);

    await user.click(screen.getByLabelText('admin.divisionLadder.enabled'));

    await user.click(screen.getByRole('button', { name: 'admin.divisionLadder.save' }));

    await waitFor(() => {
      expect(mockDivisionLadderApi.update).toHaveBeenCalledWith({
        rules: { enabled: false, promoteWinStreak: 20, demoteLossStreak: 2 },
        order: ['div-jobber', 'div-mid', 'div-main'],
      });
    });
  });

  it('renders recent movements with player and division names', async () => {
    mockDivisionLadderApi.get.mockResolvedValue(buildResponse({ recentMovements: movements }));
    await renderLoaded();

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });
    const table = screen.getByRole('table');
    expect(within(table).getByText('admin.divisionLadder.direction.promoted')).toBeInTheDocument();
    expect(within(table).getByText('admin.divisionLadder.direction.demoted')).toBeInTheDocument();
    expect(within(table).getByText('admin.divisionLadder.trigger.streak')).toBeInTheDocument();
    expect(within(table).getByText('admin.divisionLadder.trigger.admin')).toBeInTheDocument();
    // Unknown player falls back to the id.
    expect(within(table).getByText('p-2')).toBeInTheDocument();
  });

  it('shows the load error banner when the ladder request fails', async () => {
    mockDivisionLadderApi.get.mockRejectedValue(new Error('boom'));
    render(<ManageDivisionLadder />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('admin.divisionLadder.loadError');
    });
  });
});
