import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockChampionshipsApi, mockContendersApi } = vi.hoisted(() => ({
  mockChampionshipsApi: { getAll: vi.fn() },
  mockContendersApi: { recalculate: vi.fn() },
}));

vi.mock('react-i18next', async () => (await import('./i18nMock')).i18nMock);
vi.mock('../../../services/api', () => ({
  championshipsApi: mockChampionshipsApi,
  contendersApi: mockContendersApi,
}));

import AdminContenderConfig from '../AdminContenderConfig';

describe('AdminContenderConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChampionshipsApi.getAll.mockResolvedValue([{ championshipId: 'c1', name: 'World Title' }]);
    mockContendersApi.recalculate.mockResolvedValue({ message: 'Rankings recalculated' });
  });

  it('asks before recalculating, and sends nothing if the person backs out', async () => {
    const user = userEvent.setup();
    render(<AdminContenderConfig />);
    const recalculate = await screen.findByRole('button', { name: 'contenders.admin.recalculate' });

    await user.click(recalculate);
    const dialog = await screen.findByRole('dialog');
    expect(mockContendersApi.recalculate).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockContendersApi.recalculate).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'contenders.admin.recalculate' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'contenders.admin.recalculate' }));
    await waitFor(() => expect(mockContendersApi.recalculate).toHaveBeenCalledTimes(1));
  });
});
