import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockCreate, mockTickerCreate } = vi.hoisted(() => ({ mockCreate: vi.fn(), mockTickerCreate: vi.fn() }));

vi.mock('../../../services/api', () => ({
  announcementsApi: { create: mockCreate },
  tickerMessagesApi: { create: mockTickerCreate },
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

describe('AnnouncementWizard ticker option', () => {
  const TICKER_LABEL = 'announcements.ticker.wizardPostToTicker';

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({ announcementId: 'ann-1' });
    mockTickerCreate.mockResolvedValue({});
  });

  it('is offered only in Breaking News', async () => {
    await openFinalStep(/match card/i, 3);
    expect(screen.queryByRole('checkbox', { name: TICKER_LABEL })).toBeNull();
  });

  it('does not post to the ticker unless ticked', async () => {
    const { user, onPublished } = await openFinalStep(/breaking news/i, 2);
    expect(screen.getByRole('checkbox', { name: TICKER_LABEL })).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: /publish announcement/i }));

    expect(mockTickerCreate).not.toHaveBeenCalled();
    expect(onPublished).toHaveBeenCalled();
  });

  it('posts the headline to the ticker, linked to the story', async () => {
    const { user, onPublished } = await openFinalStep(/breaking news/i, 2);
    await user.click(screen.getByRole('checkbox', { name: TICKER_LABEL }));
    await user.click(screen.getByRole('button', { name: /publish announcement/i }));

    expect(mockTickerCreate).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Breaking News',
      href: '/news/ann-1',
    }));
    expect(onPublished).toHaveBeenCalled();
  });

  it('keeps the wizard open and explains when the ticker post fails', async () => {
    mockTickerCreate.mockRejectedValue(new Error('boom'));
    const { user, onPublished } = await openFinalStep(/breaking news/i, 2);
    await user.click(screen.getByRole('checkbox', { name: TICKER_LABEL }));
    await user.click(screen.getByRole('button', { name: /publish announcement/i }));

    expect(onPublished).not.toHaveBeenCalled();
    expect(await screen.findByText(/announcements.ticker.wizardPostFailed/)).toBeInTheDocument();
  });
});
