import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock('../../../services/api', () => ({
  announcementsApi: { create: mockCreate },
  imagesApi: {},
}));

import AnnouncementWizard from '../AnnouncementWizard';

const POPUP_LABEL = /also show as a pop-up/i;

async function openFinalStep(mode: RegExp, nextClicks: number) {
  const user = userEvent.setup();
  const onPublished = vi.fn();
  render(<AnnouncementWizard onClose={vi.fn()} onPublished={onPublished} />);
  await user.click(screen.getByRole('button', { name: mode }));
  for (let click = 0; click < nextClicks; click += 1) {
    await user.click(screen.getByRole('button', { name: /next/i }));
  }
  return { user, onPublished };
}

describe('AnnouncementWizard pop-up option', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({});
  });

  it.each([
    ['Match Card', /match card/i, 3],
    ['Breaking News', /breaking news/i, 2],
    ['Video / Poster', /video \/ poster/i, 1],
  ])('is offered and off by default for %s', async (_name, mode, nextClicks) => {
    await openFinalStep(mode, nextClicks);
    expect(screen.getByRole('checkbox', { name: POPUP_LABEL })).not.toBeChecked();
  });

  it('publishes to News only unless the option is ticked', async () => {
    const { user, onPublished } = await openFinalStep(/breaking news/i, 2);
    await user.click(screen.getByRole('button', { name: /publish announcement/i }));

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ isActive: true, showAsPopup: false }));
    expect(onPublished).toHaveBeenCalled();
  });

  it('sends the flag when staff ask for a pop-up', async () => {
    const { user } = await openFinalStep(/match card/i, 3);
    await user.click(screen.getByRole('checkbox', { name: POPUP_LABEL }));
    await user.click(screen.getByRole('button', { name: /publish announcement/i }));

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ showAsPopup: true }));
  });
});
