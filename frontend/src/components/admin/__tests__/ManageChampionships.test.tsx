import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const {
  mockGetAllChampionships,
  mockCreateChampionship,
  mockUpdateChampionship,
  mockDeleteChampionship,
  mockVacateChampionship,
  mockGetAllDivisions,
  mockGetAllPlayers,
  mockGenerateUploadUrl,
  mockUploadToS3,
} = vi.hoisted(() => ({
  mockGetAllChampionships: vi.fn(),
  mockCreateChampionship: vi.fn(),
  mockUpdateChampionship: vi.fn(),
  mockDeleteChampionship: vi.fn(),
  mockVacateChampionship: vi.fn(),
  mockGetAllDivisions: vi.fn(),
  mockGetAllPlayers: vi.fn(),
  mockGenerateUploadUrl: vi.fn(),
  mockUploadToS3: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  championshipsApi: {
    getAll: mockGetAllChampionships,
    create: mockCreateChampionship,
    update: mockUpdateChampionship,
    delete: mockDeleteChampionship,
    vacate: mockVacateChampionship,
  },
  divisionsApi: {
    getAll: mockGetAllDivisions,
  },
  playersApi: {
    getAllIncludingHidden: mockGetAllPlayers,
  },
  imagesApi: {
    generateUploadUrl: mockGenerateUploadUrl,
    uploadToS3: mockUploadToS3,
  },
}));

import ManageChampionships from '../ManageChampionships';

// --- Test data ---
const mockPlayers = [
  { playerId: 'p1', name: 'John Cena', currentWrestler: 'John Cena', wins: 10, losses: 2, draws: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { playerId: 'p2', name: 'The Rock', currentWrestler: 'The Rock', wins: 8, losses: 3, draws: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

const mockDivisions = [
  { divisionId: 'd1', name: 'Raw', description: 'Monday Night Raw', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { divisionId: 'd2', name: 'SmackDown', description: 'Friday Night SmackDown', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

const mockChampionships = [
  {
    championshipId: 'c1',
    name: 'World Heavyweight Championship',
    type: 'singles' as const,
    currentChampion: 'p1',
    divisionId: 'd1',
    isActive: true,
    imageUrl: 'https://example.com/belt.jpg',
    createdAt: '2024-01-01',
  },
  {
    championshipId: 'c2',
    name: 'Tag Team Championship',
    type: 'tag' as const,
    currentChampion: undefined,
    isActive: true,
    createdAt: '2024-01-01',
  },
];

function renderManageChampionships() {
  return render(
    <BrowserRouter>
      <ManageChampionships />
    </BrowserRouter>
  );
}

/** Default mock setup for successful data loading */
function setupDefaultMocks() {
  mockGetAllChampionships.mockResolvedValue(mockChampionships);
  mockGetAllDivisions.mockResolvedValue(mockDivisions);
  mockGetAllPlayers.mockResolvedValue(mockPlayers);
}

describe('ManageChampionships', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders championship list with champion names and division info', async () => {
    setupDefaultMocks();

    renderManageChampionships();

    await screen.findByText('World Heavyweight Championship');

    // Championship names
    expect(screen.getByText('World Heavyweight Championship')).toBeInTheDocument();
    expect(screen.getByText('Tag Team Championship')).toBeInTheDocument();

    // Count header
    expect(screen.getByText('All Championships (2)')).toBeInTheDocument();

    // Champion resolved to player name
    expect(await screen.findByText('John Cena')).toBeInTheDocument();
    // Vacant for title with no champion
    expect(screen.getByText('Vacant')).toBeInTheDocument();

    // Division resolved
    expect(screen.getByText('Raw')).toBeInTheDocument();
    expect(screen.getByText('None')).toBeInTheDocument();

    // Types
    expect(screen.getByText('Singles')).toBeInTheDocument();
    expect(screen.getByText('Tag Team')).toBeInTheDocument();

    // Action buttons
    const editButtons = screen.getAllByText('Edit');
    expect(editButtons).toHaveLength(2);
    const deleteButtons = screen.getAllByText('Delete');
    expect(deleteButtons).toHaveLength(2);

    // Vacate only shows for championship with current champion
    const vacateButtons = screen.getAllByText('Vacate');
    expect(vacateButtons).toHaveLength(1);
  });

  it('shows create championship form and submits successfully', async () => {
    setupDefaultMocks();
    mockCreateChampionship.mockResolvedValue({
      championshipId: 'c3',
      name: 'Intercontinental Championship',
      type: 'singles',
      isActive: true,
      createdAt: '2024-01-01',
    });

    renderManageChampionships();

    await screen.findByText('World Heavyweight Championship');

    // Click "Create Championship" button
    fireEvent.click(screen.getByText('Create Championship'));

    // Form should appear
    expect(screen.getByText('Create New Championship')).toBeInTheDocument();
    expect(screen.getByLabelText('Championship Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Type')).toBeInTheDocument();
    expect(screen.getByLabelText(/Division/)).toBeInTheDocument();

    // Fill out form
    fireEvent.change(screen.getByLabelText('Championship Name'), {
      target: { value: 'Intercontinental Championship' },
    });
    fireEvent.change(screen.getByLabelText('Type'), {
      target: { value: 'singles' },
    });

    // Submit form
    fireEvent.click(screen.getByText('Create Championship', { selector: 'button[type="submit"]' }));

    await waitFor(() => {
      expect(mockCreateChampionship).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Intercontinental Championship',
          type: 'singles',
          isActive: true,
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Championship created successfully!')).toBeInTheDocument();
    });
  });

  it('populates form for editing an existing championship', async () => {
    setupDefaultMocks();

    renderManageChampionships();

    await screen.findByText('World Heavyweight Championship');

    // Click the first Edit button (World Heavyweight Championship)
    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    // Form should appear with edit heading
    expect(await screen.findByText('Edit Championship')).toBeInTheDocument();

    // Fields pre-populated
    const nameInput = screen.getByLabelText('Championship Name') as HTMLInputElement;
    expect(nameInput.value).toBe('World Heavyweight Championship');

    const typeSelect = screen.getByLabelText('Type') as HTMLSelectElement;
    expect(typeSelect.value).toBe('singles');

    const divisionSelect = await screen.findByLabelText(/Division/) as HTMLSelectElement;
    await waitFor(() => expect(divisionSelect.value).toBe('d1'));

    // Submit button shows "Update Championship"
    expect(screen.getByText('Update Championship')).toBeInTheDocument();
  });

  it('deletes championship with confirmation dialog', async () => {
    setupDefaultMocks();
    mockDeleteChampionship.mockResolvedValue(undefined);

    renderManageChampionships();

    await screen.findByText('World Heavyweight Championship');

    // Click the first Delete button
    const deleteButtons = screen.getAllByText('Delete');
    fireEvent.click(deleteButtons[0]);

    // Confirm in the dialog
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('deletes all championship history');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(mockDeleteChampionship).toHaveBeenCalledWith('c1');
    });

    await waitFor(() => {
      expect(screen.getByText('Championship deleted successfully!')).toBeInTheDocument();
    });
  });

  it('shows image upload controls in the create form', async () => {
    setupDefaultMocks();

    renderManageChampionships();

    await screen.findByText('World Heavyweight Championship');

    fireEvent.click(screen.getByText('Create Championship'));

    // Image upload label and file input
    expect(screen.getByText('Championship Belt Image')).toBeInTheDocument();
    expect(screen.getByText(/JPEG, PNG, GIF, or WebP/)).toBeInTheDocument();

    // File input element
    const fileInput = screen.getByLabelText('Championship Belt Image') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();
    expect(fileInput.getAttribute('accept')).toBe('image/jpeg,image/png,image/gif,image/webp');
  });

  it('vacates a championship title with confirmation', async () => {
    setupDefaultMocks();
    mockVacateChampionship.mockResolvedValue({
      ...mockChampionships[0],
      currentChampion: undefined,
    });

    renderManageChampionships();

    await screen.findByText('World Heavyweight Championship');

    // Click Vacate button (only appears for championship with a champion)
    fireEvent.click(screen.getByText('Vacate'));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('stripped of the title');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vacate' }));

    await waitFor(() => {
      expect(mockVacateChampionship).toHaveBeenCalledWith('c1');
    });

    await waitFor(() => {
      expect(screen.getByText('Championship vacated successfully!')).toBeInTheDocument();
    });
  });

  it('leaves hidden players out of Assign Champion, except the current champion', async () => {
    setupDefaultMocks();
    mockGetAllPlayers.mockResolvedValue([
      ...mockPlayers,
      { playerId: 'p3', name: 'Reigning Ghost', currentWrestler: 'Needs Wrestler', wins: 0, losses: 0, draws: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
      { playerId: 'p4', name: 'Other Ghost', currentWrestler: '', wins: 0, losses: 0, draws: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    ]);
    mockGetAllChampionships.mockResolvedValue([{ ...mockChampionships[0], currentChampion: 'p3' }]);

    renderManageChampionships();

    expect(await screen.findByText('Reigning Ghost')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Assign Champion' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('option', { name: 'Reigning Ghost' })).toBeInTheDocument();
    expect(within(dialog).getByRole('option', { name: 'The Rock' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('option', { name: 'Other Ghost' })).not.toBeInTheDocument();
  });

  it('shows current champion and division assignment on each card', async () => {
    setupDefaultMocks();

    renderManageChampionships();

    await screen.findByText('World Heavyweight Championship');

    // First row: champion + division
    expect(await screen.findByText('John Cena')).toBeInTheDocument();
    expect(screen.getByText('Raw')).toBeInTheDocument();

    // Second row: vacant + no division
    expect(screen.getByText('Vacant')).toBeInTheDocument();
    expect(screen.getByText('None')).toBeInTheDocument();

    // Active status badges
    const activeBadges = screen.getAllByText('Active');
    expect(activeBadges).toHaveLength(2);
  });
});
