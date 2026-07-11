import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- Hoisted mocks ---
const { mockWrestlersApi } = vi.hoisted(() => ({
  mockWrestlersApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    importBulk: vi.fn(),
    resetAssignments: vi.fn(),
  },
}));

vi.mock('../../../services/api', () => ({
  wrestlersApi: mockWrestlersApi,
}));

vi.mock('../ManageWrestlers.css', () => ({}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'admin.manageWrestlers.resetAll': 'Reset All Assignments',
        'admin.manageWrestlers.resetting': 'Resetting...',
        'admin.manageWrestlers.resetTitle':
          "Clear every player's assigned wrestlers and make all wrestlers available again",
        'admin.manageWrestlers.resetConfirm':
          "Reset ALL wrestler assignments? Every player's assigned wrestlers will be cleared and all wrestlers become available again. This cannot be undone.",
        'admin.manageWrestlers.resetSuccess':
          'Assignments reset: {{wrestlers}} wrestler(s) released across {{players}} player(s).',
        'admin.manageWrestlers.resetError': 'Failed to reset wrestler assignments',
        'admin.manageWrestlers.pagePrev': 'Previous',
        'admin.manageWrestlers.pageNext': 'Next',
        'admin.manageWrestlers.pageStatus': 'Page {{page}} of {{total}}',
      };
      let text = translations[key] ?? key;
      if (opts) {
        for (const [name, value] of Object.entries(opts)) {
          text = text.replace(`{{${name}}}`, String(value));
        }
      }
      return text;
    },
  }),
}));

import ManageWrestlers from '../ManageWrestlers';
import type { Wrestler } from '../../../types';

function makeWrestler(index: number, overrides: Partial<Wrestler> = {}): Wrestler {
  return {
    wrestlerId: `w-${index}`,
    promotion: 'WWE',
    name: `Wrestler ${index}`,
    overallCap: 80,
    isInUse: false,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    ...overrides,
  };
}

describe('ManageWrestlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  describe('pagination', () => {
    it('shows only the first page of 25 and a pager when the list is larger', async () => {
      const wrestlers = Array.from({ length: 30 }, (_, i) => makeWrestler(i + 1));
      mockWrestlersApi.getAll.mockResolvedValue(wrestlers);

      render(<ManageWrestlers />);

      await waitFor(() => {
        expect(screen.getByText('All Wrestlers (30)')).toBeInTheDocument();
      });

      expect(screen.getByText('Wrestler 1')).toBeInTheDocument();
      expect(screen.getByText('Wrestler 25')).toBeInTheDocument();
      expect(screen.queryByText('Wrestler 26')).not.toBeInTheDocument();
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    });

    it('moves between pages with Next and Previous', async () => {
      const wrestlers = Array.from({ length: 30 }, (_, i) => makeWrestler(i + 1));
      mockWrestlersApi.getAll.mockResolvedValue(wrestlers);
      const user = userEvent.setup();

      render(<ManageWrestlers />);
      await waitFor(() => {
        expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Next' }));

      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
      expect(screen.getByText('Wrestler 26')).toBeInTheDocument();
      expect(screen.queryByText('Wrestler 25')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

      await user.click(screen.getByRole('button', { name: 'Previous' }));
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
      expect(screen.getByText('Wrestler 1')).toBeInTheDocument();
    });

    it('resets to page 1 when a filter changes', async () => {
      const wrestlers = [
        ...Array.from({ length: 30 }, (_, i) => makeWrestler(i + 1)),
        makeWrestler(31, { promotion: 'AEW', name: 'AEW Star' }),
      ];
      mockWrestlersApi.getAll.mockResolvedValue(wrestlers);
      const user = userEvent.setup();

      render(<ManageWrestlers />);
      await waitFor(() => {
        expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Next' }));
      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();

      await user.selectOptions(screen.getByLabelText('Filter by Promotion'), 'AEW');

      // Single page of AEW results, so the pager disappears and page 1 renders.
      expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
      expect(screen.getByText('AEW Star')).toBeInTheDocument();
    });

    it('hides the pager when everything fits on one page', async () => {
      mockWrestlersApi.getAll.mockResolvedValue([makeWrestler(1), makeWrestler(2)]);

      render(<ManageWrestlers />);
      await waitFor(() => {
        expect(screen.getByText('All Wrestlers (2)')).toBeInTheDocument();
      });

      expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
    });
  });

  describe('reset all assignments', () => {
    it('confirms, calls the API, refetches, and shows the result counts', async () => {
      const assigned = makeWrestler(1, {
        isInUse: true,
        assignedPlayerId: 'p-1',
        assignedSlot: 'primary',
      });
      mockWrestlersApi.getAll
        .mockResolvedValueOnce([assigned])
        .mockResolvedValueOnce([makeWrestler(1)]);
      mockWrestlersApi.resetAssignments.mockResolvedValue({
        clearedWrestlers: 1,
        clearedPlayers: 1,
      });
      const user = userEvent.setup();

      render(<ManageWrestlers />);
      await waitFor(() => {
        expect(screen.getByText('All Wrestlers (1)')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Reset All Assignments' }));

      expect(window.confirm).toHaveBeenCalledWith(
        expect.stringContaining('Reset ALL wrestler assignments?'),
      );
      await waitFor(() => {
        expect(
          screen.getByText(
            'Assignments reset: 1 wrestler(s) released across 1 player(s).',
          ),
        ).toBeInTheDocument();
      });
      expect(mockWrestlersApi.resetAssignments).toHaveBeenCalledTimes(1);
      expect(mockWrestlersApi.getAll).toHaveBeenCalledTimes(2);
    });

    it('does nothing when the confirmation is dismissed', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      mockWrestlersApi.getAll.mockResolvedValue([makeWrestler(1)]);
      const user = userEvent.setup();

      render(<ManageWrestlers />);
      await waitFor(() => {
        expect(screen.getByText('All Wrestlers (1)')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Reset All Assignments' }));

      expect(mockWrestlersApi.resetAssignments).not.toHaveBeenCalled();
    });

    it('surfaces an error message when the reset fails', async () => {
      mockWrestlersApi.getAll.mockResolvedValue([makeWrestler(1)]);
      mockWrestlersApi.resetAssignments.mockRejectedValue(
        new Error('Failed to reset wrestler assignments'),
      );
      const user = userEvent.setup();

      render(<ManageWrestlers />);
      await waitFor(() => {
        expect(screen.getByText('All Wrestlers (1)')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Reset All Assignments' }));

      await waitFor(() => {
        expect(
          screen.getByText('Failed to reset wrestler assignments'),
        ).toBeInTheDocument();
      });
    });
  });
});
