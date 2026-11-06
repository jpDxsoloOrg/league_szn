import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockPlayersApi, mockDivisionsApi, mockImagesApi, mockWrestlersApi } =
  vi.hoisted(() => ({
    mockPlayersApi: {
      getAllIncludingHidden: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    mockDivisionsApi: { getAll: vi.fn() },
    mockImagesApi: { generateUploadUrl: vi.fn(), uploadToS3: vi.fn() },
    mockWrestlersApi: { getAll: vi.fn() },
  }));

vi.mock('react-i18next', async () => (await import('./i18nMock')).i18nMock);

vi.mock('../../../services/api', () => ({
  playersApi: mockPlayersApi,
  divisionsApi: mockDivisionsApi,
  imagesApi: mockImagesApi,
  wrestlersApi: mockWrestlersApi,
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
    wins: 10, losses: 3, draws: 1, divisionId: 'div-1',
    imageUrl: 'https://img.example.com/rock.png',
    createdAt: '2024-01-01', updatedAt: '2024-01-01',
  },
  {
    playerId: 'p2', name: 'Jane', currentWrestler: 'Becky Lynch',
    currentWrestlerId: 'w-becky',
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
    mockPlayersApi.getAllIncludingHidden.mockResolvedValue(mockPlayers);
    mockDivisionsApi.getAll.mockResolvedValue(mockDivisions);
    mockWrestlersApi.getAll.mockResolvedValue(mockWrestlers);
  });

  it('shows loading state during initial fetch', () => {
    mockPlayersApi.getAllIncludingHidden.mockReturnValue(new Promise(() => {}));
    mockDivisionsApi.getAll.mockReturnValue(new Promise(() => {}));
    mockWrestlersApi.getAll.mockReturnValue(new Promise(() => {}));
    renderComponent();
    expect(screen.getByRole('status')).toBeInTheDocument();
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

  it('names the failed read, keeps the rest of the page, and retries', async () => {
    const user = userEvent.setup();
    mockWrestlersApi.getAll.mockRejectedValueOnce(new Error('Network error'));
    renderComponent();

    const notice = await screen.findByRole('alert');
    expect(notice).toHaveTextContent("Couldn't load: Wrestlers.");
    expect(screen.getByText('John')).toBeInTheDocument();

    await user.click(within(notice).getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(mockWrestlersApi.getAll).toHaveBeenCalledTimes(2);
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
        clearCurrentWrestler: true,
      }));
    });
  });

  describe('players whose wrestler is a name with no roster link', () => {
    const namedPlayer: Player = {
      playerId: 'p3', name: 'Adam', currentWrestler: 'Edge', alternateWrestler: 'Christian',
      wins: 1, losses: 0, draws: 0,
      createdAt: '2024-01-01', updatedAt: '2024-01-01',
    };

    const openEdit = async (user: ReturnType<typeof userEvent.setup>) => {
      mockPlayersApi.getAllIncludingHidden.mockResolvedValue([namedPlayer]);
      mockPlayersApi.update.mockResolvedValue(namedPlayer);
      renderComponent();
      await waitFor(() => { expect(screen.getByText('Adam')).toBeInTheDocument(); });
      await user.click(screen.getByRole('button', { name: 'Edit' }));
    };

    const selectedText = (label: string) => {
      const select = screen.getByLabelText(label) as HTMLSelectElement;
      return select.selectedOptions[0]?.textContent;
    };

    it('shows the stored names rather than the empty options', async () => {
      const user = userEvent.setup();
      await openEdit(user);

      expect(selectedText('Wrestler')).toBe('Edge (custom name)');
      expect(selectedText('Alternate Wrestler')).toBe('Christian (custom name)');
    });

    it('sends neither wrestler field on a no-change save', async () => {
      const user = userEvent.setup();
      await openEdit(user);

      await user.click(screen.getByRole('button', { name: 'Update Player' }));

      await waitFor(() => { expect(mockPlayersApi.update).toHaveBeenCalledTimes(1); });
      const body = mockPlayersApi.update.mock.calls[0][1];
      expect(body).not.toHaveProperty('currentWrestlerId');
      expect(body).not.toHaveProperty('alternateWrestlerId');
    });

    it('sends neither wrestler field on a division-only save', async () => {
      const user = userEvent.setup();
      await openEdit(user);

      await user.selectOptions(screen.getByLabelText('Division'), 'div-2');
      await user.click(screen.getByRole('button', { name: 'Update Player' }));

      await waitFor(() => { expect(mockPlayersApi.update).toHaveBeenCalledTimes(1); });
      const body = mockPlayersApi.update.mock.calls[0][1];
      expect(body).toMatchObject({ divisionId: 'div-2' });
      expect(body).not.toHaveProperty('currentWrestlerId');
      expect(body).not.toHaveProperty('alternateWrestlerId');
    });

    it('leaves the video upload flag out of a save that did not change it', async () => {
      const user = userEvent.setup();
      await openEdit(user);

      await user.click(screen.getByRole('button', { name: 'Update Player' }));

      await waitFor(() => { expect(mockPlayersApi.update).toHaveBeenCalledTimes(1); });
      expect(mockPlayersApi.update.mock.calls[0][1]).not.toHaveProperty('canUploadVideos');
    });

    it('sends only the slot the admin changed', async () => {
      const user = userEvent.setup();
      await openEdit(user);

      await user.selectOptions(screen.getByLabelText('Alternate Wrestler'), 'w-omega');
      await user.click(screen.getByRole('button', { name: 'Update Player' }));

      await waitFor(() => { expect(mockPlayersApi.update).toHaveBeenCalledTimes(1); });
      const body = mockPlayersApi.update.mock.calls[0][1];
      expect(body).toMatchObject({ alternateWrestlerId: 'w-omega' });
      expect(body).not.toHaveProperty('currentWrestlerId');
    });

    it('sends nothing for a slot changed and then put back', async () => {
      const user = userEvent.setup();
      await openEdit(user);

      const wrestlerSelect = screen.getByLabelText('Wrestler') as HTMLSelectElement;
      const originalValue = wrestlerSelect.value;
      await user.selectOptions(wrestlerSelect, 'w-omega');
      await user.selectOptions(wrestlerSelect, originalValue);
      await user.click(screen.getByRole('button', { name: 'Update Player' }));

      await waitFor(() => { expect(mockPlayersApi.update).toHaveBeenCalledTimes(1); });
      expect(mockPlayersApi.update.mock.calls[0][1]).not.toHaveProperty('currentWrestlerId');
    });

    it('still clears the wrestler when the admin picks that, and warns first', async () => {
      const user = userEvent.setup();
      await openEdit(user);

      await user.selectOptions(screen.getByLabelText('Wrestler'), '');
      expect(screen.getByText('Saving removes this wrestler and hides the player from public pages.')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Update Player' }));

      await waitFor(() => {
        expect(mockPlayersApi.update).toHaveBeenCalledWith('p3', expect.objectContaining({ clearCurrentWrestler: true }));
      });
      expect(mockPlayersApi.update.mock.calls[0][1]).not.toHaveProperty('currentWrestlerId');
    });

    it('states a clear of a name-only alternate outright too', async () => {
      const user = userEvent.setup();
      await openEdit(user);

      await user.selectOptions(screen.getByLabelText('Alternate Wrestler'), '');
      await user.click(screen.getByRole('button', { name: 'Update Player' }));

      await waitFor(() => { expect(mockPlayersApi.update).toHaveBeenCalledTimes(1); });
      const body = mockPlayersApi.update.mock.calls[0][1];
      expect(body).toMatchObject({ clearAlternateWrestler: true });
      expect(body).not.toHaveProperty('alternateWrestlerId');
      expect(body).not.toHaveProperty('clearCurrentWrestler');
    });
  });

  describe('a linked player who renamed their wrestler', () => {
    const renamed = {
      ...mockPlayers[0],
      currentWrestler: 'Jaxon Alexzander',
      currentWrestlerId: rockWrestler.wrestlerId,
    };

    const openEdit = async (player: typeof renamed) => {
      const user = userEvent.setup();
      mockPlayersApi.getAllIncludingHidden.mockResolvedValue([player]);
      mockPlayersApi.update.mockResolvedValue(player);
      mockWrestlersApi.getAll.mockResolvedValue(mockWrestlers.map((wrestler) => (
        wrestler.wrestlerId === player.currentWrestlerId ? { ...wrestler, isInUse: true } : wrestler
      )));
      renderComponent();
      await screen.findByText(player.name);
      await user.click(screen.getByRole('button', { name: 'Edit' }));
      return { user, select: screen.getByLabelText('Wrestler') as HTMLSelectElement };
    };

    it('opens on the name the table shows, with the roster row still on offer', async () => {
      const { select } = await openEdit(renamed);

      expect(select.selectedOptions[0]?.textContent).toBe('Jaxon Alexzander (custom name)');
      const linkedRow = Array.from(select.options).find((option) => option.value === renamed.currentWrestlerId);
      expect(linkedRow).toBeDefined();
    });

    it('sends no wrestler field on a no-change save', async () => {
      const { user } = await openEdit(renamed);

      await user.click(screen.getByRole('button', { name: 'Update Player' }));

      await waitFor(() => expect(mockPlayersApi.update).toHaveBeenCalled());
      const payload = mockPlayersApi.update.mock.calls[0]?.[1];
      expect(payload).not.toHaveProperty('currentWrestlerId');
      expect(payload).not.toHaveProperty('clearCurrentWrestler');
    });

    it('can relink to the roster row', async () => {
      const { user, select } = await openEdit(renamed);

      await user.selectOptions(select, renamed.currentWrestlerId);
      await user.click(screen.getByRole('button', { name: 'Update Player' }));

      await waitFor(() => expect(mockPlayersApi.update).toHaveBeenCalled());
      expect(mockPlayersApi.update.mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({ currentWrestlerId: renamed.currentWrestlerId }),
      );
    });

    it('treats a difference in case alone as still linked', async () => {
      const { select } = await openEdit({ ...renamed, currentWrestler: rockWrestler.name.toUpperCase() });

      expect(select.value).toBe(renamed.currentWrestlerId);
    });
  });

  it('keeps a linked wrestler whose roster row is gone on a no-change save', async () => {
    const user = userEvent.setup();
    mockPlayersApi.getAllIncludingHidden.mockResolvedValue([
      { ...mockPlayers[0]!, currentWrestlerId: 'w-gone' },
    ]);
    mockPlayersApi.update.mockResolvedValue(mockPlayers[0]);
    renderComponent();
    await waitFor(() => { expect(screen.getByText('John')).toBeInTheDocument(); });

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const wrestlerSelect = screen.getByLabelText('Wrestler') as HTMLSelectElement;
    expect(wrestlerSelect.selectedOptions[0]?.textContent).toBe('The Rock (custom name)');

    await user.click(screen.getByRole('button', { name: 'Update Player' }));

    await waitFor(() => { expect(mockPlayersApi.update).toHaveBeenCalledTimes(1); });
    expect(mockPlayersApi.update.mock.calls[0][1]).not.toHaveProperty('currentWrestlerId');
  });

  describe('clearing the PSN ID and the image', () => {
    const fullPlayer = { ...mockPlayers[0], psnId: 'rock_psn' };

    const openEdit = async (user: ReturnType<typeof userEvent.setup>) => {
      mockPlayersApi.getAllIncludingHidden.mockResolvedValue([fullPlayer]);
      mockPlayersApi.update.mockResolvedValue(fullPlayer);
      renderComponent();
      await waitFor(() => { expect(screen.getByText('John')).toBeInTheDocument(); });
      await user.click(screen.getByRole('button', { name: 'Edit' }));
    };

    const save = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getByRole('button', { name: 'Update Player' }));
      await waitFor(() => { expect(mockPlayersApi.update).toHaveBeenCalledTimes(1); });
      return mockPlayersApi.update.mock.calls[0][1];
    };

    it('sends neither field on a save that left them alone', async () => {
      const user = userEvent.setup();
      await openEdit(user);

      const body = await save(user);
      expect(body).not.toHaveProperty('psnId');
      expect(body).not.toHaveProperty('imageUrl');
    });

    it('sends an empty PSN ID when the admin blanked it', async () => {
      const user = userEvent.setup();
      await openEdit(user);
      await user.clear(screen.getByLabelText(/PSN ID/i));

      const body = await save(user);
      expect(body.psnId).toBe('');
      expect(body).not.toHaveProperty('imageUrl');
    });

    it('sends an empty image URL when the admin removed the image', async () => {
      const user = userEvent.setup();
      await openEdit(user);
      await user.click(screen.getByRole('button', { name: /Remove Image/i }));

      const body = await save(user);
      expect(body.imageUrl).toBe('');
      expect(body).not.toHaveProperty('psnId');
    });

    it('sends a changed PSN ID', async () => {
      const user = userEvent.setup();
      await openEdit(user);
      const field = screen.getByLabelText(/PSN ID/i);
      await user.clear(field);
      await user.type(field, 'new_psn');

      const body = await save(user);
      expect(body.psnId).toBe('new_psn');
    });
  });

  it('deletes player after confirming in the dialog', async () => {
    const user = userEvent.setup();
    mockPlayersApi.delete.mockResolvedValue(undefined);
    renderComponent();

    await waitFor(() => { expect(screen.getByText('John')).toBeInTheDocument(); });

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    await user.click(deleteButtons[0]!);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Are you sure you want to delete John? This action cannot be undone.');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(mockPlayersApi.delete).toHaveBeenCalledWith('p1');
    });
    await waitFor(() => {
      expect(screen.getByText('Player deleted successfully!')).toBeInTheDocument();
    });
  });

  it('does not delete player when the dialog is cancelled', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => { expect(screen.getByText('John')).toBeInTheDocument(); });

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    await user.click(deleteButtons[0]!);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    expect(mockPlayersApi.delete).not.toHaveBeenCalled();
  });

  it('shows a hidden badge on players with no wrestler and can filter to them', async () => {
    const user = userEvent.setup();
    mockPlayersApi.getAllIncludingHidden.mockResolvedValue([
      ...mockPlayers,
      {
        playerId: 'p3', name: 'Newbie', currentWrestler: 'Needs Wrestler',
        wins: 0, losses: 0, draws: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01',
      },
      {
        playerId: 'p4', name: 'Blank', currentWrestler: '   ',
        wins: 0, losses: 0, draws: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01',
      },
    ]);
    renderComponent();

    await waitFor(() => { expect(screen.getByText('All Players (4)')).toBeInTheDocument(); });

    expect(mockPlayersApi.getAllIncludingHidden).toHaveBeenCalled();
    const newbieRow = screen.getByText('Newbie').closest('tr')!;
    expect(within(newbieRow).getByText('Hidden')).toBeInTheDocument();
    expect(screen.queryByText('Needs Wrestler')).not.toBeInTheDocument();
    expect(within(screen.getByText('John').closest('tr')!).queryByText('Hidden')).not.toBeInTheDocument();
    expect(screen.getByText('2 hidden')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Filter players' }));
    await user.click(await screen.findByRole('option', { name: 'Hidden (no wrestler)' }));

    expect(screen.getByText('All Players (2 of 4)')).toBeInTheDocument();
    expect(screen.queryByText('John')).not.toBeInTheDocument();
    expect(screen.getByText('Newbie')).toBeInTheDocument();
  });

  it('starts on every division so hidden players are not filtered out of view', async () => {
    mockDivisionsApi.getAll.mockResolvedValue([
      { divisionId: 'div-h', name: 'Heavyweight', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    ]);
    mockPlayersApi.getAllIncludingHidden.mockResolvedValue([
      ...mockPlayers,
      {
        playerId: 'p3', name: 'Newbie', currentWrestler: 'Needs Wrestler',
        wins: 0, losses: 0, draws: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01',
      },
    ]);
    renderComponent();

    expect(await screen.findByText('Newbie')).toBeInTheDocument();
    expect(screen.getByText('All Players (3)')).toBeInTheDocument();
  });

  it('filters players by search text', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => { expect(screen.getByText('John')).toBeInTheDocument(); });

    await user.type(screen.getByRole('searchbox', { name: 'Search players' }), 'becky');

    expect(screen.queryByText('John')).not.toBeInTheDocument();
    expect(screen.getByText('Jane')).toBeInTheDocument();
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
    expect(mockPlayersApi.getAllIncludingHidden).toHaveBeenCalledTimes(2);
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
});
