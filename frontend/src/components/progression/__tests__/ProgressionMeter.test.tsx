import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import i18n from '../../../i18n';
import ProgressionMeter from '../ProgressionMeter';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('ProgressionMeter', () => {
  it.each([
    [0, '0%'],
    [50, '50%'],
    [100, '100%'],
  ])('shows %s%% and fills the bar to match', async (pct, text) => {
    render(<ProgressionMeter pct={pct} kind="callup" />);

    expect(screen.getByTestId('progression-meter-pct')).toHaveTextContent(text);
    const bar = screen.getByRole('progressbar', { name: 'Call-Up Progress' });
    await waitFor(() => expect(bar).toHaveAttribute('value', String(pct)));
  });

  it('rounds and clamps the percentage', () => {
    const { rerender } = render(<ProgressionMeter pct={66.7} kind="callup" />);
    expect(screen.getByTestId('progression-meter-pct')).toHaveTextContent('67%');

    rerender(<ProgressionMeter pct={140} kind="callup" />);
    expect(screen.getByTestId('progression-meter-pct')).toHaveTextContent('100%');
  });

  it('colours by kind and labels each kind', () => {
    const { container, rerender } = render(<ProgressionMeter pct={10} kind="promotion" />);
    expect(container.firstChild).toHaveClass('progression-meter--promotion');
    expect(screen.getByText('Promotion Progress')).toBeInTheDocument();

    rerender(<ProgressionMeter pct={10} kind="relegation" />);
    expect(container.firstChild).toHaveClass('progression-meter--relegation');
    expect(screen.getByText('Relegation Danger')).toBeInTheDocument();
  });

  it('shows a custom label and caption', () => {
    render(<ProgressionMeter pct={30} kind="callup" label="Custom" caption="Young Boys Call-Up" />);
    expect(screen.getByText('Custom')).toBeInTheDocument();
    expect(screen.getByText('Young Boys Call-Up')).toBeInTheDocument();
  });
});
