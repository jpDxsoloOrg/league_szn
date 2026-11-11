import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { AppNotification } from '../../types';

const { mockFeatures, mockGetAll, mockGetUnreadCount, mockMarkRead } = vi.hoisted(() => ({
  mockFeatures: { notifications: true, transfers: false },
  mockGetAll: vi.fn(),
  mockGetUnreadCount: vi.fn(),
  mockMarkRead: vi.fn(),
}));

vi.mock('../../services/api/notifications.api', () => ({
  notificationsApi: {
    getAll: mockGetAll,
    getUnreadCount: mockGetUnreadCount,
    markRead: mockMarkRead,
    delete: vi.fn(),
  },
}));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, playerId: 'p1' }),
}));
vi.mock('../../contexts/SiteConfigContext', () => ({
  useSiteConfig: () => ({ features: mockFeatures }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import NotificationBell from '../NotificationBell';

function notification(overrides: Partial<AppNotification>): AppNotification {
  return {
    notificationId: 'n1',
    userId: 'u1',
    type: 'announcement',
    message: 'Something happened',
    sourceId: 'source-1',
    sourceType: 'announcement',
    isRead: true,
    createdAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

function CurrentPath() {
  const { pathname } = useLocation();
  return <output data-testid="path">{pathname}</output>;
}

async function openWith(item: AppNotification, startPath = '/') {
  mockGetAll.mockResolvedValue({ notifications: [item] });
  render(
    <MemoryRouter initialEntries={[startPath]}>
      <NotificationBell />
      <CurrentPath />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'notifications.bell' }));
  await screen.findByText(item.message);
}

describe('NotificationBell source types', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatures.transfers = false;
    mockGetUnreadCount.mockResolvedValue({ count: 0 });
  });

  it.each([
    ['promo', 'notifications.typePromo', '/promos/source-1'],
    ['challenge', 'notifications.typeChallenge', '/challenges/source-1'],
    ['rivalry', 'notifications.typeRivalry', '/rivalries/source-1'],
    ['storyline_request', 'notifications.typeStoryline', '/profile'],
    ['discipline', 'notifications.typeDiscipline', '/profile'],
  ] as const)('labels and links a %s notification', async (sourceType, label, path) => {
    await openWith(notification({ sourceType }));

    expect(screen.getByText(label)).toBeInTheDocument();
    await userEvent.click(screen.getByText('Something happened'));
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(path));
  });

  it('sends a transfer notification home while transfers are off', async () => {
    await openWith(notification({ sourceType: 'transfer' }), '/events');

    await userEvent.click(screen.getByText('Something happened'));
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(/^\/$/));
  });

  it('sends a transfer notification to the profile while transfers are on', async () => {
    mockFeatures.transfers = true;
    await openWith(notification({ sourceType: 'transfer' }));

    await userEvent.click(screen.getByText('Something happened'));
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/profile'));
  });

  it('falls back to the feed when a promo notification has no source', async () => {
    await openWith(notification({ sourceType: 'promo', sourceId: '' }));

    await userEvent.click(screen.getByText('Something happened'));
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/promos'));
  });

  it('falls back to the list when a rivalry notification has no source', async () => {
    await openWith(notification({ sourceType: 'rivalry', sourceId: '' }));

    await userEvent.click(screen.getByText('Something happened'));
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/rivalries'));
  });
});
