import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- Hoisted mocks ---
const { mockDivisionsApi, mockBuildsApi, mockPlayersApi } = vi.hoisted(() => ({
  mockDivisionsApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  mockBuildsApi: {
    getRules: vi.fn(),
    getPlayerBuild: vi.fn(),
  },
  mockPlayersApi: {
    getAll: vi.fn(),
  },
}));

vi.mock('../../../services/api', () => ({
  divisionsApi: mockDivisionsApi,
  buildsApi: mockBuildsApi,
  playersApi: mockPlayersApi,
}));

vi.mock('react-i18next', async () => (await import('./i18nMock')).i18nMock);

import ManageDivisions from '../ManageDivisions';
import type { Division } from '../../../types';

const mockDivisions: Division[] = [
  { divisionId: 'div-1', name: 'Raw', description: 'Monday Night Raw', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { divisionId: 'div-2', name: 'SmackDown', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

describe('ManageDivisions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDivisionsApi.getAll.mockResolvedValue(mockDivisions);
    // Budget UI is covered in its own block below; keep it out of these tests.
    mockBuildsApi.getRules.mockRejectedValue(new Error('offline'));
  });

  it('renders division list after loading', async () => {
    render(<ManageDivisions />);

    // Loading state (skeleton with status role)
    expect(screen.getByRole('status')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('All Divisions (2)')).toBeInTheDocument();
    });

    expect(screen.getByText('Raw')).toBeInTheDocument();
    expect(screen.getByText('Monday Night Raw')).toBeInTheDocument();
    expect(screen.getByText('SmackDown')).toBeInTheDocument();
  });

  it('creates a new division via the form', async () => {
    mockDivisionsApi.create.mockResolvedValue({
      divisionId: 'div-3', name: 'NXT', description: 'NXT Brand',
      createdAt: '2024-01-02', updatedAt: '2024-01-02',
    });
    const user = userEvent.setup();

    render(<ManageDivisions />);
    await waitFor(() => { expect(screen.getByText('Raw')).toBeInTheDocument(); });

    // Open create form
    await user.click(screen.getByRole('button', { name: 'Create Division' }));
    expect(screen.getByText('Create New Division')).toBeInTheDocument();

    // Fill form
    await user.type(screen.getByLabelText('Division Name'), 'NXT');
    await user.type(screen.getByLabelText('Description (Optional)'), 'NXT Brand');

    // Submit
    await user.click(screen.getByRole('button', { name: 'Create Division' }));

    await waitFor(() => {
      expect(mockDivisionsApi.create).toHaveBeenCalledWith({
        name: 'NXT',
        description: 'NXT Brand',
        isDevelopmental: false,
        isDefaultForNewWrestlers: false,
      });
    });
    await waitFor(() => {
      expect(screen.getByText('Division created successfully!')).toBeInTheDocument();
    });
  });

  it('opens edit form with pre-populated data and saves changes', async () => {
    mockDivisionsApi.update.mockResolvedValue({
      ...mockDivisions[0], name: 'RAW Updated',
    });
    const user = userEvent.setup();

    render(<ManageDivisions />);
    await waitFor(() => { expect(screen.getByText('Raw')).toBeInTheDocument(); });

    // Click Edit on first division
    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    await user.click(editButtons[0]);

    expect(screen.getByText('Edit Division')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Raw')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Monday Night Raw')).toBeInTheDocument();

    // Modify name
    const nameInput = screen.getByLabelText('Division Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'RAW Updated');

    await user.click(screen.getByRole('button', { name: 'Update Division' }));

    await waitFor(() => {
      expect(mockDivisionsApi.update).toHaveBeenCalledWith('div-1', {
        name: 'RAW Updated',
        description: 'Monday Night Raw',
        isDevelopmental: false,
        isDefaultForNewWrestlers: false,
        tier: null,
        promotionZoneSize: null,
        relegationZoneSize: null,
      });
    });
    await waitFor(() => {
      expect(screen.getByText('Division updated successfully!')).toBeInTheDocument();
    });
  });

  it('deletes a division with confirmation dialog', async () => {
    mockDivisionsApi.delete.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<ManageDivisions />);
    await waitFor(() => { expect(screen.getByText('Raw')).toBeInTheDocument(); });

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    await user.click(deleteButtons[0]);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Are you sure you want to delete this division?');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(mockDivisionsApi.delete).toHaveBeenCalledWith('div-1');
    });
    await waitFor(() => {
      expect(screen.getByText('Division deleted successfully!')).toBeInTheDocument();
    });
  });

  it('shows error when delete fails (e.g., players assigned)', async () => {
    mockDivisionsApi.delete.mockRejectedValue(
      new Error('Cannot delete division with assigned players')
    );
    const user = userEvent.setup();

    render(<ManageDivisions />);
    await waitFor(() => { expect(screen.getByText('Raw')).toBeInTheDocument(); });

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    await user.click(deleteButtons[0]);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(screen.getByText('Cannot delete division with assigned players')).toBeInTheDocument();
    });
  });

  it('shows Developmental and Default badges in the list', async () => {
    mockDivisionsApi.getAll.mockResolvedValue([
      ...mockDivisions,
      {
        divisionId: 'div-yb', name: 'Young Boys', isDevelopmental: true, isDefaultForNewWrestlers: true,
        createdAt: '2024-01-01', updatedAt: '2024-01-01',
      },
    ]);

    render(<ManageDivisions />);
    await waitFor(() => { expect(screen.getByText('Young Boys')).toBeInTheDocument(); });

    expect(screen.getAllByText('Developmental')).toHaveLength(1);
    expect(screen.getAllByText('Default')).toHaveLength(1);
  });

  it('pre-fills the flags when editing and sends toggled values', async () => {
    mockDivisionsApi.getAll.mockResolvedValue([
      {
        divisionId: 'div-yb', name: 'Young Boys', isDevelopmental: true,
        createdAt: '2024-01-01', updatedAt: '2024-01-01',
      },
    ]);
    mockDivisionsApi.update.mockResolvedValue({});
    const user = userEvent.setup();

    render(<ManageDivisions />);
    await waitFor(() => { expect(screen.getByText('Young Boys')).toBeInTheDocument(); });
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const developmental = screen.getByLabelText('Developmental division');
    const defaultToggle = screen.getByLabelText('Default for new wrestlers');
    expect(developmental).toBeChecked();
    expect(defaultToggle).not.toBeChecked();

    await user.click(defaultToggle);
    await user.click(screen.getByRole('button', { name: 'Update Division' }));

    await waitFor(() => {
      expect(mockDivisionsApi.update).toHaveBeenCalledWith('div-yb', {
        name: 'Young Boys',
        description: undefined,
        isDevelopmental: true,
        isDefaultForNewWrestlers: true,
        tier: null,
        promotionZoneSize: null,
        relegationZoneSize: null,
      });
    });
  });

  it('shows a tier badge and sends the tier entered in the form', async () => {
    mockDivisionsApi.getAll.mockResolvedValue([
      { ...mockDivisions[0], tier: 1 },
      mockDivisions[1],
    ]);
    mockDivisionsApi.update.mockResolvedValue({});
    const user = userEvent.setup();

    render(<ManageDivisions />);
    await waitFor(() => { expect(screen.getByText('Tier 1')).toBeInTheDocument(); });

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[1]);
    const tierInput = screen.getByLabelText('Tier (Optional)');
    expect(tierInput).toHaveValue(null);
    await user.type(tierInput, '2');
    await user.click(screen.getByRole('button', { name: 'Update Division' }));

    await waitFor(() => {
      expect(mockDivisionsApi.update).toHaveBeenCalledWith('div-2', expect.objectContaining({ tier: 2 }));
    });
  });

  it('rejects a tier outside the allowed range without calling the API', async () => {
    const user = userEvent.setup();

    render(<ManageDivisions />);
    await waitFor(() => { expect(screen.getByText('Raw')).toBeInTheDocument(); });

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    await user.type(screen.getByLabelText('Tier (Optional)'), '0');
    // Submit the form directly: the input's native min would otherwise block it.
    fireEvent.submit(screen.getByLabelText('Tier (Optional)').closest('form') as HTMLFormElement);

    expect(await screen.findByText('Tier must be a whole number from 1 to 99, or empty.')).toBeInTheDocument();
    expect(mockDivisionsApi.update).not.toHaveBeenCalled();
  });

  it('loads and sends the zone sizes', async () => {
    mockDivisionsApi.getAll.mockResolvedValue([
      { ...mockDivisions[0], promotionZoneSize: 3 },
      mockDivisions[1],
    ]);
    mockDivisionsApi.update.mockResolvedValue({});
    const user = userEvent.setup();

    render(<ManageDivisions />);
    await waitFor(() => { expect(screen.getByText('Raw')).toBeInTheDocument(); });

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    expect(screen.getByLabelText('Promotion zone size')).toHaveValue(3);
    await user.type(screen.getByLabelText('Relegation zone size'), '0');
    await user.click(screen.getByRole('button', { name: 'Update Division' }));

    await waitFor(() => {
      expect(mockDivisionsApi.update).toHaveBeenCalledWith(
        'div-1',
        expect.objectContaining({ promotionZoneSize: 3, relegationZoneSize: 0 }),
      );
    });
  });

  it('rejects a zone size outside the allowed range without calling the API', async () => {
    const user = userEvent.setup();

    render(<ManageDivisions />);
    await waitFor(() => { expect(screen.getByText('Raw')).toBeInTheDocument(); });

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    await user.type(screen.getByLabelText('Promotion zone size'), '21');
    fireEvent.submit(screen.getByLabelText('Promotion zone size').closest('form') as HTMLFormElement);

    expect(await screen.findByText('Zone sizes must be whole numbers from 0 to 20.')).toBeInTheDocument();
    expect(mockDivisionsApi.update).not.toHaveBeenCalled();
  });
});

// BLD-11: build budget per tier
describe('ManageDivisions build budgets', () => {
  const tieredDivisions: Division[] = [
    { divisionId: 'div-top', name: 'Main Event', tier: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { divisionId: 'div-mid', name: 'Midcard', tier: 2, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { divisionId: 'div-dev', name: 'Young Boys', tier: 1, isDevelopmental: true, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { divisionId: 'div-none', name: 'Untiered', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  ];

  const rules = {
    budgets: { tiers: { '1': 160, '2': 130 }, defaultTier: 100, developmental: 80, noDivision: 80 },
  };

  function buildWithCost(cost: number) {
    return { budget: { cost, budget: 160, remaining: 160 - cost, overBudget: cost > 160 } };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockDivisionsApi.getAll.mockResolvedValue(tieredDivisions);
    mockBuildsApi.getRules.mockResolvedValue(rules);
    mockPlayersApi.getAll.mockResolvedValue([
      { playerId: 'p1', name: 'Ace', divisionId: 'div-top' },
      { playerId: 'p2', name: 'Bolt', divisionId: 'div-top' },
      { playerId: 'p3', name: 'Cruz', divisionId: 'div-top' },
      { playerId: 'p4', name: 'Dee', divisionId: 'div-mid' },
    ]);
    const costs: Record<string, number> = { p1: 150, p2: 120, p3: 140, p4: 125 };
    mockBuildsApi.getPlayerBuild.mockImplementation(async (playerId: string) => buildWithCost(costs[playerId]));
  });

  function rowFor(name: string): HTMLElement {
    return screen.getByText(name).closest('tr') as HTMLElement;
  }

  it('shows each division\'s budget in the list, with the developmental budget for developmental divisions', async () => {
    render(<ManageDivisions />);

    expect(await screen.findByRole('columnheader', { name: /Build budget/ })).toBeInTheDocument();
    expect(within(rowFor('Main Event')).getByText('160')).toBeInTheDocument();
    expect(within(rowFor('Midcard')).getByText('130')).toBeInTheDocument();
    expect(within(rowFor('Young Boys')).getByText('80')).toBeInTheDocument();
    expect(within(rowFor('Untiered')).getByText('100')).toBeInTheDocument();
  });

  it('hides the budget column when the rules can\'t be loaded', async () => {
    mockBuildsApi.getRules.mockRejectedValue(new Error('offline'));
    render(<ManageDivisions />);

    await waitFor(() => { expect(screen.getByText('Main Event')).toBeInTheDocument(); });
    expect(screen.queryByRole('columnheader', { name: /Build budget/ })).not.toBeInTheDocument();
  });

  it('shows the budget for the tier being entered, and the developmental budget when ticked', async () => {
    const user = userEvent.setup();
    render(<ManageDivisions />);
    await screen.findByRole('columnheader', { name: /Build budget/ });

    await user.click(screen.getByRole('button', { name: 'Create Division' }));
    // No tier yet: the default budget.
    expect(screen.getByText('Build budget: 100 points')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Tier (Optional)'), '2');
    expect(screen.getByText('Build budget: 130 points')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Developmental division'));
    expect(screen.getByText('Build budget: 80 points')).toBeInTheDocument();
  });

  it('warns how many current members a tier change puts over budget', async () => {
    const user = userEvent.setup();
    render(<ManageDivisions />);
    await screen.findByRole('columnheader', { name: /Build budget/ });

    await user.click(within(rowFor('Main Event')).getByRole('button', { name: 'Edit' }));
    expect(screen.getByText('Build budget: 160 points')).toBeInTheDocument();
    await waitFor(() => { expect(mockBuildsApi.getPlayerBuild).toHaveBeenCalledTimes(3); });
    expect(mockBuildsApi.getPlayerBuild).not.toHaveBeenCalledWith('p4');
    // Unchanged tier: no warning.
    expect(screen.queryByText(/over budget/)).not.toBeInTheDocument();

    const tierInput = screen.getByLabelText('Tier (Optional)');
    await user.clear(tierInput);
    await user.type(tierInput, '2');
    // 150 and 140 are over 130; 120 is not.
    expect(await screen.findByText('2 wrestlers will be over budget')).toBeInTheDocument();

    await user.clear(tierInput);
    await user.type(tierInput, '1');
    expect(screen.queryByText(/over budget/)).not.toBeInTheDocument();
  });

  it('leaves out members whose build can\'t be read', async () => {
    mockBuildsApi.getPlayerBuild.mockImplementation(async (playerId: string) => {
      if (playerId === 'p1') throw new Error('Not found');
      return buildWithCost(150);
    });
    const user = userEvent.setup();
    render(<ManageDivisions />);
    await screen.findByRole('columnheader', { name: /Build budget/ });

    await user.click(within(rowFor('Main Event')).getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByLabelText('Developmental division'));

    expect(await screen.findByText('2 wrestlers will be over budget')).toBeInTheDocument();
  });
});
