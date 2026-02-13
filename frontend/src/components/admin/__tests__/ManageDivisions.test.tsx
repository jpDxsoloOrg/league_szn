import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

vi.mock('../ManageDivisions.css', () => ({}));

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

    // Loading state
    expect(screen.getByText('Loading divisions...')).toBeInTheDocument();

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
      });
    });
    await waitFor(() => {
      expect(screen.getByText('Division updated successfully!')).toBeInTheDocument();
    });
  });

  it('deletes a division with confirmation dialog', async () => {
    mockDivisionsApi.delete.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    render(<ManageDivisions />);
    await waitFor(() => { expect(screen.getByText('Raw')).toBeInTheDocument(); });

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    await user.click(deleteButtons[0]);

    expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete this division?');
    await waitFor(() => {
      expect(mockDivisionsApi.delete).toHaveBeenCalledWith('div-1');
    });
    await waitFor(() => {
      expect(screen.getByText('Division deleted successfully!')).toBeInTheDocument();
    });
    confirmSpy.mockRestore();
  });

  it('shows error when delete fails (e.g., players assigned)', async () => {
    mockDivisionsApi.delete.mockRejectedValue(
      new Error('Cannot delete division with assigned players')
    );
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    render(<ManageDivisions />);
    await waitFor(() => { expect(screen.getByText('Raw')).toBeInTheDocument(); });

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    await user.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Cannot delete division with assigned players')).toBeInTheDocument();
    });
    confirmSpy.mockRestore();
  });
});
