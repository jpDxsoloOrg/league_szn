import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockPlayersApi, mockDivisionsApi, mockImagesApi, mockWrestlersApi, mockSeasonsApi, mockAdminApi } =
  vi.hoisted(() => ({
    mockPlayersApi: {
      getAll: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      setActiveStatus: vi.fn(),
    },
    mockDivisionsApi: { getAll: vi.fn() },
    mockImagesApi: { generateUploadUrl: vi.fn(), uploadToS3: vi.fn() },
    mockWrestlersApi: { getAll: vi.fn() },
    mockSeasonsApi: { getAll: vi.fn() },
    mockAdminApi: { recomputeActiveStatus: vi.fn() },
  }));

vi.mock('../../../services/api', () => ({
  playersApi: mockPlayersApi,
  divisionsApi: mockDivisionsApi,
  imagesApi: mockImagesApi,
  wrestlersApi: mockWrestlersApi,
  seasonsApi: mockSeasonsApi,
  adminApi: mockAdminApi,
}));

import ManagePlayers from '../ManagePlayers';
import type { Player, Division, Wrestler } from '../../../types';

// --- Test data ---
const mockDivisions: Division[] = [
  { divisionId: 'div-1', name: 'Raw', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { divisionId: 'div-2', name: 'SmackDown', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

const rockWrestler: Wrestler = {
  wrestlerId: 'w-rock',
  promotion: 'WWE',
  name: 'The Rock',
  overallCap: 93,
  isInUse: true,
  assignedPlayerId: 'p1',
  assignedSlot: 'primary',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};
const beckyWrestler: Wrestler = {
  wrestlerId: 'w-becky',
  promotion: 'WWE',
  name: 'Becky Lynch',
  overallCap: 91,
  isInUse: true,
  assignedPlayerId: 'p2',
  assignedSlot: 'primary',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};
const omegaWrestler: Wrestler = {
  wrestlerId: 'w-omega',
  promotion: 'AEW',
  name: 'Kenny Omega',
  overallCap: 92,
  isInUse: false,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};
const mockWrestlers: Wrestler[] = [rockWrestler, beckyWrestler, omegaWrestler];

const mockPlayers: Player[] = [
  {
    playerId: 'p1', name: 'John', currentWrestler: 'The Rock',
    currentWrestlerId: 'w-rock',
    isActive: true, lastActiveSeasonId: 's1',
    wins: 10, losses: 3, draws: 1, divisionId: 'div-1',
    imageUrl: 'https://img.example.com/rock.png',
    createdAt: '2024-01-01', updatedAt: '2024-01-01',
  },
  {
    playerId: 'p2', name: 'Jane', currentWrestler: 'Becky Lynch',
    currentWrestlerId: 'w-becky',
    isActive: false,
    wins: 8, losses: 5, draws: 0, userId: 'user-abc',
    createdAt: '2024-01-01', updatedAt: '2024-01-01',
  },
];

function renderComponent() {
  return render(<BrowserRouter><ManagePlayers /></BrowserRouter>);
}

describe('ManagePlayers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlayersApi.getAll.mockResolvedValue(mockPlayers);
    mockDivisionsApi.getAll.mockResolvedValue(mockDivisions);
    mockWrestlersApi.getAll.mockResolvedValue(mockWrestlers);
    mockSeasonsApi.getAll.mockResolvedValue([
      { seasonId: 's1', name: 'Season 1', startDate: '2026-01-01', status: 'active', createdAt: '', updatedAt: '' },
    ]);
  });

  it('shows loading state during initial fetch', () => {
    mockPlayersApi.getAll.mockReturnValue(new Promise(() => {}));
    mockDivisionsApi.getAll.mockReturnValue(new Promise(() => {}));
    mockWrestlersApi.getAll.mockReturnValue(new Promise(() => {}));
    mockSeasonsApi.getAll.mockReturnValue(new Promise(() => {}));
    renderComponent();
    expect(screen.getByText('Loading players...')).toBeInTheDocument();
  });

  it('renders player list from API after loading', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('All Players (2)')).toBeInTheDocument();
    });

    expect(screen.getByText('John')).toBeInTheDocument();
    expect(screen.getByText('The Rock')).toBeInTheDocument();
    expect(screen.getByText('Jane')).toBeInTheDocument();
    expect(screen.getByText('Becky Lynch')).toBeInTheDocument();
    expect(screen.getByText('10W - 3L - 1D')).toBeInTheDocument();
    // "Raw" appears as both a filter dropdown option and a division cell; target the cell
    expect(screen.getByText('Raw', { selector: '.division-cell' })).toBeInTheDocument();
    // "Linked" appears as both a table header and badge; target the badge by CSS class
    expect(screen.getByText('Linked', { selector: '.linked-badge' })).toBeInTheDocument();
    expect(screen.getByText('Manual')).toBeInTheDocument();
  });

  it('shows error state on API failure', async () => {
    mockPlayersApi.getAll.mockRejectedValue(new Error('Network error'));
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Failed to load data')).toBeInTheDocument();
    });
  });

  it('does not show player form initially', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('All Players (2)')).toBeInTheDocument();
    });
    expect(screen.queryByText('Add New Player')).not.toBeInTheDocument();
    expect(screen.queryByText('Edit Player')).not.toBeInTheDocument();
  });

  it('opens edit form pre-populated with player data, dropdown shows current wrestler', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('John')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    await user.click(editButtons[0]);

    expect(screen.getByText('Edit Player')).toBeInTheDocument();
    expect(screen.getByDisplayValue('John')).toBeInTheDocument();

    // The wrestler dropdown pre-selects the player's currentWrestlerId,
    // even though the underlying wrestler is isInUse=true (the component
    // always surfaces the current pick).
    const wrestlerSelect = screen.getByLabelText('Wrestler') as HTMLSelectElement;
    expect(wrestlerSelect.value).toBe('w-rock');
  });

  it('wrestler dropdown hides wrestlers assigned to other players but keeps current selection', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => { expect(screen.getByText('John')).toBeInTheDocument(); });

    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    await user.click(editButtons[0]);

    const wrestlerSelect = screen.getByLabelText('Wrestler') as HTMLSelectElement;
    const optionLabels = Array.from(wrestlerSelect.options).map((o) => o.textContent ?? '');

    // Includes the placeholder + Rock (current) + Omega (available)
    expect(optionLabels.some((l) => l.includes('The Rock'))).toBe(true);
    expect(optionLabels.some((l) => l.includes('Kenny Omega'))).toBe(true);
    // Does NOT include Becky — she's assigned to Jane and is not the current pick
    expect(optionLabels.some((l) => l.includes('Becky Lynch'))).toBe(false);
  });

  it('picking the same wrestler for both slots is prevented — the other slot drops it', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => { expect(screen.getByText('John')).toBeInTheDocument(); });
    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    await user.click(editButtons[0]);

    // After the primary is set to w-rock, the alternate dropdown excludes it.
    const altSelect = screen.getByLabelText('Alternate Wrestler') as HTMLSelectElement;
    const altLabels = Array.from(altSelect.options).map((o) => o.textContent ?? '');
    expect(altLabels.some((l) => l.includes('The Rock'))).toBe(false);
  });

  it('edits existing player and submits the FK instead of free text', async () => {
    const user = userEvent.setup();
    mockPlayersApi.update.mockResolvedValue({
      ...mockPlayers[0],
      currentWrestler: 'Kenny Omega',
      currentWrestlerId: 'w-omega',
    });

    renderComponent();
    await waitFor(() => { expect(screen.getByText('John')).toBeInTheDocument(); });

    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    await user.click(editButtons[0]);

    const wrestlerSelect = screen.getByLabelText('Wrestler') as HTMLSelectElement;
    await user.selectOptions(wrestlerSelect, 'w-omega');
    expect(wrestlerSelect.value).toBe('w-omega');

    await user.click(screen.getByRole('button', { name: 'Update Player' }));

    await waitFor(() => {
      expect(mockPlayersApi.update).toHaveBeenCalledWith('p1', expect.objectContaining({
        currentWrestlerId: 'w-omega',
      }));
    });
    // Free-text `currentWrestler` is not sent — the backend derives it.
    expect(mockPlayersApi.update.mock.calls[0][1]).not.toHaveProperty('currentWrestler');
    await waitFor(() => {
      expect(screen.getByText('Player updated successfully!')).toBeInTheDocument();
    });
  });

  it('clears the wrestler slot when the placeholder option is picked', async () => {
    const user = userEvent.setup();
    mockPlayersApi.update.mockResolvedValue({ playerId: 'p1' });
    renderComponent();
    await waitFor(() => { expect(screen.getByText('John')).toBeInTheDocument(); });

    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    await user.click(editButtons[0]);

    const wrestlerSelect = screen.getByLabelText('Wrestler') as HTMLSelectElement;
    // A wrestler is optional — picking the placeholder drops the player back
    // to "Needs Wrestler" instead of blocking the save.
    await user.selectOptions(wrestlerSelect, '');

    await user.click(screen.getByRole('button', { name: 'Update Player' }));

    await waitFor(() => {
      expect(mockPlayersApi.update).toHaveBeenCalledWith('p1', expect.objectContaining({
        currentWrestlerId: '',
      }));
    });
  });

  it('deletes player with confirmation dialog', async () => {
    const user = userEvent.setup();
    mockPlayersApi.delete.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderComponent();
    await waitFor(() => { expect(screen.getByText('John')).toBeInTheDocument(); });

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    await user.click(deleteButtons[0]);

    expect(confirmSpy).toHaveBeenCalledWith(
      'Are you sure you want to delete John? This action cannot be undone.'
    );
    await waitFor(() => {
      expect(mockPlayersApi.delete).toHaveBeenCalledWith('p1');
    });
    await waitFor(() => {
      expect(screen.getByText('Player deleted successfully!')).toBeInTheDocument();
    });
    confirmSpy.mockRestore();
  });

  it('does not delete player when confirmation is cancelled', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderComponent();
    await waitFor(() => { expect(screen.getByText('John')).toBeInTheDocument(); });

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    await user.click(deleteButtons[0]);

    expect(confirmSpy).toHaveBeenCalled();
    expect(mockPlayersApi.delete).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('handles image upload via presigned URL and S3', async () => {
    const user = userEvent.setup();
    mockImagesApi.generateUploadUrl.mockResolvedValue({
      uploadUrl: 'https://s3.example.com/presigned',
      imageUrl: 'https://cdn.example.com/wrestlers/test.png',
      fileKey: 'wrestlers/test.png',
    });
    mockImagesApi.uploadToS3.mockResolvedValue(undefined);
    mockPlayersApi.update.mockResolvedValue({
      ...mockPlayers[0], imageUrl: 'https://cdn.example.com/wrestlers/test.png',
    });

    renderComponent();
    await waitFor(() => { expect(screen.getByText('John')).toBeInTheDocument(); });

    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    await user.click(editButtons[0]);

    // Remove existing image to reveal the file input
    await user.click(screen.getByRole('button', { name: 'Remove Image' }));

    // Upload a new file
    const fileInput = screen.getByLabelText('Click to upload image') as HTMLInputElement;
    const file = new File(['(png content)'], 'test.png', { type: 'image/png' });
    await user.upload(fileInput, file);

    // Submit and verify the two-step upload (presigned URL then S3 PUT)
    await user.click(screen.getByRole('button', { name: 'Update Player' }));

    await waitFor(() => {
      expect(mockImagesApi.generateUploadUrl).toHaveBeenCalledWith('test.png', 'image/png', 'wrestlers');
    });
    await waitFor(() => {
      expect(mockImagesApi.uploadToS3).toHaveBeenCalledWith('https://s3.example.com/presigned', file);
    });
    await waitFor(() => {
      expect(mockPlayersApi.update).toHaveBeenCalledWith('p1', expect.objectContaining({
        imageUrl: 'https://cdn.example.com/wrestlers/test.png',
      }));
    });
  });

  it('shows success message after edit and reloads data', async () => {
    const user = userEvent.setup();
    mockPlayersApi.update.mockResolvedValue({ ...mockPlayers[0], name: 'Updated' });

    renderComponent();
    await waitFor(() => { expect(screen.getByText('John')).toBeInTheDocument(); });

    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    await user.click(editButtons[0]);
    await user.click(screen.getByRole('button', { name: 'Update Player' }));

    await waitFor(() => {
      expect(screen.getByText('Player updated successfully!')).toBeInTheDocument();
    });
    // loadData is called again after success (initial load + post-save reload)
    expect(mockPlayersApi.getAll).toHaveBeenCalledTimes(2);
  });

  it('shows error when save fails', async () => {
    const user = userEvent.setup();
    mockPlayersApi.update.mockRejectedValue(new Error('Server error'));

    renderComponent();
    await waitFor(() => { expect(screen.getByText('John')).toBeInTheDocument(); });

    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    await user.click(editButtons[0]);
    await user.click(screen.getByRole('button', { name: 'Update Player' }));

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });

  it('roster groups options by promotion', async () => {
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => { expect(screen.getByText('John')).toBeInTheDocument(); });

    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    await user.click(editButtons[0]);

    // Primary dropdown includes both promotions because Rock (the current
    // pick) keeps the WWE group visible, and Omega (available) drives AEW.
    const primarySelect = screen.getByLabelText('Wrestler') as HTMLSelectElement;
    const primaryLabels = within(primarySelect)
      .getAllByRole('group')
      .map((g) => g.getAttribute('label'));
    expect(primaryLabels).toContain('AEW');
    expect(primaryLabels).toContain('WWE');
  });

  // ── Active / inactive status ─────────────────────────────────────

  it('badges each player active or inactive', async () => {
    renderComponent();

    await waitFor(() => expect(screen.getByText('All Players (2)')).toBeInTheDocument());

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('forces a player active through the three-state override control', async () => {
    const user = userEvent.setup();
    mockPlayersApi.setActiveStatus.mockResolvedValue({
      playerId: 'p2',
      isActive: true,
      activeOverride: { seasonId: 's1', value: true, setBy: 'admin', setAt: 'now' },
    });
    renderComponent();

    await waitFor(() => expect(screen.getByText('All Players (2)')).toBeInTheDocument());

    const select = screen.getByLabelText('Active status for Jane');
    expect((select as HTMLSelectElement).value).toBe('auto');
    await user.selectOptions(select, 'active');

    expect(mockPlayersApi.setActiveStatus).toHaveBeenCalledWith('p2', true);
    await waitFor(() =>
      expect(screen.getByText('Jane is now active')).toBeInTheDocument(),
    );
  });

  it('reverts to auto by clearing the override', async () => {
    const user = userEvent.setup();
    mockPlayersApi.getAll.mockResolvedValue([
      {
        ...mockPlayers[1],
        activeOverride: { seasonId: 's1', value: false, setBy: 'admin', setAt: 'now' },
      },
    ]);
    mockPlayersApi.setActiveStatus.mockResolvedValue({
      playerId: 'p2',
      isActive: false,
      activeOverride: null,
    });
    renderComponent();

    await waitFor(() => expect(screen.getByText('All Players (1)')).toBeInTheDocument());

    const select = screen.getByLabelText('Active status for Jane');
    expect((select as HTMLSelectElement).value).toBe('inactive');
    await user.selectOptions(select, 'auto');

    expect(mockPlayersApi.setActiveStatus).toHaveBeenCalledWith('p2', null);
  });

  it('disables the override control when no season is active', async () => {
    mockSeasonsApi.getAll.mockResolvedValue([
      { seasonId: 's0', name: 'Season 0', startDate: '2025-01-01', status: 'completed', createdAt: '', updatedAt: '' },
    ]);
    renderComponent();

    await waitFor(() => expect(screen.getByText('All Players (2)')).toBeInTheDocument());

    expect(screen.getByLabelText('Active status for Jane')).toBeDisabled();
    expect(screen.getByRole('button', { name: /recompute active status/i })).toBeDisabled();
  });

  it('recomputes active status and reloads', async () => {
    const user = userEvent.setup();
    mockAdminApi.recomputeActiveStatus.mockResolvedValue({
      seasonId: 's1', playersScanned: 2, completedMatches: 3, marked: 1, cleared: 0,
    });
    renderComponent();

    await waitFor(() => expect(screen.getByText('All Players (2)')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /recompute active status/i }));

    expect(mockAdminApi.recomputeActiveStatus).toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.getByText('Active status recomputed: 1 marked active, 0 cleared.'),
      ).toBeInTheDocument(),
    );
  });
});
