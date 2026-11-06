import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Announcement } from '../../types';

const { mockGetActive, mockUseAuth, mockUseSiteConfig, mockSetOpen } = vi.hoisted(() => ({
  mockGetActive: vi.fn(),
  mockUseAuth: vi.fn(),
  mockUseSiteConfig: vi.fn(),
  mockSetOpen: vi.fn(),
}));

vi.mock('../../services/api', () => ({ announcementsApi: { getActive: mockGetActive } }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: mockUseAuth }));
vi.mock('../../contexts/SiteConfigContext', () => ({ useSiteConfig: mockUseSiteConfig }));
vi.mock('../../hooks/useAnnouncementOpen', () => ({ setAnnouncementOpen: mockSetOpen }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import AnnouncementModal from '../AnnouncementModal';

function announcement(id: string, overrides: Partial<Announcement> = {}): Announcement {
  return { announcementId: id, title: `Title ${id}`, body: `<p>Body ${id}</p>`, ...overrides } as Announcement;
}

describe('AnnouncementModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    mockUseSiteConfig.mockReturnValue({ features: { notifications: true }, isLoading: false });
    mockGetActive.mockResolvedValue([announcement('a')]);
  });

  it('shows an active announcement in a labelled dialog', async () => {
    render(<AnnouncementModal />);
    expect(await screen.findByRole('dialog', { name: 'Title a' })).toBeInTheDocument();
    expect(screen.getByText('Body a')).toBeInTheDocument();
    expect(mockSetOpen).toHaveBeenLastCalledWith(true);
  });

  it('removes active content from the body and keeps formatting and video', async () => {
    mockGetActive.mockResolvedValue([
      announcement('a', {
        body: '<p style="text-align: center;" onclick="run()">Safe</p><script>run()</script>'
          + '<iframe src="/x"></iframe><video controls><source src="/videos/a.mp4"></video>',
      }),
    ]);

    render(<AnnouncementModal />);

    const body = (await screen.findByText('Safe')).closest('.announcement-modal-body');
    expect(body?.querySelector('script, iframe')).toBeNull();
    expect(screen.getByText('Safe')).not.toHaveAttribute('onclick');
    expect(screen.getByText('Safe')).toHaveAttribute('style', 'text-align: center;');
    expect(body?.querySelector('video source')).toHaveAttribute('src', '/videos/a.mp4');
  });

  it('does not fetch or open when notifications are switched off', async () => {
    mockUseSiteConfig.mockReturnValue({ features: { notifications: false }, isLoading: false });
    render(<AnnouncementModal />);
    await waitFor(() => expect(mockSetOpen).toHaveBeenCalled());
    expect(mockGetActive).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('waits for the site config before fetching', () => {
    mockUseSiteConfig.mockReturnValue({ features: { notifications: true }, isLoading: true });
    render(<AnnouncementModal />);
    expect(mockGetActive).not.toHaveBeenCalled();
  });

  it('does not fetch for anonymous visitors', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    render(<AnnouncementModal />);
    expect(mockGetActive).not.toHaveBeenCalled();
  });

  it('skips announcements the user has dismissed, and remembers new dismissals', async () => {
    localStorage.setItem('dismissed_announcements', JSON.stringify(['a']));
    mockGetActive.mockResolvedValue([announcement('a'), announcement('b')]);

    render(<AnnouncementModal />);

    expect(await screen.findByRole('dialog', { name: 'Title b' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'announcements.dontShowAgain' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(JSON.parse(localStorage.getItem('dismissed_announcements') ?? '[]')).toEqual(['a', 'b']);
  });

  it('survives a corrupt dismissed list', async () => {
    localStorage.setItem('dismissed_announcements', '{"not":"a list"}');
    render(<AnnouncementModal />);
    expect(await screen.findByRole('dialog', { name: 'Title a' })).toBeInTheDocument();
  });

  it('steps through several announcements and closes after the last', async () => {
    mockGetActive.mockResolvedValue([announcement('a'), announcement('b')]);
    render(<AnnouncementModal />);

    await screen.findByRole('dialog', { name: 'Title a' });
    await userEvent.click(screen.getByRole('button', { name: 'common.next' }));
    expect(await screen.findByRole('dialog', { name: 'Title b' })).toBeInTheDocument();

    const footerClose = screen.getAllByRole('button', { name: 'common.close' }).at(-1);
    await userEvent.click(footerClose as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockSetOpen).toHaveBeenLastCalledWith(false);
  });

  it('closes on Escape without marking the announcement dismissed', async () => {
    render(<AnnouncementModal />);
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(localStorage.getItem('dismissed_announcements')).toBeNull();
  });
});
