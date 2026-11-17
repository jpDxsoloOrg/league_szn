import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import i18n from '../../../i18n';
import GoalChecklist from '../GoalChecklist';
import type { ProgressionGoalDetail } from '../../../types/progression';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

function goal(overrides: Partial<ProgressionGoalDetail> & Pick<ProgressionGoalDetail, 'goalId' | 'metric' | 'threshold'>): ProgressionGoalDetail {
  return { weight: 1, direction: 'atLeast', current: 0, met: false, ...overrides };
}

describe('GoalChecklist', () => {
  it('marks a met goal and shows current / threshold', () => {
    render(<GoalChecklist goals={[goal({ goalId: 'g1', metric: 'matchesCompeted', threshold: 10, current: 12, met: true })]} />);

    const row = screen.getByTestId('goal-g1');
    expect(row).toHaveClass('goal-checklist__item--met');
    expect(within(row).getByText(/Compete in 10 matches/)).toBeInTheDocument();
    expect(within(row).getByText('(met)')).toBeInTheDocument();
    expect(within(row).getByText('12 / 10')).toBeInTheDocument();
    expect(row.querySelector('progress')).toHaveAttribute('value', '100');
  });

  it('shows an unmet goal with a partial mini bar', () => {
    render(<GoalChecklist goals={[goal({ goalId: 'g2', metric: 'wins', threshold: 5, current: 2 })]} />);

    const row = screen.getByTestId('goal-g2');
    expect(row).not.toHaveClass('goal-checklist__item--met');
    expect(within(row).getByText(/Win 5 matches/)).toBeInTheDocument();
    expect(within(row).getByText('(not met yet)')).toBeInTheDocument();
    expect(within(row).getByText('2 / 5')).toBeInTheDocument();
    expect(row.querySelector('progress')).toHaveAttribute('value', '40');
  });

  it('labels parameterised goals', () => {
    render(
      <GoalChecklist
        goals={[
          goal({ goalId: 'stars', metric: 'avgStarRating', threshold: 3, current: 3.4, met: true, params: { minRatedMatches: 5 } }),
          goal({ goalId: 'promos', metric: 'promosWithReactions', threshold: 3, current: 1, params: { minReactions: 3 } }),
        ]}
      />,
    );

    const stars = screen.getByTestId('goal-stars');
    expect(within(stars).getByText(/Average 3\.0★ over at least 5 rated matches/)).toBeInTheDocument();
    expect(within(stars).getByText('3.4★ / 3.0★')).toBeInTheDocument();
    expect(within(screen.getByTestId('goal-promos')).getByText(/Cut 3 promos with at least 3 reactions/)).toBeInTheDocument();
  });

  it('labels the promotion and relegation (DMV-02) goals', () => {
    render(
      <GoalChecklist
        goals={[
          goal({ goalId: 'loss', metric: 'lossPct', threshold: 70, current: 75, met: true, params: { lastMatches: 8 } }),
          goal({ goalId: 'idle', metric: 'daysSinceLastMatch', threshold: 30, current: 12 }),
          goal({ goalId: 'low', metric: 'avgStarRatingBelow', threshold: 3, current: 2.5, params: { minRatedMatches: 5 } }),
          goal({ goalId: 'rank', metric: 'contenderRankBest', threshold: 3, current: 2, met: true, direction: 'atMost' }),
          goal({ goalId: 'streak', metric: 'currentLossStreak', threshold: 4, current: 1 }),
        ]}
      />,
    );

    expect(within(screen.getByTestId('goal-loss')).getByText(/Lose 70% or more of the last 8 matches/)).toBeInTheDocument();
    expect(within(screen.getByTestId('goal-loss')).getByText('75% / 70%')).toBeInTheDocument();
    expect(within(screen.getByTestId('goal-idle')).getByText(/Go 30 days without a match/)).toBeInTheDocument();
    const low = screen.getByTestId('goal-low');
    expect(within(low).getByText(/Average 2\.0★ or less over at least 5 rated matches/)).toBeInTheDocument();
    expect(within(low).getByText('2.5★ / 2.0★')).toBeInTheDocument();
    expect(within(screen.getByTestId('goal-rank')).getByText(/top 3 contenders for a division title/)).toBeInTheDocument();
    expect(within(screen.getByTestId('goal-streak')).getByText(/Lose 4 matches in a row/)).toBeInTheDocument();
  });

  it('explains a null metric instead of showing a number', () => {
    render(
      <GoalChecklist
        goals={[
          goal({ goalId: 'stars', metric: 'avgStarRating', threshold: 3, current: null, params: { minRatedMatches: 5 } }),
          goal({ goalId: 'pct', metric: 'winPct', threshold: 60, current: null }),
        ]}
      />,
    );

    const stars = screen.getByTestId('goal-stars');
    expect(within(stars).getByText('Needs 5 rated matches')).toBeInTheDocument();
    expect(stars.querySelector('progress')).toHaveAttribute('value', '0');
    expect(within(screen.getByTestId('goal-pct')).getByText('— / 60%')).toBeInTheDocument();
  });

  it('renders nothing with no goals', () => {
    const { container } = render(<GoalChecklist goals={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
