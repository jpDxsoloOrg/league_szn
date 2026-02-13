import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockPlayersApi, mockDivisionsApi, mockImagesApi } = vi.hoisted(() => ({
  mockPlayersApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  mockDivisionsApi: { getAll: vi.fn() },
  mockImagesApi: { generateUploadUrl: vi.fn(), uploadToS3: vi.fn() },
}));

vi.mock('../../../services/api', () => ({
  playersApi: mockPlayersApi,
  divisionsApi: mockDivisionsApi,
  imagesApi: mockImagesApi,
}));

import ManagePlayers from '../ManagePlayers';
import type { Player, Division } from '../../../types';

// --- Test data ---
const mockDivisions: Division[] = [
  { divisionId: 'div-1', name: 'Raw', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { divisionId: 'div-2', name: 'SmackDown', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

const mockPlayers: Player[] = [
  {
    playerId: 'p1', name: 'John', currentWrestler: 'The Rock',
    wins: 10, losses: 3, draws: 1, divisionId: 'div-1',
    imageUrl: 'https://img.example.com/rock.png',
    createdAt: '2024-01-01', updatedAt: '2024-01-01',
  },
  {
    playerId: 'p2', name: 'Jane', currentWrestler: 'Becky Lynch',
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
  });

  it('shows loading state during initial fetch', () => {
    mockPlayersApi.getAll.mockReturnValue(new Promise(() => {}));
    mockDivisionsApi.getAll.mockReturnValue(new Promise(() => {}));
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
    expect(screen.getByText('Raw')).toBeInTheDocument();
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
    // Form is hidden until triggered via Edit button
    expect(screen.queryByText('Add New Player')).not.toBeInTheDocument();
    expect(screen.queryByText('Edit Player')).not.toBeInTheDocument();
  });

  it('opens edit form pre-populated with player data', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('John')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    await user.click(editButtons[0]);

    expect(screen.getByText('Edit Player')).toBeInTheDocument();
    expect(screen.getByDisplayValue('John')).toBeInTheDocument();
    expect(screen.getByDisplayValue('The Rock')).toBeInTheDocument();
  });

  it('edits existing player and saves changes via API', async () => {
    const user = userEvent.setup();
    const updatedPlayer = { ...mockPlayers[0], name: 'John Updated', currentWrestler: 'The Boulder' };
    mockPlayersApi.update.mockResolvedValue(updatedPlayer);

    renderComponent();
    await waitFor(() => { expect(screen.getByText('John')).toBeInTheDocument(); });

    // Open edit form
    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    await user.click(editButtons[0]);

    // Verify pre-populated and modify
    const nameInput = screen.getByLabelText('Player Name');
    const wrestlerInput = screen.getByLabelText('Wrestler');
    expect(nameInput).toHaveValue('John');
    expect(wrestlerInput).toHaveValue('The Rock');

    await user.clear(nameInput);
    await user.type(nameInput, 'John Updated');
    await user.clear(wrestlerInput);
    await user.type(wrestlerInput, 'The Boulder');

    await user.click(screen.getByRole('button', { name: 'Update Player' }));

    await waitFor(() => {
      expect(mockPlayersApi.update).toHaveBeenCalledWith('p1', expect.objectContaining({
        name: 'John Updated',
        currentWrestler: 'The Boulder',
      }));
    });
    await waitFor(() => {
      expect(screen.getByText('Player updated successfully!')).toBeInTheDocument();
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

    // Open edit form for player that already has an image
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
});
