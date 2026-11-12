import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- Hoisted mocks ---
const { mockDivisionsApi } = vi.hoisted(() => ({
  mockDivisionsApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../services/api', () => ({
  divisionsApi: mockDivisionsApi,
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
      });
    });
  });
});
