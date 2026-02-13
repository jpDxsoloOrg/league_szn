import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockGetRecords } = vi.hoisted(() => ({
  mockGetRecords: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  statisticsApi: { getRecords: mockGetRecords },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'statistics.recordBook.title': 'Record Book',
        'statistics.recordBook.categories.overall': 'Overall',
        'statistics.recordBook.categories.championships': 'Championships',
        'statistics.recordBook.categories.streaks': 'Streaks',
        'statistics.recordBook.categories.matchTypes': 'Match Types',
        'statistics.recordBook.setOn': 'Set on',
        'statistics.recordBook.noRecords': 'No records available yet.',
        'statistics.recordBook.activeThreats': 'Active Threats',
        'statistics.recordBook.activeThreatsDesc': 'Records that may soon be broken',
        'statistics.recordBook.currentHolder': 'Current Holder',
        'statistics.recordBook.challenger': 'Challenger',
        'statistics.nav.playerStats': 'Player Stats',
        'statistics.nav.leaderboards': 'Leaderboards',
        'statistics.nav.achievements': 'Achievements',
        'common.loading': 'Loading...',
      };
      return map[key] || key;
    },
  }),
}));

vi.mock('../RecordBook.css', () => ({}));

import RecordBook from '../RecordBook';

// --- Test data ---
const mockRecordsData = {
  records: {
    overall: [
      {
        recordName: 'Most Career Wins',
        holderName: 'John Cena',
        wrestlerName: 'The Champ',
        value: 45,
        date: '2024-06-01',
        description: 'Most wins in league history',
      },
      {
        recordName: 'Highest Win Percentage',
        holderName: 'The Rock',
        wrestlerName: 'The Great One',
        value: '78.5%',
        date: '2024-05-15',
        description: 'Best career win rate (min 10 matches)',
      },
    ],
    championships: [
      {
        recordName: 'Longest Title Reign',
        holderName: 'Undertaker',
        wrestlerName: 'The Deadman',
        value: 365,
        date: '2023-12-01',
        description: 'Longest continuous championship reign',
      },
    ],
    streaks: [],
    matchTypes: [],
  },
  activeThreats: [
    {
      recordName: 'Most Career Wins',
      currentHolder: 'John Cena',
      currentValue: 45,
      threatPlayer: 'Triple H',
      threatValue: 42,
      gapDescription: 'Only 3 wins behind',
    },
  ],
};

function renderComponent() {
  return render(
    <BrowserRouter>
      <RecordBook />
    </BrowserRouter>
  );
}

describe('RecordBook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders record cards for the default Overall category with holder details', async () => {
    mockGetRecords.mockResolvedValue(mockRecordsData);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Record Book')).toBeInTheDocument();
    });

    // Record names displayed (Most Career Wins appears in both records and threats)
    expect(screen.getAllByText('Most Career Wins').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Highest Win Percentage')).toBeInTheDocument();

    // Record holders shown in record cards
    const recordCards = document.querySelectorAll('.rb-record-card');
    expect(recordCards).toHaveLength(2);
    expect(recordCards[0]).toHaveTextContent('John Cena');
    expect(recordCards[0]).toHaveTextContent('(The Champ)');
    expect(recordCards[1]).toHaveTextContent('The Rock');

    // Record values
    const recordValues = document.querySelectorAll('.rb-record-value');
    expect(recordValues[0]).toHaveTextContent('45');
    expect(recordValues[1]).toHaveTextContent('78.5%');

    // Descriptions
    expect(screen.getByText('Most wins in league history')).toBeInTheDocument();

    // Dates
    expect(screen.getByText(/Set on 2024-06-01/)).toBeInTheDocument();
  });

  it('displays active threats section showing challenger info', async () => {
    mockGetRecords.mockResolvedValue(mockRecordsData);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Active Threats')).toBeInTheDocument();
    });

    expect(screen.getByText('Records that may soon be broken')).toBeInTheDocument();
    expect(screen.getByText('Triple H')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Only 3 wins behind')).toBeInTheDocument();
  });

  it('switches to a different category tab and shows empty state', async () => {
    const user = userEvent.setup();
    mockGetRecords.mockResolvedValue(mockRecordsData);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Record Book')).toBeInTheDocument();
    });

    // Switch to Championships tab
    await user.click(screen.getByText('Championships'));

    await waitFor(() => {
      expect(screen.getByText('Longest Title Reign')).toBeInTheDocument();
      expect(screen.getByText('Undertaker')).toBeInTheDocument();
    });

    // Switch to Streaks tab (empty)
    await user.click(screen.getByText('Streaks'));

    await waitFor(() => {
      expect(screen.getByText('No records available yet.')).toBeInTheDocument();
    });
  });
});
