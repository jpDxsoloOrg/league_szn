import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type {
  DisciplineActionResult,
  DisciplineHoldings,
  Player,
  PlayerDisciplineDetail,
  PlayerDisciplineSummary,
  PlayerStrike,
} from '../../../types';

const { authState, mockDiscipline } = vi.hoisted(() => ({
  authState: { isSuperAdmin: true },
  mockDiscipline: {
    get: vi.fn(),
    issueStrike: vi.fn(),
    removeStrike: vi.fn(),
    reactivate: vi.fn(),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string, second?: unknown) => {
      if (typeof second === 'string') return second;
      const name = (second as { name?: string } | undefined)?.name;
      return name ? `${key} ${name}` : key;
    },
  }),
}));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../../../services/api', () => ({ disciplineApi: mockDiscipline }));

import { ApiError } from '../../../services/api/apiClient';
import PlayerDisciplineModal from '../PlayerDisciplineModal';

const player = { playerId: 'p1', name: 'Edge' } as Player;
const noHoldings: DisciplineHoldings = { titles: [], matches: [], challenges: [], tournaments: [] };
const REASON = 'Missed a booked match';

const strike = (strikeId: string, extra: Partial<PlayerStrike> = {}): PlayerStrike => ({
  strikeId,
  issuedAt: '2026-11-01T10:00:00.000Z',
  issuedBy: 'sub',
  issuedByName: 'The GM',
  reason: `Reason ${strikeId}`,
  ...extra,
});

const clearSummary: PlayerDisciplineSummary = {
  status: 'clear',
  activeStrikeCount: 0,
  activeStrikes: [],
  cooldownEndsAt: null,
  signupBlockedUntil: null,
  deactivatedAt: null,
};

const detail = (overrides: Partial<PlayerDisciplineDetail> = {}): PlayerDisciplineDetail => ({
  playerId: 'p1',
  version: 3,
  summary: clearSummary,
  nextStrikeOutcome: 'warned',
  strikes: [],
  deactivations: [],
  hasLinkedAccount: true,
  isStaffAccount: false,
  accountEnabled: true,
  holdings: noHoldings,
  ...overrides,
});

const inCooldown = (): PlayerDisciplineDetail => detail({
  summary: {
    ...clearSummary,
    status: 'cooldown',
    activeStrikeCount: 2,
    activeStrikes: [strike('s2'), strike('s3')].map(({ strikeId, issuedAt, reason }) => ({ strikeId, issuedAt, reason })),
    cooldownEndsAt: '2099-01-01T00:00:00.000Z',
  },
  nextStrikeOutcome: 'deactivated',
  strikes: [strike('s3'), strike('s2'), strike('s1')],
});

const deactivated = (): PlayerDisciplineDetail => detail({
  summary: {
    ...clearSummary,
    status: 'deactivated',
    activeStrikeCount: 3,
    activeStrikes: [strike('s1'), strike('s2'), strike('s3')].map(({ strikeId, issuedAt, reason }) => ({ strikeId, issuedAt, reason })),
    deactivatedAt: '2026-11-02T00:00:00.000Z',
  },
  nextStrikeOutcome: null,
  strikes: [strike('s3'), strike('s2'), strike('s1')],
  deactivations: [{ deactivatedAt: '2026-11-02T00:00:00.000Z', deactivatedBy: 'sub', deactivatedByName: 'The GM', strikeId: 's3' }],
  accountEnabled: false,
});

const fullHoldings: DisciplineHoldings = {
  titles: [{ championshipId: 'c1', name: 'World Title' }],
  matches: [{ matchId: 'm1', date: '2026-11-20', status: 'scheduled', opponents: [], eventId: 'e1' }],
  challenges: [{ challengeId: 'ch1', opponentName: 'Christian' }],
  tournaments: [{ tournamentId: 't1', name: 'King of the Ring', status: 'in-progress' }],
};

const actionResult = (overrides: Partial<DisciplineActionResult> = {}): DisciplineActionResult => ({
  playerId: 'p1',
  version: 4,
  summary: clearSummary,
  accountSync: 'not-needed',
  softHoldsCleared: true,
  holdings: noHoldings,
  ...overrides,
});

const onChanged = vi.fn();
const onClose = vi.fn();

const renderModal = async () => {
  render(
    <MemoryRouter>
      <PlayerDisciplineModal player={player} onChanged={onChanged} onClose={onClose} />
    </MemoryRouter>,
  );
  await screen.findByText('discipline.admin.history');
};

const reasonBox = (name = 'discipline.admin.reason') => screen.getByRole('textbox', { name });

beforeEach(() => {
  vi.clearAllMocks();
  authState.isSuperAdmin = true;
});

describe('PlayerDisciplineModal', () => {
  it('stays closed with no player', () => {
    render(
      <MemoryRouter>
        <PlayerDisciplineModal player={null} onChanged={onChanged} onClose={onClose} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockDiscipline.get).not.toHaveBeenCalled();
  });

  it('offers a retry when the record cannot be read', async () => {
    mockDiscipline.get.mockRejectedValueOnce(new ApiError('Boom', 500)).mockResolvedValue(detail());
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PlayerDisciplineModal player={player} onChanged={onChanged} onClose={onClose} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('discipline.admin.loadFailed');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('discipline.admin.history')).toBeInTheDocument();
  });

  describe('as an Admin', () => {
    it('names the outcome on the button, and sends what the modal loaded', async () => {
      mockDiscipline.get.mockResolvedValue(detail());
      mockDiscipline.issueStrike.mockResolvedValue(actionResult());
      const user = userEvent.setup();
      await renderModal();

      const submit = screen.getByRole('button', { name: 'discipline.admin.issueWarning' });
      expect(submit).toBeDisabled();

      await user.type(reasonBox(), `  ${REASON}  `);
      await user.click(submit);

      expect(mockDiscipline.issueStrike).toHaveBeenCalledWith('p1', {
        reason: REASON,
        expectedVersion: 3,
        expectedOutcome: 'warned',
      });
      expect(await screen.findByText('discipline.admin.done.strike')).toBeInTheDocument();
      expect(onChanged).toHaveBeenCalled();
      expect(mockDiscipline.get).toHaveBeenCalledTimes(2);
      expect(reasonBox()).toHaveValue('');
    });

    it.each([
      ['a second strike', 1, 'discipline.admin.issueSecond'],
    ])('labels %s', async (_name, activeStrikeCount, label) => {
      mockDiscipline.get.mockResolvedValue(detail({
        nextStrikeOutcome: 'signup-blocked',
        summary: { ...clearSummary, status: 'warned', activeStrikeCount },
      }));
      await renderModal();
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    });

    it('needs a reason of at least 3 characters', async () => {
      mockDiscipline.get.mockResolvedValue(detail());
      const user = userEvent.setup();
      await renderModal();

      await user.type(reasonBox(), ' ab ');
      expect(screen.getByRole('button', { name: 'discipline.admin.issueWarning' })).toBeDisabled();
      await user.clear(reasonBox());
      await user.type(reasonBox(), 'abc');
      expect(screen.getByRole('button', { name: 'discipline.admin.issueWarning' })).toBeEnabled();
    });

    it('turns Issue off for a staff account and says why', async () => {
      mockDiscipline.get.mockResolvedValue(detail({ isStaffAccount: true }));
      await renderModal();
      expect(screen.getByText('discipline.admin.staffProtected')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'discipline.admin.issueWarning' })).toBeDisabled();
      expect(reasonBox()).toBeDisabled();
    });

    it('leaves Issue on when the staff check failed, since the server checks again', async () => {
      mockDiscipline.get.mockResolvedValue(detail({ isStaffAccount: null, accountEnabled: null }));
      const user = userEvent.setup();
      await renderModal();
      await user.type(reasonBox(), REASON);
      expect(screen.getByRole('button', { name: 'discipline.admin.issueWarning' })).toBeEnabled();
    });
  });

  describe('deactivation', () => {
    it('lists holdings with links before anything is sent, then again after', async () => {
      mockDiscipline.get.mockResolvedValue({ ...inCooldown(), holdings: fullHoldings });
      mockDiscipline.issueStrike.mockResolvedValue(actionResult({
        summary: deactivated().summary,
        accountSync: 'ok',
        holdings: fullHoldings,
      }));
      const user = userEvent.setup();
      await renderModal();

      await user.type(reasonBox(), REASON);
      await user.click(screen.getByRole('button', { name: 'discipline.admin.deactivateAccount' }));

      expect(mockDiscipline.issueStrike).not.toHaveBeenCalled();
      const confirm = await screen.findByRole('dialog', { name: 'discipline.admin.confirmDeactivateTitle' });
      expect(within(confirm).getByText('discipline.admin.holdingsNotChanged')).toBeInTheDocument();
      expect(within(confirm).getByRole('link', { name: /World Title/ })).toHaveAttribute('href', '/admin/championships');
      expect(within(confirm).getByRole('link', { name: /holdingMatch/ })).toHaveAttribute('href', '/events/e1');
      expect(within(confirm).getByRole('link', { name: /Christian/ })).toHaveAttribute('href', '/admin/challenges');
      expect(within(confirm).getByRole('link', { name: /King of the Ring/ })).toHaveAttribute('href', '/tournaments');

      await user.click(within(confirm).getByRole('button', { name: 'discipline.admin.deactivateAccount' }));

      expect(mockDiscipline.issueStrike).toHaveBeenCalledWith('p1', {
        reason: REASON,
        expectedVersion: 3,
        expectedOutcome: 'deactivated',
      });
      expect(await screen.findByRole('link', { name: /World Title/ })).toBeInTheDocument();
      expect(screen.getByText('discipline.admin.done.strikeDeactivated')).toBeInTheDocument();
      expect(screen.queryByText('discipline.admin.done.strike')).not.toBeInTheDocument();
    });

    const deactivateThroughConfirm = async () => {
      const user = userEvent.setup();
      await renderModal();
      await user.type(reasonBox(), REASON);
      await user.click(screen.getByRole('button', { name: 'discipline.admin.deactivateAccount' }));
      const confirm = await screen.findByRole('dialog', { name: 'discipline.admin.confirmDeactivateTitle' });
      await user.click(within(confirm).getByRole('button', { name: 'discipline.admin.deactivateAccount' }));
    };

    it('shows the reloaded holdings when the action could not read them', async () => {
      mockDiscipline.get
        .mockResolvedValueOnce({ ...inCooldown(), holdings: fullHoldings })
        .mockResolvedValue({ ...deactivated(), holdings: fullHoldings });
      mockDiscipline.issueStrike.mockResolvedValue(actionResult({ summary: deactivated().summary, accountSync: 'ok' }));

      await deactivateThroughConfirm();

      expect(await screen.findByText('discipline.admin.done.strikeDeactivated')).toBeInTheDocument();
      expect(await screen.findByRole('link', { name: /World Title/ })).toBeInTheDocument();
      expect(screen.queryByText('discipline.admin.holdingsNone')).not.toBeInTheDocument();
    });

    it('keeps the holdings from the action when the reload fails', async () => {
      mockDiscipline.get
        .mockResolvedValueOnce(inCooldown())
        .mockRejectedValue(new Error('read failed'));
      mockDiscipline.issueStrike.mockResolvedValue(actionResult({
        summary: deactivated().summary,
        accountSync: 'ok',
        holdings: fullHoldings,
      }));

      await deactivateThroughConfirm();

      expect(await screen.findByRole('link', { name: /World Title/ })).toBeInTheDocument();
      expect(screen.getByText('discipline.admin.staleDetail')).toBeInTheDocument();
    });

    it('sends nothing when the confirmation is cancelled', async () => {
      mockDiscipline.get.mockResolvedValue(inCooldown());
      const user = userEvent.setup();
      await renderModal();

      await user.type(reasonBox(), REASON);
      await user.click(screen.getByRole('button', { name: 'discipline.admin.deactivateAccount' }));
      const confirm = await screen.findByRole('dialog', { name: 'discipline.admin.confirmDeactivateTitle' });
      await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));

      expect(mockDiscipline.issueStrike).not.toHaveBeenCalled();
    });

    it('closes the record when a holdings link is followed', async () => {
      mockDiscipline.get.mockResolvedValue({ ...deactivated(), holdings: fullHoldings });
      const user = userEvent.setup();
      await renderModal();

      await user.click(screen.getByRole('link', { name: /World Title/ }));

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('a failed action', () => {
    const failWith = async (error: Error) => {
      const user = userEvent.setup();
      mockDiscipline.get.mockResolvedValue(detail());
      mockDiscipline.issueStrike.mockRejectedValue(error);
      await renderModal();
      await user.type(reasonBox(), REASON);
      await user.click(screen.getByRole('button', { name: 'discipline.admin.issueWarning' }));
    };

    it.each([
      ['an uncoded API error', new ApiError('expectedVersion is required', 400)],
      ['a network error', new TypeError('Failed to fetch')],
    ])('shows the translated message for %s, not the raw text', async (_label, error) => {
      await failWith(error);

      expect(await screen.findByText('discipline.admin.actionFailed')).toBeInTheDocument();
      expect(screen.queryByText(error.message)).not.toBeInTheDocument();
    });

    it('shows a coded refusal as it came', async () => {
      await failWith(new ApiError('Translated refusal', 409, { code: 'STAFF_PROTECTED' }));

      expect(await screen.findByText('Translated refusal')).toBeInTheDocument();
    });
  });

  describe('the reason field', () => {
    it('is described by its length hint', async () => {
      mockDiscipline.get.mockResolvedValue(detail());
      await renderModal();

      expect(reasonBox()).toHaveAccessibleDescription('discipline.admin.reasonHint');
    });
  });

  describe('a conflict', () => {
    it('reloads and shows the new state with the typed reason kept', async () => {
      mockDiscipline.get.mockResolvedValueOnce(detail()).mockResolvedValue(inCooldown());
      mockDiscipline.issueStrike.mockRejectedValue(
        new ApiError('Translated conflict', 409, { code: 'DISCIPLINE_CONFLICT' }),
      );
      const user = userEvent.setup();
      await renderModal();

      await user.type(reasonBox(), REASON);
      await user.click(screen.getByRole('button', { name: 'discipline.admin.issueWarning' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Translated conflict');
      expect(await screen.findByRole('button', { name: 'discipline.admin.deactivateAccount' })).toBeInTheDocument();
      expect(reasonBox()).toHaveValue(REASON);
      expect(onChanged).not.toHaveBeenCalled();
    });
  });

  describe('removing a strike', () => {
    it('appears only on active strikes, and sends a reason and the version', async () => {
      mockDiscipline.get.mockResolvedValue(inCooldown());
      mockDiscipline.removeStrike.mockResolvedValue(actionResult());
      const user = userEvent.setup();
      await renderModal();

      const removeButtons = screen.getAllByRole('button', { name: 'discipline.admin.remove' });
      expect(removeButtons).toHaveLength(2);

      await user.click(removeButtons[0] as HTMLElement);
      await user.type(reasonBox('discipline.admin.removeReason'), 'Issued in error');
      await user.click(screen.getByRole('button', { name: 'discipline.admin.confirmRemove' }));

      expect(mockDiscipline.removeStrike).toHaveBeenCalledWith('p1', 's3', {
        reason: 'Issued in error',
        expectedVersion: 3,
      });
      expect(await screen.findByText('discipline.admin.done.remove')).toBeInTheDocument();
    });

    it('moves focus to the reason field, and back to Remove on cancel', async () => {
      const user = userEvent.setup();
      mockDiscipline.get.mockResolvedValue(inCooldown());
      await renderModal();

      await user.click(screen.getAllByRole('button', { name: 'discipline.admin.remove' })[0]);
      expect(screen.getByLabelText('discipline.admin.removeReason')).toHaveFocus();

      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: 'discipline.admin.remove' })[0]).toHaveFocus();
      });
    });

    it('is not offered while deactivated', async () => {
      mockDiscipline.get.mockResolvedValue(deactivated());
      await renderModal();
      expect(screen.queryByRole('button', { name: 'discipline.admin.remove' })).not.toBeInTheDocument();
    });
  });

  describe('reactivating', () => {
    it('shows holdings and sends the restore choice', async () => {
      mockDiscipline.get.mockResolvedValue({ ...deactivated(), holdings: fullHoldings });
      mockDiscipline.reactivate.mockResolvedValue(actionResult({ accountSync: 'ok' }));
      const user = userEvent.setup();
      await renderModal();

      expect(screen.getByRole('link', { name: /World Title/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /issue/i })).not.toBeInTheDocument();

      await user.type(reasonBox('discipline.admin.reactivateReason'), 'Strike was a mistake');
      await user.click(screen.getByRole('checkbox', { name: 'discipline.admin.restorePriorStrikes' }));
      await user.click(screen.getByRole('button', { name: 'discipline.admin.reactivate' }));

      expect(mockDiscipline.reactivate).toHaveBeenCalledWith('p1', {
        reason: 'Strike was a mistake',
        expectedVersion: 3,
        restorePriorStrikes: true,
      });
    });

    it('leaves the restore flag out when unticked', async () => {
      mockDiscipline.get.mockResolvedValue(deactivated());
      mockDiscipline.reactivate.mockResolvedValue(actionResult({ accountSync: 'ok' }));
      const user = userEvent.setup();
      await renderModal();

      await user.type(reasonBox('discipline.admin.reactivateReason'), 'Served their time');
      await user.click(screen.getByRole('button', { name: 'discipline.admin.reactivate' }));

      expect(mockDiscipline.reactivate).toHaveBeenCalledWith('p1', { reason: 'Served their time', expectedVersion: 3 });
    });

    it('explains that an already disabled login was left alone', async () => {
      mockDiscipline.get.mockResolvedValue(deactivated());
      mockDiscipline.reactivate.mockResolvedValue(actionResult({ accountSync: 'not-needed', softHoldsCleared: false }));
      const user = userEvent.setup();
      await renderModal();

      await user.type(reasonBox('discipline.admin.reactivateReason'), 'Served their time');
      await user.click(screen.getByRole('button', { name: 'discipline.admin.reactivate' }));

      expect(await screen.findByText(/discipline\.admin\.loginAlreadyDisabled/)).toBeInTheDocument();
      expect(screen.queryByText('discipline.admin.softHoldsFailed')).not.toBeInTheDocument();
    });
  });

  describe('action warnings', () => {
    const issue = async (result: DisciplineActionResult) => {
      mockDiscipline.get.mockResolvedValue(detail({ nextStrikeOutcome: 'signup-blocked' }));
      mockDiscipline.issueStrike.mockResolvedValue(result);
      const user = userEvent.setup();
      await renderModal();
      await user.type(reasonBox(), REASON);
      await user.click(screen.getByRole('button', { name: 'discipline.admin.issueSecond' }));
    };

    it('points to Manage Users when the login could not be changed', async () => {
      await issue(actionResult({ accountSync: 'failed' }));
      expect(await screen.findByText(/discipline\.admin\.accountSyncFailed/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'discipline.admin.manageUsers' })).toHaveAttribute('href', '/admin/users');
    });

    it('says when there is no login', async () => {
      await issue(actionResult({ accountSync: 'not-linked' }));
      expect(await screen.findByText('discipline.admin.notLinked')).toBeInTheDocument();
    });

    it('says when cleanup did not finish', async () => {
      await issue(actionResult({
        summary: { ...clearSummary, status: 'signup-blocked' },
        softHoldsCleared: false,
      }));
      expect(await screen.findByText('discipline.admin.softHoldsFailed')).toBeInTheDocument();
    });
  });

  describe('the login mismatch warning', () => {
    it.each([
      ['deactivated but enabled', () => ({ ...deactivated(), accountEnabled: true })],
      ['not deactivated but disabled', () => detail({ accountEnabled: false })],
    ])('shows for %s', async (_name, build) => {
      mockDiscipline.get.mockResolvedValue(build());
      await renderModal();
      expect(screen.getByText(/discipline\.admin\.accountMismatch/)).toBeInTheDocument();
    });

    it.each([
      ['in step', () => detail()],
      ['deactivated and disabled', () => deactivated()],
      ['unknown', () => detail({ accountEnabled: null })],
    ])('stays away when %s', async (_name, build) => {
      mockDiscipline.get.mockResolvedValue(build());
      await renderModal();
      expect(screen.queryByText(/discipline\.admin\.accountMismatch/)).not.toBeInTheDocument();
    });
  });

  describe('as a Moderator', () => {
    beforeEach(() => {
      authState.isSuperAdmin = false;
    });

    it('reads the record and gets no forms', async () => {
      mockDiscipline.get.mockResolvedValue(inCooldown());
      await renderModal();

      expect(screen.getByText('discipline.admin.readOnly')).toBeInTheDocument();
      expect(screen.getAllByText('Reason s2').length).toBeGreaterThan(0);
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'discipline.admin.remove' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'discipline.admin.deactivateAccount' })).not.toBeInTheDocument();
    });

    it('cannot reactivate', async () => {
      mockDiscipline.get.mockResolvedValue(deactivated());
      await renderModal();
      expect(screen.queryByRole('button', { name: 'discipline.admin.reactivate' })).not.toBeInTheDocument();
    });
  });

  describe('history', () => {
    it('shows who did what, including a removal and a lapsed strike', async () => {
      mockDiscipline.get.mockResolvedValue(detail({
        strikes: [
          strike('s2', { clearedAt: '2026-11-03T00:00:00.000Z', clearedByName: 'The Boss', clearedReason: 'Wrong player', clearedKind: 'removed' }),
          strike('s1'),
        ],
      }));
      await renderModal();

      await waitFor(() => expect(screen.getAllByText(/discipline\.admin\.issuedBy The GM/)).toHaveLength(2));
      expect(screen.getByText(/discipline\.admin\.removedBy The Boss: Wrong player/)).toBeInTheDocument();
      expect(screen.getByText('discipline.admin.strikeCleared')).toBeInTheDocument();
      expect(screen.getByText('discipline.admin.strikeLapsed')).toBeInTheDocument();
    });
  });
});
