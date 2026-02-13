import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const {
  mockGetAllSeasons,
  mockCreateSeason,
  mockUpdateSeason,
  mockDeleteSeason,
} = vi.hoisted(() => ({
  mockGetAllSeasons: vi.fn(),
  mockCreateSeason: vi.fn(),
  mockUpdateSeason: vi.fn(),
  mockDeleteSeason: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  seasonsApi: {
    getAll: mockGetAllSeasons,
    create: mockCreateSeason,
    update: mockUpdateSeason,
    delete: mockDeleteSeason,
  },
}));

vi.mock('../ManageSeasons.css', () => ({}));

import ManageSeasons from '../ManageSeasons';

// --- Test data ---
const mockSeasons = [
  {
    seasonId: 's1',
    name: 'Season 1',
    startDate: '2025-01-01T00:00:00.000Z',
    endDate: '2025-05-31T00:00:00.000Z',
    status: 'completed' as const,
    createdAt: '2025-01-01',
    updatedAt: '2025-05-31',
  },
  {
    seasonId: 's2',
    name: 'Season 2',
    startDate: '2025-06-01T00:00:00.000Z',
    status: 'active' as const,
    createdAt: '2025-06-01',
    updatedAt: '2025-06-01',
  },
];

function renderManageSeasons() {
  return render(
    <BrowserRouter>
      <ManageSeasons />
    </BrowserRouter>
  );
}

describe('ManageSeasons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('renders season list with status badges and action buttons', async () => {
    mockGetAllSeasons.mockResolvedValue(mockSeasons);

    renderManageSeasons();

    await waitFor(() => {
      expect(screen.getByText('Manage Seasons')).toBeInTheDocument();
    });

    // Section header
    expect(screen.getByText('All Seasons')).toBeInTheDocument();

    // Season names (Season 2 appears in both banner <h3> and card <h4>)
    expect(screen.getByText('Season 1')).toBeInTheDocument();
    const season2Elements = screen.getAllByText('Season 2');
    expect(season2Elements.length).toBeGreaterThanOrEqual(1);

    // Status badges -- "Active" appears in the banner + card badge
    const activeBadges = screen.getAllByText('Active');
    expect(activeBadges.length).toBeGreaterThanOrEqual(1);

    const completedBadges = screen.getAllByText('Completed');
    expect(completedBadges.length).toBeGreaterThanOrEqual(1);

    // Active season banner
    expect(screen.getByText('Active Season')).toBeInTheDocument();

    // When there is an active season, "Create New Season" button should NOT appear
    expect(screen.queryByText('Create New Season')).not.toBeInTheDocument();

    // Delete buttons for each season
    const deleteButtons = screen.getAllByText('Delete');
    expect(deleteButtons.length).toBe(2);

    // End Season button for the active season (banner + card)
    const endButtons = screen.getAllByText('End Season');
    expect(endButtons.length).toBe(2); // banner + card
  });

  it('creates a new season via the form', async () => {
    // Start with no active season so "Create New Season" button appears
    const completedOnly = [mockSeasons[0]];
    mockGetAllSeasons.mockResolvedValue(completedOnly);
    mockCreateSeason.mockResolvedValue({
      seasonId: 's3',
      name: 'Season 3',
      startDate: '2025-09-01T00:00:00.000Z',
      status: 'active',
      createdAt: '2025-09-01',
      updatedAt: '2025-09-01',
    });

    renderManageSeasons();

    await waitFor(() => {
      expect(screen.getByText('Manage Seasons')).toBeInTheDocument();
    });

    // "Create New Season" button should appear when no active season
    const createButton = screen.getByText('Create New Season');
    expect(createButton).toBeInTheDocument();

    // Click to show form
    fireEvent.click(createButton);

    // Form fields appear
    expect(screen.getByLabelText('Season Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Start Date')).toBeInTheDocument();
    expect(screen.getByLabelText('End Date (Optional)')).toBeInTheDocument();

    // Fill form
    fireEvent.change(screen.getByLabelText('Season Name'), {
      target: { value: 'Season 3' },
    });
    fireEvent.change(screen.getByLabelText('Start Date'), {
      target: { value: '2025-09-01' },
    });

    // Submit
    fireEvent.click(screen.getByText('Create Season'));

    await waitFor(() => {
      expect(mockCreateSeason).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Season 3',
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Season created successfully!')).toBeInTheDocument();
    });
  });

  it('ends an active season by changing its status to completed', async () => {
    mockGetAllSeasons.mockResolvedValue(mockSeasons);
    mockUpdateSeason.mockResolvedValue({
      ...mockSeasons[1],
      status: 'completed',
    });

    renderManageSeasons();

    await waitFor(() => {
      expect(screen.getByText('Manage Seasons')).toBeInTheDocument();
    });

    // Click "End Season" in the active season banner
    const endButtons = screen.getAllByText('End Season');
    fireEvent.click(endButtons[0]);

    // Confirm dialog should have been shown
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining('end this season')
    );

    await waitFor(() => {
      expect(mockUpdateSeason).toHaveBeenCalledWith('s2', { status: 'completed' });
    });

    await waitFor(() => {
      expect(screen.getByText('Season ended successfully!')).toBeInTheDocument();
    });
  });

  it('deletes a season with confirmation and shows success message', async () => {
    mockGetAllSeasons.mockResolvedValue(mockSeasons);
    mockDeleteSeason.mockResolvedValue(undefined);

    renderManageSeasons();

    await waitFor(() => {
      expect(screen.getByText('Manage Seasons')).toBeInTheDocument();
    });

    // Click "Delete" for the first season (Season 1 - completed)
    const deleteButtons = screen.getAllByText('Delete');
    fireEvent.click(deleteButtons[0]);

    // Confirm dialog with season name
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining('Season 1')
    );

    await waitFor(() => {
      expect(mockDeleteSeason).toHaveBeenCalledWith('s1');
    });

    await waitFor(() => {
      expect(screen.getByText('Season deleted successfully!')).toBeInTheDocument();
    });
  });
});
