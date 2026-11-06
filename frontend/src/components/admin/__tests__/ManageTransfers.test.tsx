import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockTransfersApi } = vi.hoisted(() => ({
  mockTransfersApi: { getAllRequests: vi.fn(), reviewRequest: vi.fn() },
}));

vi.mock('react-i18next', async () => (await import('./i18nMock')).i18nMock);
vi.mock('../../../services/api', () => ({ transfersApi: mockTransfersApi }));

import ManageTransfers from '../ManageTransfers';

const rawId = '44487408-d061-7064-ee50-c331bb108486';
const reviewed = {
  requestId: 'r1',
  playerId: 'p1',
  fromDivisionId: 'd1',
  toDivisionId: 'd2',
  reason: 'Moving up',
  status: 'approved',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  playerName: 'Jey',
  fromDivisionName: 'Raw',
  toDivisionName: 'SmackDown',
  reviewedBy: rawId,
};

async function openHistory() {
  const user = userEvent.setup();
  render(<ManageTransfers />);
  await user.click(await screen.findByRole('tab', { name: /History/ }));
}

describe('ManageTransfers history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the reviewer name from the API', async () => {
    mockTransfersApi.getAllRequests.mockResolvedValue([{ ...reviewed, reviewedByName: 'Sam' }]);
    await openHistory();

    expect(await screen.findByText('Sam')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(rawId);
  });

  it('falls back to a label rather than an account id', async () => {
    mockTransfersApi.getAllRequests.mockResolvedValue([reviewed]);
    await openHistory();

    expect(await screen.findByText('Staff member')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(rawId);
  });

  it('labels divisions the API could only return as ids', async () => {
    mockTransfersApi.getAllRequests.mockResolvedValue([{
      ...reviewed,
      fromDivisionName: '02fc283a-59e6-4779-addd-c290e98dfa6d',
      toDivisionName: 'SmackDown',
    }]);
    await openHistory();

    const move = await screen.findByText(/Deleted division/);
    expect(move).toHaveTextContent('SmackDown');
    expect(document.body.textContent).not.toContain('02fc283a');
  });
});
