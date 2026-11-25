import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '../../../i18n';

const { mockFinesApi, mockNoShowsApi, mockEconomyApi, mockUseAuth, mockUseSiteConfig } = vi.hoisted(() => ({
  mockFinesApi: { issue: vi.fn(), rescind: vi.fn(), getPlayerLedger: vi.fn() },
  mockNoShowsApi: { mark: vi.fn(), undo: vi.fn() },
  mockEconomyApi: { getConfig: vi.fn() },
  mockUseAuth: vi.fn(),
  mockUseSiteConfig: vi.fn(),
}));

vi.mock('../../../services/api/fines.api', async () => {
  const actual = await vi.importActual<typeof import('../../../services/api/fines.api')>('../../../services/api/fines.api');
  return { ...actual, finesApi: mockFinesApi, noShowsApi: mockNoShowsApi };
});
vi.mock('../../../services/api/economy.api', async () => {
  const actual = await vi.importActual<typeof import('../../../services/api/economy.api')>('../../../services/api/economy.api');
  return { ...actual, economyApi: mockEconomyApi };
});
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: mockUseAuth }));
vi.mock('../../../contexts/SiteConfigContext', () => ({ useSiteConfig: mockUseSiteConfig }));

import NoShowButton from '../NoShowButton';
import PlayerFinesModal from '../PlayerFinesModal';

const participants = [
  { playerId: 'p1', name: 'Rock' },
  { playerId: 'p2', name: 'Austin' },
];

beforeEach(async () => {
  await i18n.changeLanguage('en');
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ isAdminOrModerator: true });
  mockUseSiteConfig.mockReturnValue({ features: { economy: true } });
});

describe('NoShowButton', () => {
  it('stays hidden with the economy off or for non-staff', () => {
    mockUseSiteConfig.mockReturnValue({ features: { economy: false } });
    const { rerender } = render(<NoShowButton matchId="m1" status="scheduled" participants={participants} />);
    expect(screen.queryByRole('button', { name: 'No-shows' })).not.toBeInTheDocument();

    mockUseSiteConfig.mockReturnValue({ features: { economy: true } });
    mockUseAuth.mockReturnValue({ isAdminOrModerator: false });
    rerender(<NoShowButton matchId="m1" status="scheduled" participants={participants} />);
    expect(screen.queryByRole('button', { name: 'No-shows' })).not.toBeInTheDocument();
  });

  it('stays hidden on a match past the no-show window with nothing to undo', () => {
    render(<NoShowButton matchId="m1" status="completed" completedAt="2020-01-01T00:00:00Z" participants={participants} />);
    expect(screen.queryByRole('button', { name: 'No-shows' })).not.toBeInTheDocument();
  });

  it('marks a participant with the note, then offers undo', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    mockNoShowsApi.mark.mockResolvedValue({ noShow: { playerId: 'p1', markedAt: '2026-11-20T00:00:00Z' } });
    mockNoShowsApi.undo.mockResolvedValue({ noShow: { playerId: 'p1', markedAt: '2026-11-20T00:00:00Z', undoneAt: '2026-11-20T01:00:00Z' } });
    render(<NoShowButton matchId="m1" status="scheduled" participants={participants} onChanged={onChanged} />);

    await user.click(screen.getByRole('button', { name: 'No-shows' }));
    const dialog = await screen.findByRole('dialog', { name: 'No-shows' });
    await user.type(within(dialog).getByLabelText('Note for the fine (optional)'), 'Never logged on');
    await user.click(within(dialog).getByRole('button', { name: 'Mark Rock as a no-show' }));

    expect(mockNoShowsApi.mark).toHaveBeenCalledWith('m1', 'p1', 'Never logged on');
    expect(onChanged).toHaveBeenCalledTimes(1);
    await user.click(await within(dialog).findByRole('button', { name: 'Undo Rock\'s no-show' }));
    expect(mockNoShowsApi.undo).toHaveBeenCalledWith('m1', 'p1');
    expect(await within(dialog).findByRole('button', { name: 'Mark Rock as a no-show' })).toBeInTheDocument();
  });
});

describe('PlayerFinesModal', () => {
  beforeEach(() => {
    mockEconomyApi.getConfig.mockResolvedValue({
      settings: { currencySymbol: '$', finePresets: [{ key: 'late', label: 'Late to the show', amount: 100 }] },
    });
    mockFinesApi.getPlayerLedger.mockResolvedValue({
      playerId: 'p1',
      balance: 400,
      items: [
        { playerId: 'p1', entryId: 'r1', createdAt: '2026-11-19T00:00:00Z', kind: 'fineRescinded', amount: 50, balanceAfter: 400, refType: 'ledgerEntry', refId: 'f1' },
        { playerId: 'p1', entryId: 'f2', createdAt: '2026-11-18T00:00:00Z', kind: 'fine', amount: -75, balanceAfter: 350, note: 'Rope abuse' },
        { playerId: 'p1', entryId: 'f1', createdAt: '2026-11-17T00:00:00Z', kind: 'fine', amount: -50, balanceAfter: 425, note: 'No-show' },
      ],
    });
  });

  it('issues a preset fine', async () => {
    const user = userEvent.setup();
    mockFinesApi.issue.mockResolvedValue({ entry: { amount: -100 }, balance: 300, alreadyApplied: false });
    render(<PlayerFinesModal player={{ playerId: 'p1', name: 'Rock' }} onClose={vi.fn()} />);

    const dialog = await screen.findByRole('dialog', { name: 'Fines: Rock' });
    expect(await within(dialog).findByText('Balance: $400')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('combobox', { name: 'Fine' }));
    await user.click(await screen.findByRole('option', { name: 'Late to the show ($100)' }));
    await user.click(within(dialog).getByRole('button', { name: 'Fine Rock' }));

    expect(mockFinesApi.issue).toHaveBeenCalledWith('p1', { presetKey: 'late', requestId: expect.any(String) });
  });

  it('needs a reason for a custom amount', async () => {
    const user = userEvent.setup();
    mockFinesApi.issue.mockResolvedValue({ entry: { amount: -40 }, balance: 360, alreadyApplied: false });
    render(<PlayerFinesModal player={{ playerId: 'p1', name: 'Rock' }} onClose={vi.fn()} />);

    const dialog = await screen.findByRole('dialog', { name: 'Fines: Rock' });
    await user.click(await within(dialog).findByRole('combobox', { name: 'Fine' }));
    await user.click(await screen.findByRole('option', { name: 'Custom amount' }));
    await user.type(within(dialog).getByLabelText('Amount'), '40');
    const issue = within(dialog).getByRole('button', { name: 'Fine Rock' });
    expect(issue).toBeDisabled();

    await user.type(within(dialog).getByLabelText('Reason (shown to the player)'), 'Spamming the chat');
    expect(issue).toBeEnabled();
    await user.click(issue);
    expect(mockFinesApi.issue).toHaveBeenCalledWith('p1', { amount: 40, reason: 'Spamming the chat', requestId: expect.any(String) });
  });

  it('shows past fines and rescinds one after confirming', async () => {
    const user = userEvent.setup();
    mockFinesApi.rescind.mockResolvedValue({});
    render(<PlayerFinesModal player={{ playerId: 'p1', name: 'Rock' }} onClose={vi.fn()} />);

    const dialog = await screen.findByRole('dialog', { name: 'Fines: Rock' });
    expect(await within(dialog).findByText('Rope abuse')).toBeInTheDocument();
    expect(within(dialog).getByText('Rescinded')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('button', { name: 'Rescind' })).toHaveLength(1);

    await user.click(within(dialog).getByRole('button', { name: 'Rescind' }));
    expect(within(dialog).getByText('Refund this $75 fine?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Refund' }));
    expect(mockFinesApi.rescind).toHaveBeenCalledWith('f2');
  });
});
