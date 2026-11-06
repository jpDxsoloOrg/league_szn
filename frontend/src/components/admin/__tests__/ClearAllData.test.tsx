import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- Hoisted mocks ---
const { mockAdminApi } = vi.hoisted(() => ({
  mockAdminApi: {
    clearAll: vi.fn(),
    seedData: vi.fn(),
  },
}));

vi.mock('../../../services/api', () => ({
  adminApi: mockAdminApi,
}));

import ClearAllData from '../ClearAllData';

type TestUser = ReturnType<typeof userEvent.setup>;

async function confirmInDialog(user: TestUser, name: string) {
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name }));
}

describe('ClearAllData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders danger zone styling with warning content and confirmation input', () => {
    render(<ClearAllData />);

    expect(screen.getByText('Danger Zone')).toBeInTheDocument();
    expect(screen.getByText('Danger Zone - Clear All Data')).toBeInTheDocument();
    expect(screen.getByText(/This action will permanently delete/)).toBeInTheDocument();
    expect(screen.getByText(/CANNOT/)).toBeInTheDocument();

    // Confirmation input and disabled button
    const confirmInput = screen.getByPlaceholderText('DELETE ALL DATA');
    expect(confirmInput).toBeInTheDocument();

    const clearBtn = screen.getByRole('button', { name: /Clear All Data/i });
    expect(clearBtn).toBeDisabled();
  });

  it('requires typing confirmation phrase before enabling delete button', async () => {
    const user = userEvent.setup();
    render(<ClearAllData />);

    const confirmInput = screen.getByPlaceholderText('DELETE ALL DATA');
    const clearBtn = screen.getByRole('button', { name: /Clear All Data/i });

    // Button disabled with empty input
    expect(clearBtn).toBeDisabled();

    // Partial text still disables the button
    await user.type(confirmInput, 'DELETE ALL');
    expect(clearBtn).toBeDisabled();

    // Full phrase enables the button
    await user.clear(confirmInput);
    await user.type(confirmInput, 'DELETE ALL DATA');
    expect(clearBtn).toBeEnabled();
  });

  it('calls clearAll API after typing confirmation and confirming dialog, shows success with counts', async () => {
    const user = userEvent.setup();
    mockAdminApi.clearAll.mockResolvedValue({
      message: 'All data cleared',
      deletedCounts: {
        players: 12,
        matches: 8,
        championships: 4,
        championshipHistory: 6,
        tournaments: 2,
        seasons: 1,
        seasonStandings: 12,
        divisions: 3,
      },
    });

    render(<ClearAllData />);

    const confirmInput = screen.getByPlaceholderText('DELETE ALL DATA');
    await user.type(confirmInput, 'DELETE ALL DATA');

    const clearBtn = screen.getByRole('button', { name: /Clear All Data/i });
    await user.click(clearBtn);
    await confirmInDialog(user, 'Clear All Data');

    await waitFor(() => {
      expect(mockAdminApi.clearAll).toHaveBeenCalledTimes(1);
    });

    // Success message — uses whatever message the server returned (so a
    // partial-success "cleared with N errors" can surface verbatim),
    // falling back to a hardcoded string only when the field is missing.
    expect(screen.getByText('All data cleared')).toBeInTheDocument();
    // Deleted counts displayed
    expect(screen.getByText('Deleted Items:')).toBeInTheDocument();
    expect(screen.getByText(/Players: 12/)).toBeInTheDocument();
    expect(screen.getByText(/Matches: 8/)).toBeInTheDocument();
    expect(screen.getByText(/Championships: 4/)).toBeInTheDocument();

    // Confirmation input should be reset
    expect(confirmInput).toHaveValue('');
  });

  it('shows error message when clearAll API fails', async () => {
    const user = userEvent.setup();
    mockAdminApi.clearAll.mockRejectedValue(new Error('Permission denied'));

    render(<ClearAllData />);

    const confirmInput = screen.getByPlaceholderText('DELETE ALL DATA');
    await user.type(confirmInput, 'DELETE ALL DATA');

    const clearBtn = screen.getByRole('button', { name: /Clear All Data/i });
    await user.click(clearBtn);
    await confirmInDialog(user, 'Clear All Data');

    await waitFor(() => {
      expect(screen.getByText('Permission denied')).toBeInTheDocument();
    });
  });

  it('does not clear data when the final warning is cancelled', async () => {
    const user = userEvent.setup();
    render(<ClearAllData />);

    await user.type(screen.getByPlaceholderText('DELETE ALL DATA'), 'DELETE ALL DATA');
    await user.click(screen.getByRole('button', { name: /Clear All Data/i }));
    await confirmInDialog(user, 'Cancel');

    expect(mockAdminApi.clearAll).not.toHaveBeenCalled();
  });

  it('generates sample data and shows the created counts', async () => {
    const user = userEvent.setup();
    render(<ClearAllData />);

    const seedBtn = screen.getByRole('button', { name: /Generate Sample Data/i });
    mockAdminApi.seedData.mockResolvedValue({
      message: 'Sample data generated',
      createdCounts: {
        divisions: 3,
        players: 12,
        seasons: 1,
        seasonStandings: 12,
        championships: 4,
        championshipHistory: 2,
        matches: 12,
        tournaments: 2,
      },
    });

    await user.click(seedBtn);
    await confirmInDialog(user, 'Generate');

    await waitFor(() => {
      expect(mockAdminApi.seedData).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText('Sample data has been generated successfully!')).toBeInTheDocument();
    expect(screen.getByText('Created Items:')).toBeInTheDocument();
    expect(screen.getByText(/Players: 12/)).toBeInTheDocument();
  });

  it('calls seedData with no args when no modules selected (full seed)', async () => {
    const user = userEvent.setup();
    mockAdminApi.seedData.mockResolvedValue({
      message: 'Sample data generated',
      createdCounts: { divisions: 3, players: 12 },
    });

    render(<ClearAllData />);
    const seedBtn = screen.getByRole('button', { name: /Generate Sample Data/i });
    await user.click(seedBtn);
    await confirmInDialog(user, 'Generate');

    await waitFor(() => {
      expect(mockAdminApi.seedData).toHaveBeenCalledTimes(1);
    });
    expect(mockAdminApi.seedData).toHaveBeenCalledWith();
  });

  it('calls seedData with selected modules when checkboxes are selected', async () => {
    const user = userEvent.setup();
    mockAdminApi.seedData.mockResolvedValue({
      message: 'Sample data generated',
      createdCounts: { divisions: 3, players: 12 },
    });

    render(<ClearAllData />);
    const coreCheckbox = screen.getByRole('checkbox', { name: /Core \(Divisions, Players, Seasons\)/ });
    await user.click(coreCheckbox);
    const championshipsCheckbox = screen.getByRole('checkbox', { name: /^Championships$/ });
    await user.click(championshipsCheckbox);

    const seedBtn = screen.getByRole('button', { name: /Generate Sample Data/i });
    await user.click(seedBtn);
    await confirmInDialog(user, 'Generate');

    await waitFor(() => {
      expect(mockAdminApi.seedData).toHaveBeenCalledTimes(1);
    });
    expect(mockAdminApi.seedData).toHaveBeenCalledWith({ modules: ['core', 'championships'] });
  });

  it('Select all selects every seed option; Generate calls seedData with all modules', async () => {
    const user = userEvent.setup();
    mockAdminApi.seedData.mockResolvedValue({
      message: 'Sample data generated',
      createdCounts: { divisions: 3 },
    });

    render(<ClearAllData />);
    const selectAllBtn = screen.getByRole('button', { name: /Select all/i });
    await user.click(selectAllBtn);

    const seedBtn = screen.getByRole('button', { name: /Generate Sample Data/i });
    await user.click(seedBtn);
    await confirmInDialog(user, 'Generate');

    await waitFor(() => {
      expect(mockAdminApi.seedData).toHaveBeenCalledTimes(1);
    });
    expect(mockAdminApi.seedData).toHaveBeenCalledWith({
      modules: [
        'core',
        'championships',
        'matches',
        'standings',
        'tournaments',
        'events',
        'contenders',
        'config',
        'rivalries',
        'matchRatings',
      ],
    });
  });

  it('Select none clears selection; Generate calls seedData with no args', async () => {
    const user = userEvent.setup();
    mockAdminApi.seedData.mockResolvedValue({
      message: 'Sample data generated',
      createdCounts: { divisions: 3 },
    });

    render(<ClearAllData />);
    const selectAllBtn = screen.getByRole('button', { name: /Select all/i });
    await user.click(selectAllBtn);
    const selectNoneBtn = screen.getByRole('button', { name: /Select none/i });
    await user.click(selectNoneBtn);

    const seedBtn = screen.getByRole('button', { name: /Generate Sample Data/i });
    await user.click(seedBtn);
    await confirmInDialog(user, 'Generate');

    await waitFor(() => {
      expect(mockAdminApi.seedData).toHaveBeenCalledTimes(1);
    });
    expect(mockAdminApi.seedData).toHaveBeenCalledWith();
  });
});
