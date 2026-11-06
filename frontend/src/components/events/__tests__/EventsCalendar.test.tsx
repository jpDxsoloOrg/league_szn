import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockGetAllEvents, mockGetAllShows, mockGetAllCompanies } = vi.hoisted(() => ({
  mockGetAllEvents: vi.fn(),
  mockGetAllShows: vi.fn(),
  mockGetAllCompanies: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  eventsApi: {
    getAll: mockGetAllEvents,
    create: vi.fn(),
  },
  showsApi: {
    getAll: mockGetAllShows,
  },
  companiesApi: {
    getAll: mockGetAllCompanies,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'events.title': 'Events',
        'common.loading': 'Loading...',
        'emptyState.checkBackSoon': 'Check back soon',
        'events.filters.all': 'All',
        'events.filters.ppv': 'PPV',
        'events.filters.weekly': 'Weekly',
        'events.filters.special': 'Special',
        'events.filters.house': 'House Show',
        'events.types.ppv': 'PPV',
        'events.types.weekly': 'Weekly',
        'events.types.special': 'Special',
        'events.types.house': 'House Show',
        'events.calendar.months.january': 'January',
        'events.calendar.months.february': 'February',
        'events.calendar.months.march': 'March',
        'events.calendar.months.april': 'April',
        'events.calendar.months.may': 'May',
        'events.calendar.months.june': 'June',
        'events.calendar.months.july': 'July',
        'events.calendar.months.august': 'August',
        'events.calendar.months.september': 'September',
        'events.calendar.months.october': 'October',
        'events.calendar.months.november': 'November',
        'events.calendar.months.december': 'December',
        'events.calendar.days.sun': 'Sun',
        'events.calendar.days.mon': 'Mon',
        'events.calendar.days.tue': 'Tue',
        'events.calendar.days.wed': 'Wed',
        'events.calendar.days.thu': 'Thu',
        'events.calendar.days.fri': 'Fri',
        'events.calendar.days.sat': 'Sat',
        'events.calendar.upcoming': 'Upcoming Events',
        'events.calendar.noUpcoming': 'No upcoming events',
      };
      return translations[key] || key;
    },
  }),
}));

const { authState } = vi.hoisted(() => ({ authState: { isAdminOrModerator: false } }));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    isLoading: false,
    groups: [],
    email: null,
    playerId: null,
    isAdminOrModerator: authState.isAdminOrModerator,
    isSuperAdmin: false,
    isModerator: false,
    isWrestler: false,
    hasRole: () => false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    confirmSignUp: vi.fn(),
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  }),
}));

vi.mock('../EventsCalendar.css', () => ({}));
vi.mock('../EventCard.css', () => ({}));
vi.mock('../CreateEventModal', () => ({
  default: ({ open, preset }: { open: boolean; preset?: { name: string } | null }) => (
    open ? <div data-testid="create-event-modal">{preset?.name ?? 'blank'}</div> : null
  ),
}));

import EventsCalendar from '../EventsCalendar';

// --- Test data ---
// Use a fixed reference date: June 15, 2025
const mockEvents = [
  {
    eventId: 'e1',
    name: 'WrestleMania 42',
    eventType: 'ppv' as const,
    date: '2025-06-10T20:00:00.000Z',
    status: 'upcoming' as const,
    matchCards: [{ matchId: 'm1', position: 1, designation: 'main-event' }],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    eventId: 'e2',
    name: 'Monday Night Raw',
    eventType: 'weekly' as const,
    date: '2025-06-16T01:00:00.000Z',
    status: 'upcoming' as const,
    matchCards: [],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    eventId: 'e3',
    name: 'Saturday Night Special',
    eventType: 'special' as const,
    date: '2025-06-21T23:00:00.000Z',
    status: 'in-progress' as const,
    matchCards: [{ matchId: 'm2', position: 1, designation: 'midcard' }],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    eventId: 'e4',
    name: 'Completed Show',
    eventType: 'house' as const,
    date: '2025-05-01T20:00:00.000Z',
    status: 'completed' as const,
    matchCards: [],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
];

function renderEventsCalendar() {
  return render(
    <BrowserRouter>
      <EventsCalendar />
    </BrowserRouter>
  );
}

describe('EventsCalendar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isAdminOrModerator = false;
    window.history.pushState({}, '', '/events');
    mockGetAllShows.mockResolvedValue([]);
    mockGetAllCompanies.mockResolvedValue([]);
    // Fix the date to June 15, 2025 so calendar renders June 2025
    // shouldAdvanceTime allows promises to resolve while keeping Date fixed
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2025-06-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists the next planned show so the list agrees with the calendar', async () => {
    mockGetAllEvents.mockResolvedValue([]);
    mockGetAllShows.mockResolvedValue([
      { showId: 'sh1', companyId: 'c1', name: 'Toxic Tuesday', schedule: 'weekly', dayOfWeek: 'tuesday' },
    ]);
    renderEventsCalendar();

    const row = await screen.findByText('Toxic Tuesday', { selector: '.event-card__name' });
    expect(row.closest('.event-card')).toHaveClass('event-card--planned');
    expect(row.closest('.event-card')).toHaveTextContent('Jun');
    expect(row.closest('.event-card')).toHaveTextContent('17');
  });

  it('marks a cancelled event on the calendar and names its status', async () => {
    mockGetAllEvents.mockResolvedValue([
      { eventId: 'e-done', name: 'Finished Show', eventType: 'weekly', date: '2025-06-03', status: 'completed' },
      { eventId: 'e-off', name: 'Called Off', eventType: 'weekly', date: '2025-06-14', status: 'cancelled' },
    ]);
    mockGetAllShows.mockResolvedValue([]);
    renderEventsCalendar();

    const cancelled = await screen.findByRole('link', { name: 'Called Off (events.status.cancelled)' });
    const completed = screen.getByRole('link', { name: 'Finished Show (events.status.completed)' });
    expect(cancelled).toHaveClass('calendar-item--cancelled');
    expect(cancelled).toHaveAttribute('title', 'Called Off (events.status.cancelled)');
    expect(completed).not.toHaveClass('calendar-item--cancelled');
    expect(document.querySelector('.legend-dot--cancelled')).not.toBeNull();
  });

  it('puts the calendar ahead of past results', async () => {
    mockGetAllEvents.mockResolvedValue([
      { eventId: 'e-done', name: 'Finished Show', eventType: 'weekly', date: '2025-06-03', status: 'completed' },
    ]);
    mockGetAllShows.mockResolvedValue([]);
    renderEventsCalendar();

    await screen.findByRole('link', { name: 'Finished Show (events.status.completed)' });
    const calendar = document.querySelector('.calendar') as HTMLElement;
    const results = screen.getByRole('heading', { name: 'events.calendar.recentResults' });
    expect(calendar.compareDocumentPosition(results) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders calendar grid with day headers and event dots for the current month', async () => {
    mockGetAllEvents.mockResolvedValue(mockEvents);

    renderEventsCalendar();

    await waitFor(() => {
      expect(screen.getByText('June 2025')).toBeInTheDocument();
    });

    // Day headers
    expect(screen.getByText('Sun')).toBeInTheDocument();
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Tue')).toBeInTheDocument();
    expect(screen.getByText('Wed')).toBeInTheDocument();
    expect(screen.getByText('Thu')).toBeInTheDocument();
    expect(screen.getByText('Fri')).toBeInTheDocument();
    expect(screen.getByText('Sat')).toBeInTheDocument();

    // Day numbers in June (1-30)
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();

    // Event items rendered with title attributes for events in June
    const wrestleManiaItem = screen.getByTitle(/^WrestleMania 42 \(/);
    expect(wrestleManiaItem).toBeInTheDocument();
    expect(wrestleManiaItem).toHaveClass('calendar-item');

    // Filter tabs (some labels like "PPV" also appear in the legend, so target the container)
    const filterContainer = document.querySelector('.events-filter-tabs')!;
    expect(filterContainer).toBeInTheDocument();
    const filterButtons = filterContainer.querySelectorAll('button');
    expect(filterButtons.length).toBe(5); // All, PPV, Weekly, Special, House Show

    // Legend
    const legendItems = document.querySelectorAll('.legend-item');
    expect(legendItems.length).toBe(6); // four event types, planned shows and cancelled
  });

  it('navigates between months using previous and next buttons', async () => {
    mockGetAllEvents.mockResolvedValue(mockEvents);

    renderEventsCalendar();

    await waitFor(() => {
      expect(screen.getByText('June 2025')).toBeInTheDocument();
    });

    // Navigate to previous month (May)
    const prevButton = screen.getByRole('button', { name: 'events.calendar.previousMonth' });
    fireEvent.click(prevButton);

    expect(screen.getByText('May 2025')).toBeInTheDocument();

    // May event should now have a dot visible
    const completedShowDot = screen.getByTitle(/^Completed Show \(/);
    expect(completedShowDot).toBeInTheDocument();

    // Navigate forward twice to July
    const nextButton = screen.getByRole('button', { name: 'events.calendar.nextMonth' });
    fireEvent.click(nextButton); // back to June
    expect(screen.getByText('June 2025')).toBeInTheDocument();

    fireEvent.click(nextButton); // to July
    expect(screen.getByText('July 2025')).toBeInTheDocument();
  });

  it('filters events by event type when filter tabs are clicked', async () => {
    mockGetAllEvents.mockResolvedValue(mockEvents);

    renderEventsCalendar();

    await waitFor(() => {
      expect(screen.getByText('June 2025')).toBeInTheDocument();
    });

    // Filter tabs are buttons inside the events-filter-tabs container
    const filterContainer = document.querySelector('.events-filter-tabs')!;
    const filterButtons = filterContainer.querySelectorAll('button');
    // Order: All, PPV, Weekly, Special, House Show
    const [allBtn, ppvBtn, weeklyBtn] = Array.from(filterButtons);

    // Initially "All" filter is active — all June events have dots
    expect(screen.getByTitle(/^WrestleMania 42 \(/)).toBeInTheDocument();

    // Click PPV filter
    fireEvent.mouseDown(ppvBtn);

    // Only PPV event dot should remain
    expect(screen.getByTitle(/^WrestleMania 42 \(/)).toBeInTheDocument();
    expect(screen.queryByTitle(/^Monday Night Raw \(/)).not.toBeInTheDocument();
    expect(screen.queryByTitle(/^Saturday Night Special \(/)).not.toBeInTheDocument();

    // Click Weekly filter
    fireEvent.mouseDown(weeklyBtn);

    expect(screen.queryByTitle(/^WrestleMania 42 \(/)).not.toBeInTheDocument();
    expect(screen.getByTitle(/^Monday Night Raw \(/)).toBeInTheDocument();

    // Click All to reset
    fireEvent.mouseDown(allBtn);
    expect(screen.getByTitle(/^WrestleMania 42 \(/)).toBeInTheDocument();
  });

  it('shows upcoming events list with event cards', async () => {
    mockGetAllEvents.mockResolvedValue(mockEvents);

    renderEventsCalendar();

    await waitFor(() => {
      expect(screen.getByText('Upcoming Events')).toBeInTheDocument();
    });

    // Upcoming events section shows events with status "upcoming" or "in-progress"
    // e1 (upcoming), e2 (upcoming), e3 (in-progress) should appear in the list
    // e4 (completed) should NOT appear
    // Events appear both on the calendar grid and in the upcoming list,
    // so use getAllByText and verify at least one exists
    expect(screen.getAllByText('WrestleMania 42').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Monday Night Raw').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Saturday Night Special').length).toBeGreaterThanOrEqual(1);

    // "No upcoming events" message should NOT appear
    expect(screen.queryByText('No upcoming events')).not.toBeInTheDocument();
  });

  it('handles empty state when no events are returned', async () => {
    mockGetAllEvents.mockResolvedValue([]);

    renderEventsCalendar();

    // Empty state shows title and description (no calendar grid when zero events)
    await waitFor(() => {
      expect(screen.getByText('Events')).toBeInTheDocument();
    });
    expect(screen.getByText('Check back soon')).toBeInTheDocument();
  });

  it('hides Create Event from the public', async () => {
    mockGetAllEvents.mockResolvedValue(mockEvents);
    renderEventsCalendar();
    await screen.findByText('June 2025');
    expect(screen.queryByRole('button', { name: 'events.calendar.createEvent' })).not.toBeInTheDocument();
  });

  it('opens the create form for staff, even with no events yet', async () => {
    authState.isAdminOrModerator = true;
    mockGetAllEvents.mockResolvedValue([]);
    renderEventsCalendar();

    fireEvent.click((await screen.findAllByRole('button', { name: 'events.calendar.createEvent' }))[0]!);

    expect(screen.getByTestId('create-event-modal')).toHaveTextContent('blank');
  });

  it('opens the create form from the ?create=1 link', async () => {
    authState.isAdminOrModerator = true;
    window.history.pushState({}, '', '/events?create=1');
    mockGetAllEvents.mockResolvedValue(mockEvents);
    renderEventsCalendar();

    expect(await screen.findByTestId('create-event-modal')).toBeInTheDocument();
  });

  it('pre-fills the form when staff pick a scheduled show on the calendar', async () => {
    authState.isAdminOrModerator = true;
    mockGetAllEvents.mockResolvedValue([]);
    mockGetAllShows.mockResolvedValue([{
      showId: 's1',
      name: 'Friday Show',
      companyId: 'c1',
      schedule: 'weekly',
      dayOfWeek: 'friday',
      createdAt: '',
      updatedAt: '',
    }]);
    renderEventsCalendar();

    fireEvent.click((await screen.findAllByRole('button', { name: 'Friday Show' }))[0]!);

    expect(screen.getByTestId('create-event-modal')).toHaveTextContent('Friday Show');
  });

  it('leads with the live event', async () => {
    mockGetAllEvents.mockResolvedValue(mockEvents);
    renderEventsCalendar();

    expect(await screen.findByRole('heading', { level: 2, name: 'Saturday Night Special' })).toBeInTheDocument();
  });
});
