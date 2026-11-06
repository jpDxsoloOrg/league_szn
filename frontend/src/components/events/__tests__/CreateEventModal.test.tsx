import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Company, Show } from '../../../types';

const { mockCreateEvent, mockGetSeasons, mockNavigate } = vi.hoisted(() => ({
  mockCreateEvent: vi.fn(),
  mockGetSeasons: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  eventsApi: { create: mockCreateEvent },
  seasonsApi: { getAll: mockGetSeasons },
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mockNavigate,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => (typeof fallback === 'string' ? fallback : key),
  }),
}));

import CreateEventModal from '../CreateEventModal';

const shows: Show[] = [{
  showId: 'show1',
  name: 'Raw',
  companyId: 'co1',
  schedule: 'weekly',
  imageUrl: 'https://example.com/raw.png',
  createdAt: '',
  updatedAt: '',
}];
const companies: Company[] = [{ companyId: 'co1', name: 'League', createdAt: '', updatedAt: '' }];

function renderModal(props: Partial<Parameters<typeof CreateEventModal>[0]> = {}) {
  return render(
    <MemoryRouter>
      <CreateEventModal open onClose={vi.fn()} shows={[]} companies={[]} {...props} />
    </MemoryRouter>,
  );
}

describe('CreateEventModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSeasons.mockResolvedValue([]);
    mockCreateEvent.mockResolvedValue({ eventId: 'new-event' });
  });

  it.each([
    ['events.types.ppv', 'ppv'],
    ['events.types.weekly', 'weekly'],
    ['events.types.special', 'special'],
    ['events.types.house', 'house'],
  ])('creates a %s event and opens it', async (typeLabel, eventType) => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('radio', { name: typeLabel }));
    await user.type(screen.getByLabelText('Event Name'), 'Summer Slam');
    await user.clear(screen.getByLabelText('Date'));
    await user.type(screen.getByLabelText('Date'), '2026-08-01');
    await user.click(screen.getByRole('button', { name: 'Create Event' }));

    await waitFor(() => {
      expect(mockCreateEvent).toHaveBeenCalledWith({ name: 'Summer Slam', eventType, date: '2026-08-01' });
    });
    expect(mockNavigate).toHaveBeenCalledWith('/events/new-event');
  });

  it('requires a name', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: 'Create Event' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Enter an event name.');
    expect(mockCreateEvent).not.toHaveBeenCalled();
  });

  it('sends a preset show with its company and image', async () => {
    const user = userEvent.setup();
    renderModal({
      shows,
      companies,
      preset: { name: 'Raw', eventType: 'weekly', date: '2026-08-03', showId: 'show1', companyId: 'co1' },
    });

    await user.click(screen.getByRole('button', { name: 'Create Event' }));

    await waitFor(() => {
      expect(mockCreateEvent).toHaveBeenCalledWith({
        name: 'Raw',
        eventType: 'weekly',
        date: '2026-08-03',
        companyIds: ['co1'],
        showId: 'show1',
        imageUrl: 'https://example.com/raw.png',
      });
    });
  });

  it('keeps the form open and shows the error when saving fails', async () => {
    const user = userEvent.setup();
    mockCreateEvent.mockRejectedValue(new Error('Nope'));
    renderModal();

    await user.type(screen.getByLabelText('Event Name'), 'Night Show');
    await user.click(screen.getByRole('button', { name: 'Create Event' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Nope');
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Create Event' })).toBeEnabled();
  });
});
