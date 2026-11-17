import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import i18n from '../../../i18n';
import type { DivisionHistoryEntry } from '../../../types/progression';

const { mockProgressionApi } = vi.hoisted(() => ({
  mockProgressionApi: { getDivisionHistory: vi.fn() },
}));

vi.mock('../../../services/api', () => ({
  progressionApi: mockProgressionApi,
}));

import DivisionHistory, { toDivisionStops } from '../DivisionHistory';

const move = (
  id: string,
  kind: DivisionHistoryEntry['kind'],
  from: [string, string | null],
  to: [string, string | null],
  movedAt: string,
): DivisionHistoryEntry => ({
  id,
  kind,
  fromDivisionId: from[0],
  fromDivisionName: from[1],
  toDivisionId: to[0],
  toDivisionName: to[1],
  movedAt,
});

const promoted: DivisionHistoryEntry[] = [
  move('e1', 'callup', ['d-yb', 'Young Boys'], ['d-nxt', 'NXT'], '2026-03-01T12:00:00.000Z'),
  move('e2', 'promotion', ['d-nxt', 'NXT'], ['d-raw', 'Raw'], '2026-09-15T12:00:00.000Z'),
];

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('toDivisionStops', () => {
  it('chains moves into a path starting at the first source', () => {
    expect(toDivisionStops(promoted).map((stop) => stop.divisionName)).toEqual(['Young Boys', 'NXT', 'Raw']);
  });

  it('adds the source as its own stop when a move does not continue the path', () => {
    const stops = toDivisionStops([
      ...promoted,
      move('r1', 'transfer', ['d-sd', 'SmackDown'], ['d-nxt', 'NXT'], '2026-10-01T12:00:00.000Z'),
    ]);
    expect(stops.map((stop) => stop.divisionName)).toEqual(['Young Boys', 'NXT', 'Raw', 'SmackDown', 'NXT']);
    expect(stops[3].kind).toBeUndefined();
  });
});

describe('DivisionHistory', () => {
  it('shows "Young Boys → NXT → Raw" with the date of each move', async () => {
    mockProgressionApi.getDivisionHistory.mockResolvedValue(promoted);

    render(<DivisionHistory playerId="p1" />);

    const section = await screen.findByTestId('division-history');
    expect(mockProgressionApi.getDivisionHistory).toHaveBeenCalledWith('p1', expect.any(AbortSignal));
    expect(within(section).getByRole('heading', { name: 'Division History' })).toBeInTheDocument();
    const stops = within(section).getAllByRole('listitem');
    expect(stops.map((stop) => stop.querySelector('.ui-badge')?.textContent)).toEqual(['Young Boys', 'NXT', 'Raw']);
    expect(stops[1]).toHaveTextContent('Called up');
    expect(stops[2]).toHaveTextContent('Promoted');
    expect(stops[2].querySelector('time')?.getAttribute('dateTime')).toBe('2026-09-15T12:00:00.000Z');
    expect(stops[0].querySelector('time')).toBeNull();
  });

  it('uses neutral wording for a relegation and names deleted divisions', async () => {
    mockProgressionApi.getDivisionHistory.mockResolvedValue([
      move('e1', 'relegation', ['d-raw', 'Raw'], ['d-gone', null], '2026-09-15T12:00:00.000Z'),
    ]);

    render(<DivisionHistory playerId="p1" />);

    const section = await screen.findByTestId('division-history');
    expect(section).toHaveTextContent('Moved');
    expect(section).toHaveTextContent('Former division');
    expect(section).not.toHaveTextContent(/relegat/i);
  });

  it('renders nothing without moves or when the request fails', async () => {
    mockProgressionApi.getDivisionHistory.mockResolvedValue([]);
    const { container, unmount } = render(<DivisionHistory playerId="p1" />);
    await waitFor(() => expect(mockProgressionApi.getDivisionHistory).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    unmount();

    mockProgressionApi.getDivisionHistory.mockRejectedValue(new Error('boom'));
    const failed = render(<DivisionHistory playerId="p2" />);
    await waitFor(() => expect(mockProgressionApi.getDivisionHistory).toHaveBeenCalledTimes(2));
    expect(failed.container).toBeEmptyDOMElement();
  });
});
