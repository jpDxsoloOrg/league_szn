import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { mockShows, mockCompanies } = vi.hoisted(() => ({
  mockShows: vi.fn(),
  mockCompanies: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => (typeof fallback === 'string' ? fallback : key),
  }),
}));

vi.mock('../../../services/api', () => ({
  showsApi: { getAll: mockShows },
  companiesApi: { getAll: mockCompanies },
  imagesApi: {},
  isApiError: () => false,
}));

import ManageShows from '../ManageShows';

describe('ManageShows', () => {
  it('shows a PPV on its own calendar day, whatever the viewer timezone', async () => {
    mockCompanies.mockResolvedValue([{ companyId: 'c1', name: 'WWE' }]);
    // Saved from a date input, so this is midnight UTC: the evening before, west of UTC.
    mockShows.mockResolvedValue([
      { showId: 's1', name: 'WrestleMania', companyId: 'c1', schedule: 'ppv', ppvDate: '2026-12-27T00:00:00.000Z' },
    ]);

    render(<ManageShows />);

    expect(await screen.findByText('Dec 27, 2026')).toBeInTheDocument();
  });
});
