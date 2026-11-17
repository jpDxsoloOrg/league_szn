import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockAnnouncementsApi, mockTickerApi } = vi.hoisted(() => ({
  mockAnnouncementsApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  mockTickerApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../services/api', () => ({
  announcementsApi: mockAnnouncementsApi,
  tickerMessagesApi: mockTickerApi,
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
    mockTickerApi.getAll.mockResolvedValue([]);
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

  it('shows the pop-up flag and lets staff turn it on for an existing announcement', async () => {
    const user = userEvent.setup();
    mockAnnouncementsApi.update.mockResolvedValue({ ...announcement, showAsPopup: true });
    render(<ManageAnnouncements />);

    await screen.findByText('Show tonight');
    expect(screen.getByText('announcements.newsOnly')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'common.edit' }));
    const popup = await screen.findByRole('checkbox', { name: 'announcements.fields.showAsPopup' });
    expect(popup).not.toBeChecked();
    await user.click(popup);
    await user.click(screen.getByRole('button', { name: /announcements.update|Update Announcement/ }));

    expect(mockAnnouncementsApi.update).toHaveBeenCalledWith('a1', expect.objectContaining({ showAsPopup: true }));
  });

  it('marks pop-up announcements in the list', async () => {
    mockAnnouncementsApi.getAll.mockResolvedValue([{ ...announcement, showAsPopup: true }]);
    render(<ManageAnnouncements />);
    expect(await screen.findByText('announcements.popupOn')).toBeInTheDocument();
  });

  describe('Ticker section', () => {
    const liveMessage = {
      messageId: 't1',
      text: 'Draft night this Friday!',
      pinned: true,
      startsAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
      createdBy: 'gm',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    it('lists ticker messages with their status', async () => {
      mockTickerApi.getAll.mockResolvedValue([liveMessage]);
      render(<ManageAnnouncements />);

      expect(await screen.findByText(/Draft night this Friday!/)).toBeInTheDocument();
      expect(screen.getByText('announcements.ticker.status.live')).toBeInTheDocument();
      expect(screen.getByText('announcements.ticker.pinned')).toBeInTheDocument();
    });

    it('expires a live message now', async () => {
      const user = userEvent.setup();
      mockTickerApi.getAll.mockResolvedValue([liveMessage]);
      mockTickerApi.update.mockResolvedValue(liveMessage);
      render(<ManageAnnouncements />);

      await user.click(await screen.findByRole('button', { name: 'announcements.ticker.expireNow' }));

      expect(mockTickerApi.update).toHaveBeenCalledWith('t1', { expiresAt: expect.any(String) });
    });

    it('creates a message from the form', async () => {
      const user = userEvent.setup();
      mockTickerApi.create.mockResolvedValue(liveMessage);
      render(<ManageAnnouncements />);

      await screen.findByText('announcements.ticker.empty');
      await user.click(screen.getAllByRole('button', { name: 'announcements.ticker.create' })[0]);
      await user.type(await screen.findByLabelText('announcements.ticker.fields.text'), 'Draft night!');
      await user.type(screen.getByLabelText('announcements.ticker.fields.href'), '/events');
      const dialogButtons = screen.getAllByRole('button', { name: 'announcements.ticker.create' });
      await user.click(dialogButtons[dialogButtons.length - 1]);

      expect(mockTickerApi.create).toHaveBeenCalledWith(expect.objectContaining({
        text: 'Draft night!',
        href: '/events',
        pinned: false,
      }));
    });
  });
});
