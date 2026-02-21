import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockCreateEvent, mockGetAllEvents, mockDeleteEvent, mockGetAllSeasons } = vi.hoisted(() => ({
  mockCreateEvent: vi.fn(),
  mockGetAllEvents: vi.fn(),
  mockDeleteEvent: vi.fn(),
  mockGetAllSeasons: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  eventsApi: {
    create: mockCreateEvent,
    getAll: mockGetAllEvents,
    delete: mockDeleteEvent,
  },
  seasonsApi: {
    getAll: mockGetAllSeasons,
  },
}));

vi.mock('react-i18next', () => ({
  // Keep `t` stable across renders so useEffect([t]) in CreateEvent
  // does not repeatedly reload events during assertions.
  useTranslation: () => ({
    t: translationMock,
  }),
}));

const translations: Record<string, string> = {
  'events.admin.createEvent': 'Create Event',
  'events.admin.name': 'Event Name',
  'events.admin.namePlaceholder': 'e.g., WrestleMania',
  'events.admin.eventType': 'Event Type',
  'events.types.ppv': 'PPV',
  'events.types.weekly': 'Weekly',
  'events.types.special': 'Special',
  'events.types.house': 'House Show',
  'events.admin.date': 'Date & Time',
  'events.admin.venue': 'Venue',
  'events.admin.venuePlaceholder': 'e.g., Madison Square Garden',
  'events.admin.description': 'Description',
  'events.admin.descriptionPlaceholder': 'Event description...',
  'events.admin.themeColor': 'Theme Color',
  'events.admin.season': 'Season',
  'events.admin.noSeason': '-- No Season --',
  'events.admin.saveEvent': 'Save Event',
  'events.admin.saveSuccess': 'Event saved successfully!',
  'events.admin.existingEvents': 'Existing Events',
  'events.admin.loadingEvents': 'Loading events...',
  'events.admin.noEvents': 'No events yet. Create one below.',
  'events.admin.deleteEvent': 'Delete',
  'events.admin.deleteEventError': 'Failed to delete event',
  'events.admin.loadEventsError': 'Localized load events error',
  'events.admin.confirmDeleteEvent': 'Are you sure you want to delete "{{name}}"?',
  'events.admin.hasMatches': 'Has matches',
  'common.saving': 'Saving...',
  'common.delete': 'Delete',
};

const translationMock = (key: string, fallback?: string) => translations[key] || fallback || key;

vi.mock('../CreateEvent.css', () => ({}));

import CreateEvent from '../CreateEvent';

// --- Test data ---
const mockSeasons = [
  {
    seasonId: 's1',
    name: 'Season 1',
    startDate: '2025-01-01T00:00:00.000Z',
    status: 'active' as const,
    createdAt: '2025-01-01',
    updatedAt: '2025-01-01',
  },
  {
    seasonId: 's2',
    name: 'Season 2',
    startDate: '2025-06-01T00:00:00.000Z',
    status: 'completed' as const,
    createdAt: '2025-06-01',
    updatedAt: '2025-06-01',
  },
];

const mockEvents = [
  {
    eventId: 'e1',
    name: 'Monday Nitro',
    eventType: 'weekly' as const,
    date: '2026-01-15T20:00:00.000Z',
    status: 'upcoming' as const,
    matchCards: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    eventId: 'e2',
    name: 'WrestleMania',
    eventType: 'ppv' as const,
    date: '2026-04-05T22:00:00.000Z',
    status: 'upcoming' as const,
    matchCards: [
      { position: 1, matchId: 'm-1', designation: 'main-event' as const },
    ],
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
];

function renderCreateEvent() {
  return render(
    <BrowserRouter>
      <CreateEvent />
    </BrowserRouter>
  );
}

describe('CreateEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllSeasons.mockResolvedValue(mockSeasons);
    mockGetAllEvents.mockResolvedValue([]);
    mockDeleteEvent.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('renders form with all required fields', async () => {
    renderCreateEvent();

    // Title
    expect(screen.getByText('Create Event')).toBeInTheDocument();

    // Form fields
    expect(screen.getByText('Event Name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g., WrestleMania')).toBeInTheDocument();

    expect(screen.getByText('Event Type')).toBeInTheDocument();
    const typeSelect = document.querySelector('select.form-select') as HTMLSelectElement;
    expect(typeSelect).toBeInTheDocument();
    expect(typeSelect.value).toBe('weekly'); // default

    expect(screen.getByText('Date & Time')).toBeInTheDocument();
    expect(screen.getByText('Venue')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Theme Color')).toBeInTheDocument();
    expect(screen.getByText('Season')).toBeInTheDocument();

    // Save button present and disabled (no name or date yet)
    const saveButton = screen.getByText('Save Event');
    expect(saveButton).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
  });

  it('populates season selection dropdown with fetched seasons', async () => {
    renderCreateEvent();

    await waitFor(() => {
      expect(screen.getByText('Season 1')).toBeInTheDocument();
    });

    // Season dropdown has the default empty option plus both seasons
    expect(screen.getByText('-- No Season --')).toBeInTheDocument();
    expect(screen.getByText('Season 1')).toBeInTheDocument();
    expect(screen.getByText('Season 2')).toBeInTheDocument();

    // The season select options have the correct values
    const seasonSelect = screen.getAllByRole('combobox')[1]; // second select (first is eventType)
    expect(seasonSelect).toBeInTheDocument();
  });

  it('renders theme color preset buttons and custom color input', () => {
    mockGetAllSeasons.mockResolvedValue([]);

    renderCreateEvent();

    // 8 preset color buttons
    const colorButtons = document.querySelectorAll('.color-preset');
    expect(colorButtons.length).toBe(8);

    // First preset should be selected by default (#d4af37)
    expect(colorButtons[0]).toHaveClass('selected');

    // Custom color input
    const colorInput = document.querySelector('input[type="color"]') as HTMLInputElement;
    expect(colorInput).toBeInTheDocument();
    expect(colorInput.value).toBe('#d4af37');

    // Click a different color preset
    fireEvent.click(colorButtons[2]); // #1e40af
    expect(colorButtons[2]).toHaveClass('selected');
    expect(colorButtons[0]).not.toHaveClass('selected');
  });

  it('validates required fields and submits event successfully', async () => {
    mockCreateEvent.mockResolvedValue({
      eventId: 'e-new',
      name: 'Royal Rumble',
      eventType: 'ppv',
      date: '2025-07-20T20:00:00.000Z',
      status: 'upcoming',
      matchCards: [],
      createdAt: '2025-01-01',
      updatedAt: '2025-01-01',
    });

    renderCreateEvent();

    await waitFor(() => {
      expect(screen.getByText('Season 1')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('Save Event');

    // Button disabled initially (no name or date)
    expect(saveButton).toBeDisabled();

    // Fill name only -- still disabled (no date)
    const nameInput = screen.getByPlaceholderText('e.g., WrestleMania');
    fireEvent.change(nameInput, { target: { value: 'Royal Rumble' } });
    expect(saveButton).toBeDisabled();

    // Fill date -- now enabled
    const dateInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2025-07-20T20:00' } });
    expect(saveButton).not.toBeDisabled();

    // Select PPV event type
    const typeSelects = screen.getAllByRole('combobox');
    fireEvent.change(typeSelects[0], { target: { value: 'ppv' } });

    // Select season
    fireEvent.change(typeSelects[1], { target: { value: 's1' } });

    // Submit
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Royal Rumble',
          eventType: 'ppv',
          seasonId: 's1',
          themeColor: '#d4af37',
        })
      );
    });

    // Success message
    await waitFor(() => {
      expect(screen.getByText('Event saved successfully!')).toBeInTheDocument();
    });

    // Form should be reset after save
    expect((nameInput as HTMLInputElement).value).toBe('');
  });

  it('renders existing events list from fetched events', async () => {
    mockGetAllEvents.mockResolvedValue(mockEvents);
    renderCreateEvent();

    await waitFor(() => {
      expect(screen.getByText('Monday Nitro')).toBeInTheDocument();
    });

    expect(screen.getByText('WrestleMania')).toBeInTheDocument();
    expect(screen.queryByText('No events yet. Create one below.')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1);
    expect(screen.getByText('Has matches')).toBeInTheDocument();
  });

  it('deletes selected event and removes it from UI on success', async () => {
    mockGetAllEvents.mockResolvedValue(mockEvents);
    renderCreateEvent();

    await waitFor(() => {
      expect(screen.getByText('Monday Nitro')).toBeInTheDocument();
    });

    const [firstDeleteButton] = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(firstDeleteButton);

    await waitFor(() => {
      expect(mockDeleteEvent).toHaveBeenCalledWith('e1');
    });

    await waitFor(() => {
      expect(screen.queryByText('Monday Nitro')).not.toBeInTheDocument();
    });
    expect(screen.getByText('WrestleMania')).toBeInTheDocument();
    expect(screen.queryByText('No events yet. Create one below.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.getByText('Has matches')).toBeInTheDocument();
  });

  it('shows error feedback when deleting an event fails', async () => {
    mockGetAllEvents.mockResolvedValue(mockEvents);
    mockDeleteEvent.mockRejectedValue(new Error('Could not delete event'));
    renderCreateEvent();

    await waitFor(() => {
      expect(screen.getByText('Monday Nitro')).toBeInTheDocument();
    });

    const [firstDeleteButton] = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(firstDeleteButton);

    await waitFor(() => {
      expect(mockDeleteEvent).toHaveBeenCalledWith('e1');
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete event');
    expect(screen.getByText('Monday Nitro')).toBeInTheDocument();
  });

  it('clears stale delete error when creating a new event', async () => {
    mockGetAllEvents.mockResolvedValue(mockEvents);
    mockDeleteEvent.mockRejectedValue(new Error('Could not delete event'));
    mockCreateEvent.mockResolvedValue({
      eventId: 'e-new',
      name: 'Royal Rumble',
      eventType: 'ppv',
      date: '2025-07-20T20:00:00.000Z',
      status: 'upcoming',
      matchCards: [],
      createdAt: '2025-01-01',
      updatedAt: '2025-01-01',
    });

    renderCreateEvent();

    await waitFor(() => {
      expect(screen.getByText('Monday Nitro')).toBeInTheDocument();
    });

    const [firstDeleteButton] = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(firstDeleteButton);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete event');

    const nameInput = screen.getByPlaceholderText('e.g., WrestleMania');
    fireEvent.change(nameInput, { target: { value: 'Royal Rumble' } });
    const dateInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2025-07-20T20:00' } });

    fireEvent.click(screen.getByText('Save Event'));

    await waitFor(() => {
      expect(mockCreateEvent).toHaveBeenCalled();
    });

    expect(screen.queryByText('Could not delete event')).not.toBeInTheDocument();
    expect(screen.getByText('Event saved successfully!')).toBeInTheDocument();
  });

  it('shows translated fallback when event loading fails with non-Error rejection', async () => {
    mockGetAllEvents.mockRejectedValue('network down');
    renderCreateEvent();

    expect(await screen.findByRole('alert')).toHaveTextContent('Localized load events error');
  });
});
