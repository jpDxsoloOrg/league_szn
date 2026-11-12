import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ActivityFeedResponse, ActivityItem } from '../../types';

const { mockGetAll } = vi.hoisted(() => ({ mockGetAll: vi.fn() }));

vi.mock('../../services/api', () => ({ activityApi: { getAll: mockGetAll } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import ActivityFeed from '../ActivityFeed';

function item(id: string, summary: string): ActivityItem {
  return { id, type: 'match_result', timestamp: '2026-11-01T10:00:00.000Z', summary, metadata: { eventId: 'e1' } } as ActivityItem;
}

function page(items: ActivityItem[], nextCursor: string | null = null): ActivityFeedResponse {
  return { items, nextCursor } as ActivityFeedResponse;
}

function renderFeed() {
  return render(
    <MemoryRouter>
      <ActivityFeed />
    </MemoryRouter>
  );
}

describe('ActivityFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue(page([item('1', 'Edge beat Sting')]));
  });

  it('lists activity with a link to the detail page', async () => {
    renderFeed();
    expect(await screen.findByRole('link', { name: /Edge beat Sting/ })).toHaveAttribute('href', '/events/e1');
  });

  it('renders a call-up consideration with a translated summary linking to the profile', async () => {
    mockGetAll.mockResolvedValue(page([{
      id: 'callup-p1-t1',
      type: 'callup_consideration',
      timestamp: '2026-11-01T10:00:00.000Z',
      summary: 'Edge is being considered for a call-up',
      metadata: { playerId: 'p1', trackId: 't1', playerName: 'Edge' },
    }]));
    renderFeed();
    expect(await screen.findByRole('link', { name: /activity\.summaries\.callup_consideration/ }))
      .toHaveAttribute('href', '/player/p1');
  });

  it('links a call-up to the player profile and filters call-ups by the callup param', async () => {
    mockGetAll.mockResolvedValue(page([{
      id: 'callup-e1', type: 'callup_executed', timestamp: '2026-11-01T10:00:00.000Z',
      summary: 'Kenta was called up to Raw', metadata: { playerId: 'p1' },
    }]));
    renderFeed();
    expect(await screen.findByRole('link', { name: /Kenta was called up to Raw/ })).toHaveAttribute('href', '/player/p1');

    await userEvent.click(screen.getByRole('tab', { name: 'activity.types.callup_executed' }));
    await waitFor(() => {
      expect(mockGetAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'callup' }),
        expect.any(AbortSignal),
      );
    });
  });

  it('shows the empty state', async () => {
    mockGetAll.mockResolvedValue(page([]));
    renderFeed();
    expect(await screen.findByText('activity.noActivity')).toBeInTheDocument();
  });

  it('filters by type through the API', async () => {
    renderFeed();
    await screen.findByText('Edge beat Sting');
    await userEvent.click(screen.getByRole('tab', { name: 'activity.types.promo_posted' }));
    await waitFor(() => {
      expect(mockGetAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'promo' }),
        expect.any(AbortSignal),
      );
    });
  });

  it('ignores a slow response for a filter that is no longer selected', async () => {
    let finishFirst: (value: ActivityFeedResponse) => void = () => undefined;
    mockGetAll.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }));
    mockGetAll.mockResolvedValueOnce(page([item('2', 'Promo posted')]));

    renderFeed();
    await userEvent.click(screen.getByRole('tab', { name: 'activity.types.promo_posted' }));
    await screen.findByText('Promo posted');

    finishFirst(page([item('1', 'Old filter result')]));
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expect(screen.queryByText('Old filter result')).not.toBeInTheDocument();
    expect(screen.getByText('Promo posted')).toBeInTheDocument();
  });

  it('appends the next page', async () => {
    mockGetAll.mockResolvedValueOnce(page([item('1', 'First')], 'cursor-1'));
    mockGetAll.mockResolvedValueOnce(page([item('2', 'Second')]));

    renderFeed();
    await userEvent.click(await screen.findByRole('button', { name: 'activity.loadMore' }));

    expect(await screen.findByText('Second')).toBeInTheDocument();
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'activity.loadMore' })).not.toBeInTheDocument();
  });

  it('keeps loaded items when the next page fails, and can try again', async () => {
    mockGetAll.mockResolvedValueOnce(page([item('1', 'First')], 'cursor-1'));
    mockGetAll.mockRejectedValueOnce(new Error('Network error'));

    renderFeed();
    await userEvent.click(await screen.findByRole('button', { name: 'activity.loadMore' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Network error');
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'activity.loadMore' })).toBeEnabled();
  });

  it('offers a retry when the first load fails', async () => {
    mockGetAll.mockRejectedValueOnce(new Error('Network error'));
    renderFeed();
    await userEvent.click(await screen.findByRole('button', { name: 'common.retry' }));
    expect(await screen.findByText('Edge beat Sting')).toBeInTheDocument();
  });
});
