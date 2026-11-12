import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import i18n from '../../../i18n';
import { ApiError } from '../../../services/api/apiClient';
import type { Division } from '../../../types';
import type { ProgressionBoardEntry, ProgressionTrack } from '../../../types/progression';
import { ToastContext } from '../../ui/toastContext';

const { mockProgressionApi, mockDivisionsApi } = vi.hoisted(() => ({
  mockProgressionApi: {
    getTracks: vi.fn(),
    createTrack: vi.fn(),
    updateTrack: vi.fn(),
    getBoard: vi.fn(),
    setConsideration: vi.fn(),
    execute: vi.fn(),
    recompute: vi.fn(),
  },
  mockDivisionsApi: { getAll: vi.fn() },
}));

vi.mock('../../../services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/api')>()),
  progressionApi: mockProgressionApi,
  divisionsApi: mockDivisionsApi,
}));

import ManageProgression from '../ManageProgression';
import TrackEditor from '../progression/TrackEditor';
import { emptyTrackDraft, validateTrackDraft } from '../progression/trackDraft';

const divisions: Division[] = [
  { divisionId: 'yb', name: 'Young Boys', isDevelopmental: true, createdAt: '', updatedAt: '' },
  { divisionId: 'nxt', name: 'NXT', isDevelopmental: true, createdAt: '', updatedAt: '' },
  { divisionId: 'raw', name: 'Raw', createdAt: '', updatedAt: '' },
];

const track: ProgressionTrack = {
  trackId: 't1',
  kind: 'callup',
  name: 'Young Boys Call-Up',
  fromDivisionId: 'yb',
  toDivisionId: 'raw',
  goals: [
    { goalId: 'g1', metric: 'matchesCompeted', threshold: 10, weight: 1 },
    { goalId: 'g2', metric: 'avgStarRating', threshold: 3, weight: 2, params: { minRatedMatches: 5 } },
  ],
  windowMode: 'sinceJoinedDivision',
  isActive: true,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

function entry(playerId: string, name: string, progressPct: number, met: [boolean, boolean]): ProgressionBoardEntry {
  return {
    playerId,
    name,
    wrestlerName: `${name} Wrestler`,
    progressPct,
    computedAt: '2026-11-10T00:00:00.000Z',
    goals: [
      { goalId: 'g1', metric: 'matchesCompeted', threshold: 10, weight: 1, direction: 'atLeast', current: met[0] ? 10 : 4, met: met[0] },
      { goalId: 'g2', metric: 'avgStarRating', threshold: 3, weight: 2, direction: 'atLeast', current: met[1] ? 3.5 : null, met: met[1] },
    ],
  };
}

// Deliberately out of order: the board sorts by progress.
const boardPlayers = [
  entry('p-low', 'Low Larry', 20, [false, false]),
  entry('p-high', 'High Hana', 90, [true, true]),
  entry('p-mid', 'Mid Mo', 55, [true, false]),
];

const showToast = vi.fn();

function renderWithToast(ui: ReactElement) {
  return render(<ToastContext.Provider value={{ showToast }}>{ui}</ToastContext.Provider>);
}

async function renderBoard() {
  renderWithToast(<ManageProgression />);
  return screen.findAllByTestId('candidate-row');
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  vi.clearAllMocks();
  mockProgressionApi.getTracks.mockResolvedValue([track]);
  mockDivisionsApi.getAll.mockResolvedValue(divisions);
  mockProgressionApi.getBoard.mockResolvedValue({ track, players: boardPlayers.map((player) => ({ ...player })) });
});

describe('validateTrackDraft', () => {
  it('flags a missing name, source division, bad numbers and a developmental call-up target', () => {
    const draft = emptyTrackDraft();
    draft.toDivisionId = 'nxt';
    draft.goals[0] = { ...draft.goals[0], threshold: '0', weight: '-1' };
    draft.goals.push({ key: 'stars', metric: 'avgStarRating', threshold: '3', weight: '1', direction: 'atLeast', param: '1.5' });

    const errors = validateTrackDraft(draft, divisions);

    expect(errors.name).toBe('progression.admin.editor.errors.nameRequired');
    expect(errors.fromDivisionId).toBe('progression.admin.editor.errors.fromRequired');
    expect(errors.toDivisionId).toBe('progression.admin.editor.errors.toDevelopmental');
    expect(errors.goalErrors[draft.goals[0].key]).toEqual({
      threshold: 'progression.admin.editor.errors.thresholdInvalid',
      weight: 'progression.admin.editor.errors.weightInvalid',
    });
    expect(errors.goalErrors.stars).toEqual({ param: 'progression.admin.editor.errors.paramInvalid' });
  });

  it('allows a developmental target for a relegation track', () => {
    const draft = { ...emptyTrackDraft(), kind: 'relegation' as const, name: 'Drop', fromDivisionId: 'raw', toDivisionId: 'nxt' };
    draft.goals[0] = { ...draft.goals[0], threshold: '2' };
    expect(validateTrackDraft(draft, divisions)).toEqual({ goalErrors: {} });
  });

  it('requires at least one goal', () => {
    const draft = { ...emptyTrackDraft(), name: 'X', fromDivisionId: 'yb', goals: [] };
    expect(validateTrackDraft(draft, divisions).goals).toBe('progression.admin.editor.errors.goalsRequired');
  });
});

describe('TrackEditor', () => {
  const renderEditor = (editing: ProgressionTrack | null = null) => {
    const onSaved = vi.fn();
    renderWithToast(
      <TrackEditor open track={editing} divisions={divisions} onClose={vi.fn()} onSaved={onSaved} />,
    );
    return { onSaved, dialog: screen.getByRole('dialog') };
  };

  it('shows inline errors and does not call the API when the form is invalid', async () => {
    const user = userEvent.setup();
    const { dialog } = renderEditor();

    await user.click(within(dialog).getByRole('button', { name: 'Create track' }));

    expect(within(dialog).getByText('Give the track a name.')).toBeInTheDocument();
    expect(within(dialog).getByText('Pick the division this track ranks.')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a threshold above 0.')).toBeInTheDocument();
    expect(mockProgressionApi.createTrack).not.toHaveBeenCalled();
  });

  it('disables developmental divisions in the call-up target picker', async () => {
    const user = userEvent.setup();
    const { dialog } = renderEditor();

    await user.click(within(dialog).getByLabelText('To division'));

    expect(screen.getByRole('option', { name: /NXT/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('option', { name: /Raw/ })).not.toHaveAttribute('aria-disabled');
  });

  it('shows the param field only for metrics that take one', async () => {
    const user = userEvent.setup();
    const { dialog } = renderEditor();

    expect(within(dialog).queryByLabelText('Minimum rated matches')).not.toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Metric'), 'avgStarRating');
    expect(within(dialog).getByLabelText('Minimum rated matches')).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Metric'), 'promosWithReactions');
    expect(within(dialog).getByLabelText('Minimum reactions per promo')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Minimum rated matches')).not.toBeInTheDocument();
  });

  it('sends the edited goals and shows a 409 inline', async () => {
    const user = userEvent.setup();
    mockProgressionApi.updateTrack.mockRejectedValue(new ApiError('Track "Other" is already the active callup track', 409));
    const { dialog, onSaved } = renderEditor(track);

    const weights = within(dialog).getAllByLabelText('Weight');
    await user.clear(weights[0]);
    await user.type(weights[0], '3');
    await user.click(within(dialog).getByRole('button', { name: 'Save track' }));

    expect(await within(dialog).findByText(/Another track is already active here/)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(mockProgressionApi.updateTrack).toHaveBeenCalledWith('t1', expect.objectContaining({
      name: 'Young Boys Call-Up',
      toDivisionId: 'raw',
      goals: [
        { goalId: 'g1', metric: 'matchesCompeted', threshold: 10, weight: 3, direction: 'atLeast' },
        { goalId: 'g2', metric: 'avgStarRating', threshold: 3, weight: 2, direction: 'atLeast', params: { minRatedMatches: 5 } },
      ],
    }));
  });
});

describe('ManageProgression board', () => {
  it('renders candidates sorted by progress with goal counts', async () => {
    const rows = await renderBoard();

    expect(mockProgressionApi.getBoard).toHaveBeenCalledWith('t1', undefined, expect.any(AbortSignal));
    expect(rows.map((row) => within(row).getByText(/^(High Hana|Mid Mo|Low Larry)$/).textContent))
      .toEqual(['High Hana', 'Mid Mo', 'Low Larry']);
    expect(within(rows[0]).getByText('2/2 goals')).toBeInTheDocument();
    expect(within(rows[1]).getByText('1/2 goals')).toBeInTheDocument();
    expect(within(rows[0]).getByTestId('progression-meter-pct')).toHaveTextContent('90%');
  });

  it('expands a row into the goal checklist', async () => {
    const user = userEvent.setup();
    const rows = await renderBoard();

    await user.click(within(rows[1]).getByRole('button', { name: 'Goals' }));
    expect(within(rows[1]).getByText('Needs 1 rated match')).toBeInTheDocument();
  });

  it('flags a candidate with a note, then unflags them', async () => {
    const user = userEvent.setup();
    mockProgressionApi.setConsideration.mockResolvedValueOnce({
      playerId: 'p-mid',
      trackId: 't1',
      considering: true,
      changed: true,
      consideration: { status: 'considering', markedBy: 'gm', markedAt: '2026-11-12T00:00:00.000Z', note: 'Strong promos' },
    });
    const rows = await renderBoard();

    await user.click(within(rows[1]).getByRole('button', { name: 'Flag Mid Mo for consideration' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('GM note (optional)'), 'Strong promos');
    await user.click(within(dialog).getByRole('button', { name: 'Flag' }));

    expect(mockProgressionApi.setConsideration).toHaveBeenCalledWith('p-mid', { trackId: 't1', considering: true, note: 'Strong promos' });
    expect(await within(rows[1]).findByText('Under consideration')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Strong promos')).toBeInTheDocument();
    expect(showToast).toHaveBeenCalledWith('Mid Mo is under consideration.', 'success');

    mockProgressionApi.setConsideration.mockResolvedValueOnce({
      playerId: 'p-mid', trackId: 't1', considering: false, changed: true, consideration: null,
    });
    await user.click(within(rows[1]).getByRole('button', { name: 'Remove Mid Mo from consideration' }));
    expect(mockProgressionApi.setConsideration).toHaveBeenLastCalledWith('p-mid', { trackId: 't1', considering: false });
    expect(await within(rows[1]).findByText('Not flagged')).toBeInTheDocument();
  });

  it('retries a call-up with force after HOLDS_DIVISION_TITLE, then removes the row', async () => {
    const user = userEvent.setup();
    mockProgressionApi.execute
      .mockRejectedValueOnce(new ApiError('Holds a division title', 409, {
        code: 'HOLDS_DIVISION_TITLE',
        body: { championships: [{ championshipId: 'c1', name: 'Young Boys Title' }] },
      }))
      .mockResolvedValueOnce({
        playerId: 'p-high',
        trackId: 't1',
        kind: 'callup',
        fromDivisionId: 'yb',
        toDivisionId: 'raw',
        divisionJoinedAt: '2026-11-12T00:00:00.000Z',
        event: {},
        announcementId: 'a1',
      });
    const rows = await renderBoard();

    await user.click(within(rows[0]).getByRole('button', { name: 'Call up High Hana' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Target division')).toHaveValue('Raw');
    expect(within(dialog).getByLabelText('Announce on News')).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: 'Call up' }));

    expect(await within(dialog).findByText('Young Boys Title')).toBeInTheDocument();
    expect(mockProgressionApi.execute).toHaveBeenCalledWith('p-high', { trackId: 't1', toDivisionId: 'raw', announce: true });

    await user.click(within(dialog).getByRole('button', { name: 'Proceed anyway' }));

    expect(mockProgressionApi.execute).toHaveBeenLastCalledWith('p-high', {
      trackId: 't1', toDivisionId: 'raw', announce: true, force: true,
    });
    await waitFor(() => expect(screen.getAllByTestId('candidate-row')).toHaveLength(2));
    expect(screen.queryByText('High Hana')).not.toBeInTheDocument();
    expect(showToast).toHaveBeenCalledWith('High Hana moved to Raw and announced on News.', 'success');
  });

  it('shows other execute refusals inline', async () => {
    const user = userEvent.setup();
    mockProgressionApi.execute.mockRejectedValueOnce(new ApiError('moved', 409, { code: 'CONCURRENT_UPDATE' }));
    const rows = await renderBoard();

    await user.click(within(rows[2]).getByRole('button', { name: 'Call up Low Larry' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('Announce on News'));
    await user.click(within(dialog).getByRole('button', { name: 'Call up' }));

    expect(await within(dialog).findByText('Someone else moved Low Larry first. Reload the board and try again.')).toBeInTheDocument();
    expect(mockProgressionApi.execute).toHaveBeenCalledWith('p-low', { trackId: 't1', toDivisionId: 'raw', announce: false });
    expect(within(dialog).queryByRole('button', { name: 'Proceed anyway' })).not.toBeInTheDocument();
    expect(screen.getAllByTestId('candidate-row')).toHaveLength(3);
  });

  it('recomputes and reports the counts', async () => {
    const user = userEvent.setup();
    mockProgressionApi.recompute.mockResolvedValue({ playersProcessed: 12, rowsUpdated: 9, rowsDropped: 1, failures: [] });
    await renderBoard();

    await user.click(screen.getByRole('button', { name: 'Recompute now' }));

    expect(mockProgressionApi.recompute).toHaveBeenCalledWith();
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(
      'Recomputed 12 players: 9 rows updated, 1 dropped.',
      'success',
    ));
    await waitFor(() => expect(mockProgressionApi.getBoard).toHaveBeenCalledTimes(2));
  });
});
