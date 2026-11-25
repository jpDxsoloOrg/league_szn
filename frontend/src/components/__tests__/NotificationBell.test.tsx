import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { AppNotification } from '../../types';

const { mockFeatures, mockGetAll, mockGetUnreadCount, mockMarkRead } = vi.hoisted(() => ({
  mockFeatures: { notifications: true, transfers: false, economy: true, injuries: false },
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
  const { pathname, state } = useLocation();
  return (
    <>
      <output data-testid="path">{pathname}</output>
      <output data-testid="state">{JSON.stringify(state)}</output>
    </>
  );
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
    mockFeatures.injuries = false;
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

  // ECO-14
  it.each([
    ['gm_interference_requested', '/admin/gm-interference'],
    ['gm_interference_resolved', '/shop'],
  ] as const)('labels and links a %s notification by its type', async (type, path) => {
    await openWith(notification({ type }));

    expect(screen.getByText('notifications.typeGmInterference')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Something happened'));
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(path));
  });

  // INJ-11
  it('sends the staff injury notice to the Injury Report while injuries are on', async () => {
    mockFeatures.injuries = true;
    await openWith(notification({ type: 'injury_staff_notice', sourceType: 'injury' }));

    expect(screen.getByText('notifications.typeInjury')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Something happened'));
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/admin/injury-report'));
  });

  it('sends the staff injury notice home while injuries are off', async () => {
    await openWith(notification({ type: 'injury_staff_notice', sourceType: 'injury' }), '/events');

    await userEvent.click(screen.getByText('Something happened'));
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(/^\/$/));
  });

  // INJ-12
  it.each([
    ['injury_sustained', 'match'],
    ['injury_recovered', 'injury'],
    ['injury_healed', 'injury'],
    ['injury_updated', 'injury'],
    ['injury_added', 'injury'],
    ['stamina_adjusted', 'injury'],
  ] as const)('labels a %s notification as condition and opens the profile', async (type, sourceType) => {
    await openWith(notification({ type, sourceType }), '/events');

    expect(screen.getByText('notifications.typeInjury')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Something happened'));
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/profile'));
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

  // BLD-15
  it('opens the build editor on the profile for an over-budget build', async () => {
    await openWith(notification({ type: 'build_over_budget', sourceType: 'build' }), '/events');

    await userEvent.click(screen.getByText('Something happened'));
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/profile'));
    expect(JSON.parse(screen.getByTestId('state').textContent ?? 'null')).toEqual({ editBuild: true });
  });

  it('opens the profile without the editor for other build notifications', async () => {
    await openWith(notification({ sourceType: 'build' }), '/events');

    await userEvent.click(screen.getByText('Something happened'));
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/profile'));
    expect(screen.getByTestId('state')).toHaveTextContent('null');
  });
});

// ECO-13
describe('NotificationBell contract and money notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatures.economy = true;
    mockGetUnreadCount.mockResolvedValue({ count: 0 });
  });

  it.each([
    ['contract_offer', 'contract', 'notifications.typeContract', '/my-contract'],
    ['contract_offer_expired', 'contract', 'notifications.typeContract', '/my-contract'],
    ['contract_released', 'contract', 'notifications.typeContract', '/my-contract'],
    ['contract_completed', 'contract', 'notifications.typeContract', '/my-contract'],
    ['contract_offer_accepted', 'contract', 'notifications.typeContract', '/admin/contracts'],
    ['contract_offer_declined', 'contract', 'notifications.typeContract', '/admin/contracts'],
    ['fine_issued', 'economy', 'notifications.typeEconomy', '/my-contract'],
    ['fine_rescinded', 'economy', 'notifications.typeEconomy', '/my-contract'],
    ['balance_negative', 'economy', 'notifications.typeEconomy', '/my-contract'],
    ['no_show_marked', 'match', 'notifications.typeMatch', '/my-contract'],
    ['fine_issued', 'match', 'notifications.typeMatch', '/my-contract'],
  ] as const)('labels and links a %s (%s) notification', async (type, sourceType, label, path) => {
    await openWith(notification({ type, sourceType }), '/events');

    expect(screen.getByText(label)).toBeInTheDocument();
    await userEvent.click(screen.getByText('Something happened'));
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(path));
  });

  it('opens the wallet tab for a fine', async () => {
    mockGetAll.mockResolvedValue({ notifications: [notification({ type: 'fine_issued', sourceType: 'economy' })] });
    function CurrentSearch() {
      const { search } = useLocation();
      return <output data-testid="search">{search}</output>;
    }
    render(
      <MemoryRouter initialEntries={['/events']}>
        <NotificationBell />
        <CurrentSearch />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'notifications.bell' }));
    await userEvent.click(await screen.findByText('Something happened'));

    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('?tab=wallet'));
  });

  it('sends economy notifications home while the economy is off', async () => {
    mockFeatures.economy = false;
    await openWith(notification({ type: 'contract_offer', sourceType: 'contract' }), '/events');

    await userEvent.click(screen.getByText('Something happened'));
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(/^\/$/));
  });
});
