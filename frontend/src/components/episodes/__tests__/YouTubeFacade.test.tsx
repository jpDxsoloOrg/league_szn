import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => (values?.title ? `${key}:${values.title}` : key),
  }),
}));

import YouTubeFacade from '../YouTubeFacade';

const VIDEO_ID = 'dQw4w9WgXcQ';

describe('YouTubeFacade', () => {
  it('shows the thumbnail and no iframe until clicked', () => {
    const { container } = render(<YouTubeFacade videoId={VIDEO_ID} title="Night 1" />);
    expect(container.querySelector('iframe')).toBeNull();
    const button = screen.getByRole('button', { name: 'episodes.play:Night 1' });
    expect(button.querySelector('img')).toHaveAttribute('src', `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`);
  });

  it('swaps in the nocookie player after a click and focuses it', async () => {
    render(<YouTubeFacade videoId={VIDEO_ID} title="Night 1" />);
    await userEvent.click(screen.getByRole('button', { name: 'episodes.play:Night 1' }));

    const frame = screen.getByTitle('Night 1');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('src', `https://www.youtube-nocookie.com/embed/${VIDEO_ID}?autoplay=1&rel=0&modestbranding=1`);
    expect(frame).not.toHaveAttribute('referrerpolicy');
    expect(frame).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'episodes.play:Night 1' })).not.toBeInTheDocument();
  });

  it('always links out to YouTube in a new tab', () => {
    render(<YouTubeFacade videoId={VIDEO_ID} title="Night 1" />);
    const link = screen.getByRole('link', { name: 'episodes.watchOnYoutube' });
    expect(link).toHaveAttribute('href', `https://www.youtube.com/watch?v=${VIDEO_ID}`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('uses a given thumbnail', () => {
    render(<YouTubeFacade videoId={VIDEO_ID} title="Night 1" thumbnailUrl="https://i.ytimg.com/vi/x/custom.jpg" />);
    expect(screen.getByRole('button').querySelector('img')).toHaveAttribute('src', 'https://i.ytimg.com/vi/x/custom.jpg');
  });

  it('renders nothing for an invalid id', () => {
    const { container } = render(<YouTubeFacade videoId={'"><script>'} title="Bad" />);
    expect(container).toBeEmptyDOMElement();
  });
});
