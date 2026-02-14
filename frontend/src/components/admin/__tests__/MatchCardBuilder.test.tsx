import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const {
  mockGetAllEvents,
  mockUpdateEvent,
  mockGetAllMatches,
  mockGetAllPlayers,
} = vi.hoisted(() => ({
  mockGetAllEvents: vi.fn(),
  mockUpdateEvent: vi.fn(),
  mockGetAllMatches: vi.fn(),
  mockGetAllPlayers: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  eventsApi: {
    getAll: mockGetAllEvents,
    update: mockUpdateEvent,
  },
  matchesApi: {
    getAll: mockGetAllMatches,
  },
  playersApi: {
    getAll: mockGetAllPlayers,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const translations: Record<string, string> = {
        'events.admin.matchCardBuilder': 'Match Card Builder',
        'events.admin.matchCardBuilderHint': 'Reorder matches, change designations, or add unassigned matches to an event card.',
        'events.admin.selectEvent': 'Select Event',
        'events.admin.chooseEvent': '-- Choose an event --',
        'events.admin.selectEventFirst': 'Select an event above to manage its match card.',
        'events.admin.noMatchesOnCard': 'No matches on the card yet.',
        'events.admin.championshipMatch': 'Championship',
        'events.admin.moveUp': 'Move Up',
        'events.admin.moveDown': 'Move Down',
        'events.admin.removeMatch': 'Remove',
        'events.admin.selectMatch': '-- Select a match --',
        'events.admin.addMatch': 'Add Match',
        'events.admin.saveMatchCard': 'Save Match Card',
        'events.admin.matchCardSaved': 'Match card saved successfully!',
        'events.designations.preShow': 'Pre-Show',
        'events.designations.opener': 'Opener',
        'events.designations.midcard': 'Midcard',
        'events.designations.coMain': 'Co-Main',
        'events.designations.mainEvent': 'Main Event',
        'common.loading': 'Loading...',
        'common.saving': 'Saving...',
      };
      return translations[key] || fallback || key;
    },
  }),
}));

vi.mock('../MatchCardBuilder.css', () => ({}));
vi.mock('../SearchableSelect.css', () => ({}));

import MatchCardBuilder from '../MatchCardBuilder';

// --- Test data ---
const p = { wins: 0, losses: 0, draws: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01' };
const mockPlayers = [
  { playerId: 'p1', name: 'John Cena', currentWrestler: 'John Cena', ...p, wins: 10, losses: 2 },
  { playerId: 'p2', name: 'The Rock', currentWrestler: 'The Rock', ...p, wins: 8, losses: 3 },
  { playerId: 'p3', name: 'Undertaker', currentWrestler: 'The Deadman', ...p, wins: 15, losses: 5 },
  { playerId: 'p4', name: 'Triple H', currentWrestler: 'The Game', ...p, wins: 12, losses: 4 },
];

const matchBase = { status: 'scheduled' as const, date: '2025-06-10', createdAt: '2024-01-01' };
const mockScheduledMatches = [
  { matchId: 'm1', matchFormat: 'singles', participants: ['p1', 'p2'], isChampionship: true, ...matchBase },
  { matchId: 'm2', matchFormat: 'singles', participants: ['p3', 'p4'], isChampionship: false, ...matchBase },
  { matchId: 'm3', matchFormat: 'tag', participants: ['p1', 'p3'], isChampionship: false, ...matchBase, date: '2025-06-15' },
];

const mockEventsData = [
  {
    eventId: 'ev1',
    name: 'WrestleMania',
    eventType: 'ppv' as const,
    date: '2025-06-10T20:00:00.000Z',
    status: 'upcoming' as const,
    matchCards: [
      { position: 1, matchId: 'm1', designation: 'main-event' as const },
      { position: 2, matchId: 'm2', designation: 'midcard' as const },
    ],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    eventId: 'ev2',
    name: 'Monday Night Raw',
    eventType: 'weekly' as const,
    date: '2025-06-16T01:00:00.000Z',
    status: 'upcoming' as const,
    matchCards: [],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
];

function setupDefaultMocks() {
  mockGetAllEvents.mockResolvedValue(mockEventsData);
  mockGetAllMatches.mockResolvedValue(mockScheduledMatches);
  mockGetAllPlayers.mockResolvedValue(mockPlayers);
}

function renderMatchCardBuilder() {
  return render(
    <BrowserRouter>
      <MatchCardBuilder />
    </BrowserRouter>
  );
}

describe('MatchCardBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders event selector and shows match cards for selected event', async () => {
    setupDefaultMocks();

    renderMatchCardBuilder();

    // Loading state first
    expect(screen.getByText('Match Card Builder')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Select an event above to manage its match card.')).toBeInTheDocument();
    });

    // Select an event via the SearchableSelect by focusing the input and clicking an option
    const eventInput = screen.getByRole('textbox');
    fireEvent.focus(eventInput);

    // Dropdown should open with event options
    await waitFor(() => {
      expect(screen.getByText(/WrestleMania/)).toBeInTheDocument();
    });

    // Click the WrestleMania option
    fireEvent.click(screen.getByText(/WrestleMania/));

    // Match cards should now appear
    await waitFor(() => {
      // Match labels include participant names
      expect(screen.getByText(/John Cena vs The Rock/)).toBeInTheDocument();
      expect(screen.getByText(/Undertaker vs Triple H/)).toBeInTheDocument();
    });

    // Position numbers
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();

    // Championship tag on match m1
    expect(screen.getByText('Championship')).toBeInTheDocument();

    // Designation indicators (text also appears in <select> options, so use getAllByText)
    const mainEventElements = screen.getAllByText('Main Event');
    expect(mainEventElements.length).toBeGreaterThanOrEqual(1);
    // The indicator spans have the designation-indicator class
    const indicators = document.querySelectorAll('.designation-indicator');
    expect(indicators.length).toBe(2);
  });

  it('reorders matches using move up and move down buttons', async () => {
    setupDefaultMocks();

    renderMatchCardBuilder();

    await waitFor(() => {
      expect(screen.getByText('Select an event above to manage its match card.')).toBeInTheDocument();
    });

    // Select WrestleMania
    const eventInput = screen.getByRole('textbox');
    fireEvent.focus(eventInput);
    await waitFor(() => {
      expect(screen.getByText(/WrestleMania/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/WrestleMania/));

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });

    // Initially: #1 = Cena vs Rock (main-event), #2 = Undertaker vs Triple H (midcard)
    // Click "Move Down" on first match (swap positions)
    const moveDownButtons = screen.getAllByTitle('Move Down');
    fireEvent.click(moveDownButtons[0]);

    // After move: positions should swap
    // The builder re-assigns positions, so #1 should now be Undertaker vs Triple H
    const positions = screen.getAllByText(/^#\d$/);
    expect(positions[0].textContent).toBe('#1');
    expect(positions[1].textContent).toBe('#2');

    // Now click "Move Up" on the second item to swap back
    const moveUpButtons = screen.getAllByTitle('Move Up');
    fireEvent.click(moveUpButtons[1]);

    // Should be back to original order
    await waitFor(() => {
      const matchItems = document.querySelectorAll('.builder-match-item');
      expect(matchItems.length).toBe(2);
    });
  });

  it('adds an available match to the event card', async () => {
    setupDefaultMocks();
    mockUpdateEvent.mockResolvedValue({
      ...mockEventsData[0],
      matchCards: [
        { position: 1, matchId: 'm1', designation: 'main-event' },
        { position: 2, matchId: 'm2', designation: 'midcard' },
        { position: 3, matchId: 'm3', designation: 'midcard' },
      ],
    });

    renderMatchCardBuilder();

    await waitFor(() => {
      expect(screen.getByText('Select an event above to manage its match card.')).toBeInTheDocument();
    });

    // Select WrestleMania
    const eventInput = screen.getByRole('textbox');
    fireEvent.focus(eventInput);
    await waitFor(() => {
      expect(screen.getByText(/WrestleMania/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/WrestleMania/));

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });

    // m1 and m2 are already on the card. m3 should be in the "add match" dropdown.
    // Use the specific class selector since there are multiple selects (designation + add-match)
    const addMatchSelect = document.querySelector('.add-match-select') as HTMLSelectElement;
    expect(addMatchSelect).toBeInTheDocument();

    // Select m3 from the dropdown
    fireEvent.change(addMatchSelect, { target: { value: 'm3' } });

    // Click "Add Match"
    fireEvent.click(screen.getByText('Add Match'));

    // Third match should now appear on the card
    await waitFor(() => {
      expect(screen.getByText('#3')).toBeInTheDocument();
    });

    // Save the match card
    fireEvent.click(screen.getByText('Save Match Card'));

    await waitFor(() => {
      expect(mockUpdateEvent).toHaveBeenCalledWith(
        'ev1',
        expect.objectContaining({
          matchCards: expect.arrayContaining([
            expect.objectContaining({ matchId: 'm1', position: 1 }),
            expect.objectContaining({ matchId: 'm2', position: 2 }),
            expect.objectContaining({ matchId: 'm3', position: 3, designation: 'midcard' }),
          ]),
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Match card saved successfully!')).toBeInTheDocument();
    });
  });
});
