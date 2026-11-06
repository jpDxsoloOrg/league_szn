import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockAnnouncementsApi } = vi.hoisted(() => ({
  mockAnnouncementsApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../services/api', () => ({
  announcementsApi: mockAnnouncementsApi,
  imagesApi: {},
}));

import ManageAnnouncements from '../ManageAnnouncements';

const announcement = {
  announcementId: 'a1',
  title: 'Show tonight',
  body: '<p>Tonight</p><img src="x" onerror="alert(1)"><iframe src="https://example.com"></iframe>',
  priority: 2,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('ManageAnnouncements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnnouncementsApi.getAll.mockResolvedValue([announcement]);
  });

  it('lists announcements', async () => {
    render(<ManageAnnouncements />);
    expect(await screen.findByText('Show tonight')).toBeInTheDocument();
  });

  it('sanitizes the body in the preview', async () => {
    const user = userEvent.setup();
    render(<ManageAnnouncements />);

    await screen.findByText('Show tonight');
    await user.click(screen.getByRole('button', { name: 'common.edit' }));
    await user.click(await screen.findByRole('button', { name: 'announcements.showPreview' }));

    const preview = document.querySelector('.announcement-preview');
    expect(preview).toHaveTextContent('Tonight');
    expect(preview?.querySelector('iframe')).toBeNull();
    expect(preview?.querySelector('img')?.hasAttribute('onerror')).toBe(false);
  });
});
