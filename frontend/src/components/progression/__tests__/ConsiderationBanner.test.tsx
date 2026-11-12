import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import i18n from '../../../i18n';
import type { ProgressionConsiderationEntry } from '../../../types/progression';

const { mockProgressionApi } = vi.hoisted(() => ({
  mockProgressionApi: { getConsiderations: vi.fn() },
}));

vi.mock('../../../services/api', () => ({
  progressionApi: mockProgressionApi,
}));

import ConsiderationBanner from '../ConsiderationBanner';
import ConsiderationBadge from '../ConsiderationBadge';
import { resetConsiderationsCache } from '../../../hooks/useConsiderations';

const flagged: ProgressionConsiderationEntry = {
  playerId: 'p-flagged',
  name: 'Kenta',
  wrestlerName: 'Young Lion',
  trackId: 'track-yb',
  markedAt: '2026-11-10T00:00:00.000Z',
};

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  vi.clearAllMocks();
  resetConsiderationsCache();
  mockProgressionApi.getConsiderations.mockResolvedValue([flagged]);
});

describe('ConsiderationBanner', () => {
  it('celebrates a flagged player', async () => {
    render(<ConsiderationBanner playerId="p-flagged" />);

    const banner = await screen.findByTestId('consideration-banner');
    expect(banner).toHaveTextContent('Being considered for a call-up');
    expect(banner).toHaveClass('consideration-banner--callup');
    expect(mockProgressionApi.getConsiderations).toHaveBeenCalledWith('callup');
  });

  it('renders nothing for a player who is not flagged', async () => {
    const { container } = render(<ConsiderationBanner playerId="p-other" />);

    await waitFor(() => expect(mockProgressionApi.getConsiderations).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByTestId('consideration-banner')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the list fails to load', async () => {
    mockProgressionApi.getConsiderations.mockRejectedValue(new Error('offline'));
    const { container } = render(<ConsiderationBanner playerId="p-flagged" />);

    await waitFor(() => expect(mockProgressionApi.getConsiderations).toHaveBeenCalled());
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ConsiderationBadge', () => {
  it('shows the call-up watch pill for a flagged player only', async () => {
    render(
      <ul>
        <li><ConsiderationBadge playerId="p-flagged" /></li>
        <li><ConsiderationBadge playerId="p-other" /></li>
      </ul>,
    );

    const badges = await screen.findAllByTestId('consideration-badge');
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent('Call-up watch');
  });

  it('shares one request across every badge and banner on the page', async () => {
    const ids = ['p-flagged', 'p-2', 'p-3', 'p-4', 'p-5', 'p-6'];
    render(
      <>
        <ConsiderationBanner playerId="p-flagged" />
        {ids.map((id) => <ConsiderationBadge key={id} playerId={id} />)}
      </>,
    );

    await screen.findByTestId('consideration-banner');
    expect(screen.getAllByTestId('consideration-badge')).toHaveLength(1);
    expect(mockProgressionApi.getConsiderations).toHaveBeenCalledTimes(1);
  });
});
