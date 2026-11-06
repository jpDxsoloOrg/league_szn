import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockStorylineRequestsApi } = vi.hoisted(() => ({
  mockStorylineRequestsApi: { getAll: vi.fn(), review: vi.fn() },
}));

vi.mock('react-i18next', async () => (await import('./i18nMock')).i18nMock);
vi.mock('../../../services/api', () => ({ storylineRequestsApi: mockStorylineRequestsApi }));

import ManageStorylineRequests from '../ManageStorylineRequests';

const rawId = '44487408-d061-7064-ee50-c331bb108486';
const reviewed = {
  requestId: 'r1',
  requesterId: 'p1',
  requestType: 'storyline',
  targetPlayerIds: ['p2'],
  description: 'A long feud',
  status: 'acknowledged',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  requesterName: 'Jey',
  targetPlayerNames: ['Sam'],
  reviewedBy: rawId,
};

async function openHistory() {
  const user = userEvent.setup();
  render(<ManageStorylineRequests />);
  await user.click(await screen.findByRole('tab', { name: /History/ }));
}

describe('ManageStorylineRequests history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the reviewer name from the API', async () => {
    mockStorylineRequestsApi.getAll.mockResolvedValue([{ ...reviewed, reviewedByName: 'Taylor' }]);
    await openHistory();

    expect(await screen.findByText(/Taylor/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(rawId);
  });

  it('falls back to a label rather than an account id', async () => {
    mockStorylineRequestsApi.getAll.mockResolvedValue([reviewed]);
    await openHistory();

    expect(await screen.findByText(/League Staff/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(rawId);
  });
});
