import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import i18n from '../../../i18n';
import type { Division, Season } from '../../../types';
import type {
  ProgressionConsiderationEntry,
  ProgressionTrack,
  SeasonMovementReviewView,
  SeasonReviewApplyResponse,
  SeasonReviewDecisionInput,
} from '../../../types/progression';
import { ToastContext } from '../../ui/toastContext';

const { mockProgressionApi, mockSeasonsApi } = vi.hoisted(() => ({
  mockProgressionApi: {
    getSeasonReviews: vi.fn(),
    applySeasonReviews: vi.fn(),
    getConsiderations: vi.fn(),
    getBoard: vi.fn(),
  },
  mockSeasonsApi: { getAll: vi.fn() },
}));

vi.mock('../../../services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/api')>()),
  progressionApi: mockProgressionApi,
  seasonsApi: mockSeasonsApi,
}));

import SeasonReview from '../progression/SeasonReview';
import MovementBoard from '../progression/MovementBoard';
import { countFlagged } from '../progression/movementCounts';
import { buildDecisions, initialDraft } from '../progression/seasonReviewModel';

// Raw and SmackDown share tier 1, so a promotion out of NXT (tier 2) is ambiguous.
const divisions: Division[] = [
  { divisionId: 'raw', name: 'Raw', tier: 1, createdAt: '', updatedAt: '' },
  { divisionId: 'sd', name: 'SmackDown', tier: 1, createdAt: '', updatedAt: '' },
  { divisionId: 'nxt', name: 'NXT', tier: 2, createdAt: '', updatedAt: '' },
];

const seasons: Season[] = [
  { seasonId: 's2', name: 'Season 2', startDate: '2026-10-01', status: 'active', createdAt: '', updatedAt: '' },
  { seasonId: 's1', name: 'Season 1', startDate: '2026-07-01', endDate: '2026-09-30', status: 'completed', createdAt: '', updatedAt: '' },
];

function review(overrides: Partial<SeasonMovementReviewView> & Pick<SeasonMovementReviewView, 'playerId' | 'playerName' | 'divisionId'>): SeasonMovementReviewView {
  return {
    seasonId: 's1',
    promotionPct: 0,
    relegationPct: 0,
    flagged: false,
    recommendation: 'stay',
    createdAt: '2026-09-30T00:00:00.000Z',
    targets: {},
    ...overrides,
  };
}

const ambiguous = { ok: false as const, code: 'AMBIGUOUS_TARGET', message: 'Several divisions qualify' };

const reviews: SeasonMovementReviewView[] = [
  review({
    playerId: 'p-ace', playerName: 'Ace', divisionId: 'nxt', seasonRank: 1, promotionPct: 100,
    promotionTrackId: 'promo-nxt', recommendation: 'promote', flagged: true,
    targets: { promote: ambiguous },
  }),
  review({
    playerId: 'p-bea', playerName: 'Bea', divisionId: 'sd', seasonRank: 8, relegationPct: 100,
    relegationTrackId: 'rel-sd', recommendation: 'relegate',
    targets: { promote: { ok: false, code: 'NO_DIVISION_ABOVE', message: 'Top tier' }, relegate: { ok: true, toDivisionId: 'nxt' } },
  }),
  review({
    playerId: 'p-cal', playerName: 'Cal', divisionId: 'nxt', seasonRank: 4, promotionTrackId: 'promo-nxt',
    targets: { promote: ambiguous },
  }),
  review({
    playerId: 'p-dee', playerName: 'Dee', divisionId: 'sd', seasonRank: 9, relegationPct: 90,
    relegationTrackId: 'rel-sd', recommendation: 'relegate',
    targets: { relegate: { ok: true, toDivisionId: 'nxt' } },
  }),
];

function moveResult(playerId: string, toDivisionId: string, fromDivisionId: string) {
  return {
    playerId,
    trackId: 't',
    kind: 'promotion' as const,
    fromDivisionId,
    toDivisionId,
    divisionJoinedAt: '2026-11-17T00:00:00.000Z',
    event: {
      eventId: `e-${playerId}`, playerId, trackId: 't', kind: 'promotion' as const, type: 'executed' as const,
      fromDivisionId, toDivisionId, actorUserId: 'gm', createdAt: '2026-11-17T00:00:00.000Z',
    },
  };
}

const showToast = vi.fn();

function renderWithToast(ui: ReactElement) {
  return render(<ToastContext.Provider value={{ showToast }}>{ui}</ToastContext.Provider>);
}

async function renderReview(rows: SeasonMovementReviewView[] = reviews) {
  mockProgressionApi.getSeasonReviews.mockResolvedValue({ seasonId: 's1', seasonStatus: 'completed', reviews: rows });
  renderWithToast(<SeasonReview divisions={divisions} />);
  await screen.findByRole('table');
}

const rowOf = (name: string) => {
  const select = screen.getByLabelText(`Decision for ${name}`);
  const row = select.closest('tr');
  if (!row) throw new Error(`No row for ${name}`);
  return row;
};

async function confirmDialog(user: ReturnType<typeof userEvent.setup>, button: string) {
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: button }));
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  vi.clearAllMocks();
  mockSeasonsApi.getAll.mockResolvedValue(seasons);
});

describe('seasonReviewModel', () => {
  it('starts each row on the recommendation unless it is impossible', () => {
    expect(initialDraft(reviews[0]).decision).toBe('promote');
    const stuck = review({ playerId: 'x', playerName: 'X', divisionId: 'raw', recommendation: 'promote' });
    expect(initialDraft(stuck).decision).toBe('');
  });

  it('lists moves that still need a target and skips an unchanged stay', () => {
    const drafts = {
      'p-ace': { decision: 'promote' as const, toDivisionId: '', announce: false },
      'p-cal': { decision: 'stay' as const, toDivisionId: '', announce: false },
    };
    const decided = [reviews[0], { ...reviews[2], decision: 'stay' as const }];
    expect(buildDecisions(decided, drafts, divisions)).toEqual({ decisions: [], missingTarget: ['p-ace'] });
  });
});

describe('SeasonReview', () => {
  it('opens on the latest completed season and lists every player with the recommendation', async () => {
    await renderReview();

    expect(mockProgressionApi.getSeasonReviews).toHaveBeenCalledWith('s1', expect.any(AbortSignal));
    expect(within(rowOf('Ace')).getByText('Under consideration')).toBeInTheDocument();
    expect(screen.getByLabelText('Decision for Ace')).toHaveValue('promote');
    expect(screen.getByLabelText('Decision for Cal')).toHaveValue('stay');
    // Bea is in the top tier: promote is offered but disabled with the reason.
    const promote = within(screen.getByLabelText('Decision for Bea')).getByRole('option', { name: 'Promote (top tier)' });
    expect(promote).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Apply 4 decisions' })).toBeEnabled();
  });

  it('blocks the apply until an ambiguous move has a target', async () => {
    const user = userEvent.setup();
    await renderReview();

    await user.click(screen.getByRole('button', { name: 'Apply 4 decisions' }));

    expect(within(rowOf('Ace')).getByRole('alert')).toHaveTextContent('Pick a target division.');
    expect(screen.getByText('Pick a target division for 1 player before applying.')).toBeInTheDocument();
    expect(mockProgressionApi.applySeasonReviews).not.toHaveBeenCalled();
  });

  it('applies the decisions and shows a result per row, including a partial failure and a forced retry', async () => {
    const user = userEvent.setup();
    const partial: SeasonReviewApplyResponse = {
      seasonId: 's1',
      applied: 3,
      failed: 1,
      results: [
        { playerId: 'p-bea', decision: 'relegate', ok: true, move: moveResult('p-bea', 'nxt', 'sd') },
        {
          playerId: 'p-dee',
          decision: 'relegate',
          ok: false,
          refusal: {
            status: 409,
            message: 'Holds a division title',
            details: { code: 'HOLDS_DIVISION_TITLE', championships: [{ championshipId: 'c1', name: 'SmackDown Title' }] },
          },
        },
        { playerId: 'p-ace', decision: 'promote', ok: true, move: moveResult('p-ace', 'raw', 'nxt') },
        { playerId: 'p-cal', decision: 'stay', ok: true },
      ],
    };
    mockProgressionApi.applySeasonReviews.mockResolvedValueOnce(partial);
    await renderReview();

    await user.selectOptions(screen.getByLabelText('Target division for Ace'), 'raw');
    await user.click(within(rowOf('Bea')).getByLabelText('Announce'));
    await user.click(screen.getByRole('button', { name: 'Apply 4 decisions' }));
    await confirmDialog(user, 'Apply decisions');

    await waitFor(() => expect(mockProgressionApi.applySeasonReviews).toHaveBeenCalledTimes(1));
    const [seasonId, sent] = mockProgressionApi.applySeasonReviews.mock.calls[0] as [string, SeasonReviewDecisionInput[]];
    expect(seasonId).toBe('s1');
    expect(sent).toEqual(expect.arrayContaining([
      { playerId: 'p-ace', decision: 'promote', toDivisionId: 'raw', announce: false },
      { playerId: 'p-bea', decision: 'relegate', announce: true },
      { playerId: 'p-cal', decision: 'stay' },
      { playerId: 'p-dee', decision: 'relegate', announce: false },
    ]));
    expect(sent).toHaveLength(4);

    expect(await screen.findByText('Applied 3. 1 not applied; see the Result column.')).toBeInTheDocument();
    const aceRow = screen.getByText('Ace').closest('tr');
    expect(aceRow).not.toBeNull();
    expect(within(aceRow as HTMLElement).getByText('Moved to Raw')).toBeInTheDocument();
    expect(within(aceRow as HTMLElement).getByText('Promoted')).toBeInTheDocument();

    const deeRow = rowOf('Dee');
    expect(within(deeRow).getByText('Not applied')).toBeInTheDocument();
    expect(within(deeRow).getByText('Dee holds titles restricted to their current division:')).toBeInTheDocument();
    expect(within(deeRow).getByText('SmackDown Title')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply 1 decision' })).toBeEnabled();

    mockProgressionApi.applySeasonReviews.mockResolvedValueOnce({
      seasonId: 's1', applied: 1, failed: 0,
      results: [{ playerId: 'p-dee', decision: 'relegate', ok: true, move: moveResult('p-dee', 'nxt', 'sd') }],
    });
    await user.click(within(deeRow).getByRole('button', { name: 'Proceed anyway' }));
    await confirmDialog(user, 'Proceed anyway');

    await waitFor(() => expect(mockProgressionApi.applySeasonReviews).toHaveBeenCalledTimes(2));
    expect(mockProgressionApi.applySeasonReviews.mock.calls[1]).toEqual([
      's1',
      [{ playerId: 'p-dee', decision: 'relegate', announce: false, force: true }],
    ]);
    const deeAfter = screen.getByText('Dee').closest('tr') as HTMLElement;
    expect(await within(deeAfter).findByText('Applied')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply 0 decisions' })).toBeDisabled();
  });

  it('lets the GM pick from the candidates of an AMBIGUOUS_TARGET refusal', async () => {
    const user = userEvent.setup();
    const single = [reviews[1]];
    mockProgressionApi.applySeasonReviews.mockResolvedValueOnce({
      seasonId: 's1', applied: 0, failed: 1,
      results: [{
        playerId: 'p-bea',
        decision: 'relegate',
        ok: false,
        refusal: {
          status: 400,
          message: 'Several divisions qualify',
          details: { code: 'AMBIGUOUS_TARGET', candidates: [{ divisionId: 'nxt', name: 'NXT' }, { divisionId: 'nxt-uk', name: 'NXT UK' }] },
        },
      }],
    });
    await renderReview(single);

    await user.click(screen.getByRole('button', { name: 'Apply 1 decision' }));
    await confirmDialog(user, 'Apply decisions');

    const target = await screen.findByLabelText('Target division for Bea');
    expect(within(target).getByRole('option', { name: 'NXT UK' })).toBeInTheDocument();
    expect(within(rowOf('Bea')).getByText('Several divisions share the next tier. Pick a target and apply again.')).toBeInTheDocument();

    mockProgressionApi.applySeasonReviews.mockResolvedValueOnce({
      seasonId: 's1', applied: 1, failed: 0,
      results: [{ playerId: 'p-bea', decision: 'relegate', ok: true, move: moveResult('p-bea', 'nxt-uk', 'sd') }],
    });
    await user.selectOptions(target, 'nxt-uk');
    await user.click(screen.getByRole('button', { name: 'Apply 1 decision' }));
    await confirmDialog(user, 'Apply decisions');

    await waitFor(() => expect(mockProgressionApi.applySeasonReviews).toHaveBeenCalledTimes(2));
    expect(mockProgressionApi.applySeasonReviews.mock.calls[1]?.[1]).toEqual([
      { playerId: 'p-bea', decision: 'relegate', toDivisionId: 'nxt-uk', announce: false },
    ]);
  });

  it('splits a large review into batches of 50 and marks a failed batch per row', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 120 }, (_, index) => review({
      playerId: `p${index}`, playerName: `Player ${String(index).padStart(3, '0')}`, divisionId: 'nxt',
    }));
    mockProgressionApi.applySeasonReviews.mockImplementation(async (_seasonId: string, batch: SeasonReviewDecisionInput[]) => {
      if (batch[0]?.playerId === 'p100') throw new Error('Network down');
      return {
        seasonId: 's1', applied: batch.length, failed: 0,
        results: batch.map((decision) => ({ playerId: decision.playerId, decision: decision.decision, ok: true })),
      };
    });
    await renderReview(many);

    await user.click(screen.getByRole('button', { name: 'Apply 120 decisions' }));
    await confirmDialog(user, 'Apply decisions');

    await waitFor(() => expect(mockProgressionApi.applySeasonReviews).toHaveBeenCalledTimes(3));
    const sizes = mockProgressionApi.applySeasonReviews.mock.calls.map((call) => (call[1] as unknown[]).length);
    expect(sizes).toEqual([50, 50, 20]);
    expect(await screen.findByText('Applied 100. 20 not applied; see the Result column.')).toBeInTheDocument();
    expect(within(rowOf('Player 100')).getByText('The request failed. Try again.')).toBeInTheDocument();
  });

  it('explains an active season with no snapshot yet', async () => {
    mockSeasonsApi.getAll.mockResolvedValue([seasons[0]]);
    mockProgressionApi.getSeasonReviews.mockResolvedValue({ seasonId: 's2', seasonStatus: 'active', reviews: [] });
    renderWithToast(<SeasonReview divisions={divisions} />);

    expect(await screen.findByText('This season is still running. The review is taken when the season ends.')).toBeInTheDocument();
  });
});

describe('MovementBoard', () => {
  const track = (trackId: string, kind: ProgressionTrack['kind'], fromDivisionId: string): ProgressionTrack => ({
    trackId, kind, name: `${trackId} track`, fromDivisionId, goals: [], windowMode: 'season', isActive: true,
    createdAt: '', updatedAt: '',
  });
  const tracks = [
    track('promo-nxt', 'promotion', 'nxt'),
    track('rel-raw', 'relegation', 'raw'),
    track('promo-raw-old', 'callup', 'raw'),
  ];
  const flag = (playerId: string, trackId: string): ProgressionConsiderationEntry => ({
    playerId, name: playerId, wrestlerName: '', trackId, markedAt: '2026-11-01T00:00:00.000Z',
  });

  it('counts flagged players per source division and kind', () => {
    const counts = countFlagged(tracks, [flag('a', 'promo-nxt'), flag('b', 'promo-nxt'), flag('c', 'gone')], [flag('d', 'rel-raw')]);
    expect(counts.get('nxt')).toEqual({ promotion: 2, relegation: 0 });
    expect(counts.get('raw')).toEqual({ promotion: 0, relegation: 1 });
  });

  it('shows the overview and opens a division and kind from a count', async () => {
    const user = userEvent.setup();
    mockProgressionApi.getConsiderations.mockImplementation(async (kind: string) => (
      kind === 'promotion' ? [flag('a', 'promo-nxt'), flag('b', 'promo-nxt')] : [flag('d', 'rel-raw')]
    ));
    mockProgressionApi.getBoard.mockResolvedValue({ track: tracks[0], players: [] });
    renderWithToast(
      <MovementBoard tracks={tracks} divisions={divisions} onEditTrack={vi.fn()} onNewTrack={vi.fn()} />,
    );

    const nxtPromotion = await screen.findByRole('button', { name: 'Open promotion candidates in NXT (2 flagged)' });
    expect(nxtPromotion).toHaveTextContent('2');
    // Raw has no promotion track; SmackDown has no movement tracks at all.
    expect(screen.queryByText('SmackDown')).not.toBeInTheDocument();
    // Raw sorts first by tier and has only a relegation track, so that tab opens.
    expect(screen.getByRole('tab', { name: 'Relegation' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(mockProgressionApi.getBoard).toHaveBeenCalledWith('rel-raw', undefined, expect.any(AbortSignal)));

    await user.click(nxtPromotion);
    await waitFor(() => expect(mockProgressionApi.getBoard).toHaveBeenLastCalledWith('promo-nxt', undefined, expect.any(AbortSignal)));
    expect(screen.getByRole('tab', { name: 'Promotion' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('button', { name: 'Open relegation candidates in Raw (1 flagged)' }));
    await waitFor(() => expect(mockProgressionApi.getBoard).toHaveBeenLastCalledWith('rel-raw', undefined, expect.any(AbortSignal)));
    expect(screen.getByRole('tab', { name: 'Relegation' })).toHaveAttribute('aria-selected', 'true');
  });
});
