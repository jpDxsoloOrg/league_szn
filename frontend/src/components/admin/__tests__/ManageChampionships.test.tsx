import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
    getAll: mockGetAllPlayers,
  },
  imagesApi: {
    generateUploadUrl: mockGenerateUploadUrl,
    uploadToS3: mockUploadToS3,
  },
}));

// Suppress CSS import
vi.mock('../ManageChampionships.css', () => ({}));

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
    // Default confirm to approve
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('renders championship list with champion names and division info', async () => {
    setupDefaultMocks();

    renderManageChampionships();

    await waitFor(() => {
      expect(screen.getByText('Manage Championships')).toBeInTheDocument();
    });

    // Championship names
    expect(screen.getByText('World Heavyweight Championship')).toBeInTheDocument();
    expect(screen.getByText('Tag Team Championship')).toBeInTheDocument();

    // Count header
    expect(screen.getByText('All Championships (2)')).toBeInTheDocument();

    // Champion resolved to player name
    expect(screen.getByText('Champion: John Cena')).toBeInTheDocument();
    // Vacant for title with no champion
    expect(screen.getByText('Champion: Vacant')).toBeInTheDocument();

    // Division resolved
    expect(screen.getByText('Division: Raw')).toBeInTheDocument();
    expect(screen.getByText('Division: None')).toBeInTheDocument();

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

    await waitFor(() => {
      expect(screen.getByText('Manage Championships')).toBeInTheDocument();
    });

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

    await waitFor(() => {
      expect(screen.getByText('Manage Championships')).toBeInTheDocument();
    });

    // Click the first Edit button (World Heavyweight Championship)
    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    // Form should appear with edit heading
    expect(screen.getByText('Edit Championship')).toBeInTheDocument();

    // Fields pre-populated
    const nameInput = screen.getByLabelText('Championship Name') as HTMLInputElement;
    expect(nameInput.value).toBe('World Heavyweight Championship');

    const typeSelect = screen.getByLabelText('Type') as HTMLSelectElement;
    expect(typeSelect.value).toBe('singles');

    const divisionSelect = screen.getByLabelText(/Division/) as HTMLSelectElement;
    expect(divisionSelect.value).toBe('d1');

    // Submit button shows "Update Championship"
    expect(screen.getByText('Update Championship')).toBeInTheDocument();
  });

  it('deletes championship with confirmation dialog', async () => {
    setupDefaultMocks();
    mockDeleteChampionship.mockResolvedValue(undefined);

    renderManageChampionships();

    await waitFor(() => {
      expect(screen.getByText('Manage Championships')).toBeInTheDocument();
    });

    // Click the first Delete button
    const deleteButtons = screen.getAllByText('Delete');
    fireEvent.click(deleteButtons[0]);

    // Confirm dialog should have been called
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining('World Heavyweight Championship')
    );

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

    await waitFor(() => {
      expect(screen.getByText('Manage Championships')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Create Championship'));

    // Image upload label and file input
    expect(screen.getByText('Championship Belt Image')).toBeInTheDocument();
    expect(screen.getByText('Click to upload image')).toBeInTheDocument();
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

    await waitFor(() => {
      expect(screen.getByText('Manage Championships')).toBeInTheDocument();
    });

    // Click Vacate button (only appears for championship with a champion)
    fireEvent.click(screen.getByText('Vacate'));

    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining('World Heavyweight Championship')
    );
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining('vacate')
    );

    await waitFor(() => {
      expect(mockVacateChampionship).toHaveBeenCalledWith('c1');
    });

    await waitFor(() => {
      expect(screen.getByText('Championship vacated successfully!')).toBeInTheDocument();
    });
  });

  it('shows current champion and division assignment on each card', async () => {
    setupDefaultMocks();

    renderManageChampionships();

    await waitFor(() => {
      expect(screen.getByText('Manage Championships')).toBeInTheDocument();
    });

    // First card: champion + division
    expect(screen.getByText('Champion: John Cena')).toBeInTheDocument();
    expect(screen.getByText('Division: Raw')).toBeInTheDocument();

    // Second card: vacant + no division
    expect(screen.getByText('Champion: Vacant')).toBeInTheDocument();
    expect(screen.getByText('Division: None')).toBeInTheDocument();

    // Active status badges
    const activeBadges = screen.getAllByText('Active');
    expect(activeBadges).toHaveLength(2);
  });
});
