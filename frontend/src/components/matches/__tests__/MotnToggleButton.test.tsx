import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, optsOrDefault?: unknown) => {
      if (typeof optsOrDefault === 'string') return optsOrDefault;
      if (optsOrDefault && typeof optsOrDefault === 'object') {
        const opts = optsOrDefault as Record<string, unknown>;
        return (opts.defaultValue as string | undefined) ?? key;
      }
      return key;
    },
  }),
}));

vi.mock('../MotnToggleButton.css', () => ({}));

const setMotnMock = vi.fn();
vi.mock('../../../services/api/matches.api', () => ({
  matchesApi: {
    setMatchOfTheNight: (matchId: string, value: boolean) => setMotnMock(matchId, value),
  },
}));

import { MotnToggleButton } from '../MotnToggleButton';

describe('MotnToggleButton', () => {
  beforeEach(() => {
    setMotnMock.mockReset();
  });

  it('shows the "Mark as" label when matchOfTheNight is false', () => {
    render(
      <MotnToggleButton matchId="m1" matchOfTheNight={false} />
    );
    const btn = screen.getByRole('button');
    expect(btn).toHaveTextContent('Mark as Match of the Night');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows the "Remove" label when matchOfTheNight is true', () => {
    render(
      <MotnToggleButton matchId="m1" matchOfTheNight={true} />
    );
    const btn = screen.getByRole('button');
    expect(btn).toHaveTextContent('Match of the Night — Remove');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.className).toContain('motn-toggle-button--on');
  });

  it('flips state and calls API with the next value when clicked', async () => {
    const user = userEvent.setup();
    const onToggled = vi.fn();
    setMotnMock.mockResolvedValue({ matchId: 'm1', matchOfTheNight: true });

    render(
      <MotnToggleButton matchId="m1" matchOfTheNight={false} onToggled={onToggled} />
    );

    const btn = screen.getByRole('button');
    await user.click(btn);

    await waitFor(() => {
      expect(setMotnMock).toHaveBeenCalledWith('m1', true);
    });

    await waitFor(() => {
      expect(btn).toHaveTextContent('Match of the Night — Remove');
    });

    expect(onToggled).toHaveBeenCalledWith(true);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('disables the button while the request is pending', async () => {
    const user = userEvent.setup();
    let resolveFn: ((value: unknown) => void) | undefined;
    setMotnMock.mockReturnValue(new Promise((resolve) => {
      resolveFn = resolve;
    }));

    render(
      <MotnToggleButton matchId="m1" matchOfTheNight={false} />
    );

    const btn = screen.getByRole('button');
    await user.click(btn);

    await waitFor(() => {
      expect(btn).toBeDisabled();
    });

    resolveFn?.({ matchId: 'm1', matchOfTheNight: true });
    await waitFor(() => {
      expect(btn).not.toBeDisabled();
    });
  });

  it('shows an error message and keeps the original state when the API fails', async () => {
    const user = userEvent.setup();
    setMotnMock.mockRejectedValue(new Error('Network down'));

    render(
      <MotnToggleButton matchId="m1" matchOfTheNight={false} />
    );

    const btn = screen.getByRole('button');
    await user.click(btn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network down');
    });

    // State should not have flipped because the API rejected.
    expect(btn).toHaveTextContent('Mark as Match of the Night');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });
});
