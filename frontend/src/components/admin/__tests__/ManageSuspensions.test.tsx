import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Player, SuspensionRow } from '../../../types';

const { mockPlayersApi } = vi.hoisted(() => ({
  mockPlayersApi: {
    getAll: vi.fn(),
    getBookingSummary: vi.fn(),
    getSuspensions: vi.fn(),
    suspend: vi.fn(),
    reinstate: vi.fn(),
  },
}));

vi.mock('../../../services/api', () => ({
  playersApi: mockPlayersApi,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: string | Record<string, unknown>) => {
      if (typeof options === 'string') return options;
      if (options && typeof options === 'object' && typeof options.defaultValue === 'string') {
        return options.defaultValue;
      }
      return key;
    },
  }),
}));

vi.mock('../ManageSuspensions.css', () => ({}));
vi.mock('../SuspensionDialogs.css', () => ({}));
vi.mock('../../events/PlayerBookingPicker.css', () => ({}));

import ManageSuspensions from '../ManageSuspensions';

function player(id: string, name: string, wrestler: string, extra: Partial<Player> = {}): Player {
  return {
    playerId: id,
    name,
    currentWrestler: wrestler,
    wins: 0,
    losses: 0,
    draws: 0,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    ...extra,
  } as Player;
}

const suspendedPlayer = player('p2', 'Bob', 'Bravo', {
  suspension: { suspendedAt: '2024-05-01T12:00:00Z', showsRequired: 4, reason: 'No-show' },
});

const players: Player[] = [player('p1', 'Alice', 'Alpha'), suspendedPlayer];

const rows: SuspensionRow[] = [
  {
    playerId: 'p2',
    name: 'Bob',
    currentWrestler: 'Bravo',
    suspension: suspendedPlayer.suspension!,
    showsServed: 2,
    showsRemaining: 2,
    eligibleForReinstatement: false,
    eligibleReason: null,
  },
];

async function renderAndLoad() {
  render(<ManageSuspensions />);
  await waitFor(() => {
    expect(screen.getByText('admin.suspensions.title')).toBeInTheDocument();
  });
}

async function pickPlayer(user: ReturnType<typeof userEvent.setup>, label: RegExp) {
  await user.click(screen.getByRole('button', { name: /admin\.suspensions\.searchLabel/ }));
  await user.click(screen.getByRole('option', { name: label }));
}

describe('ManageSuspensions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlayersApi.getAll.mockResolvedValue(players);
    mockPlayersApi.getBookingSummary.mockResolvedValue({});
    mockPlayersApi.getSuspensions.mockResolvedValue(rows);
  });

  it('lists current suspensions with progress', async () => {
    await renderAndLoad();
    expect(screen.getByText('admin.suspensions.showsProgress')).toBeInTheDocument();
    expect(screen.getByText('admin.suspensions.notEligible')).toBeInTheDocument();
  });

  it('opens the suspend dialog for a non-suspended player and submits a show count', async () => {
    mockPlayersApi.suspend.mockResolvedValue({
      ...players[0],
      suspension: { suspendedAt: '2024-06-01T12:00:00Z', showsRequired: 3 },
    });
    const user = userEvent.setup();
    await renderAndLoad();

    await pickPlayer(user, /Alpha \(Alice\)/);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('admin.suspensions.suspendTitle')).toBeInTheDocument();

    await user.click(screen.getByLabelText('admin.suspensions.conditionShows'));
    const showsInput = screen.getByLabelText('admin.suspensions.showsLabel');
    await user.clear(showsInput);
    await user.type(showsInput, '3');
    await user.click(screen.getByRole('button', { name: 'admin.suspensions.confirmSuspend' }));

    await waitFor(() => {
      expect(mockPlayersApi.suspend).toHaveBeenCalledWith('p1', { showsRequired: 3 });
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByText('admin.suspensions.suspendedSuccess')).toBeInTheDocument();
    expect(mockPlayersApi.getSuspensions).toHaveBeenCalledTimes(2);
  });

  it('opens the reinstate dialog for a suspended player and reinstates', async () => {
    mockPlayersApi.reinstate.mockResolvedValue({ ...suspendedPlayer, suspension: undefined });
    const user = userEvent.setup();
    await renderAndLoad();

    await pickPlayer(user, /Bravo \(Bob\)/);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('admin.suspensions.reinstateTitle')).toBeInTheDocument();
    expect(screen.getByText('admin.suspensions.reason')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'admin.suspensions.reinstateEarly' }));

    await waitFor(() => {
      expect(mockPlayersApi.reinstate).toHaveBeenCalledWith('p2');
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByText('admin.suspensions.reinstatedSuccess')).toBeInTheDocument();
  });

  it('opens the reinstate dialog from the table row', async () => {
    const user = userEvent.setup();
    await renderAndLoad();

    await user.click(screen.getByRole('button', { name: 'admin.suspensions.reinstate' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'admin.suspensions.reinstateEarly' })).toBeInTheDocument();
  });
});
