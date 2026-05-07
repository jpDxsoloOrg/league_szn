import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '../../../i18n';

// --- Hoisted mocks ---
const { mockLocationsApi } = vi.hoisted(() => ({
  mockLocationsApi: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    bulkImport: vi.fn(),
  },
}));

vi.mock('../../../services/api', () => ({
  locationsApi: mockLocationsApi,
}));

vi.mock('../ManageLocations.css', () => ({}));

import ManageLocations from '../ManageLocations';
import type { Location } from '../../../types/location';

const sampleLocations: Location[] = [
  {
    locationId: 'loc-1',
    name: 'Madison Square Garden',
    city: 'New York',
    state: 'NY',
    country: 'USA',
    capacity: 20789,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    locationId: 'loc-2',
    name: 'United Center',
    city: 'Chicago',
    state: 'IL',
    country: 'USA',
    capacity: 23500,
    createdAt: '2024-01-02',
    updatedAt: '2024-01-02',
  },
];

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('ManageLocations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocationsApi.list.mockResolvedValue(sampleLocations);
  });

  it('renders the locations table after loading', async () => {
    render(<ManageLocations />);

    expect(screen.getByRole('status')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Madison Square Garden')).toBeInTheDocument();
    });
    expect(screen.getByText('United Center')).toBeInTheDocument();
    expect(screen.getByText('20,789')).toBeInTheDocument();
    expect(screen.getByText('23,500')).toBeInTheDocument();
  });

  it('shows the empty state when there are no locations', async () => {
    mockLocationsApi.list.mockResolvedValue([]);
    render(<ManageLocations />);
    await waitFor(() => {
      expect(screen.getByText('No locations yet')).toBeInTheDocument();
    });
  });

  it('opens the add form and submits a new location', async () => {
    const created: Location = {
      locationId: 'loc-3',
      name: 'T-Mobile Arena',
      city: 'Las Vegas',
      capacity: 20000,
      createdAt: '2024-01-03',
      updatedAt: '2024-01-03',
    };
    mockLocationsApi.create.mockResolvedValue(created);
    const user = userEvent.setup();

    render(<ManageLocations />);
    await waitFor(() => {
      expect(screen.getByText('Madison Square Garden')).toBeInTheDocument();
    });

    await user.click(screen.getAllByRole('button', { name: 'Add Location' })[0]!);

    await user.type(screen.getByLabelText('Name *'), 'T-Mobile Arena');
    await user.type(screen.getByLabelText('City'), 'Las Vegas');
    await user.type(screen.getByLabelText('Capacity'), '20000');

    // Submit button shares the "Add Location" label; pick the form's submit button
    const submitButtons = screen.getAllByRole('button', { name: 'Add Location' });
    await user.click(submitButtons[submitButtons.length - 1]!);

    await waitFor(() => {
      expect(mockLocationsApi.create).toHaveBeenCalledWith({
        name: 'T-Mobile Arena',
        city: 'Las Vegas',
        capacity: 20000,
      });
    });
    await waitFor(() => {
      expect(screen.getByText('Location created')).toBeInTheDocument();
    });
  });

  it('imports a JSON bulk payload and surfaces the dedupe summary', async () => {
    mockLocationsApi.bulkImport.mockResolvedValue({
      created: 2,
      skipped: 1,
      skippedNames: ['Madison Square Garden'],
    });
    const user = userEvent.setup();

    render(<ManageLocations />);
    await waitFor(() => {
      expect(screen.getByText('Madison Square Garden')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Bulk Import' }));

    const textarea = await screen.findByLabelText(
      /Paste JSON array or CSV with header row/i,
    );
    const json = JSON.stringify([
      { name: 'Tokyo Dome' },
      { name: 'Wembley Stadium' },
      { name: 'Madison Square Garden' },
    ]);
    fireEvent.change(textarea, { target: { value: json } });

    await user.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => {
      expect(mockLocationsApi.bulkImport).toHaveBeenCalledWith({
        locations: [
          { name: 'Tokyo Dome' },
          { name: 'Wembley Stadium' },
          { name: 'Madison Square Garden' },
        ],
      });
    });

    await waitFor(() => {
      expect(screen.getAllByText('Created 2 · Skipped 1').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Import result')).toBeInTheDocument();

    // Skipped names are hidden until the toggle is clicked
    expect(screen.queryByText('Madison Square Garden', { selector: 'li' })).toBeNull();
    await user.click(
      screen.getByRole('button', { name: /Show skipped names/i }),
    );
    expect(
      screen.getByText('Madison Square Garden', { selector: 'li' }),
    ).toBeInTheDocument();
  });

  it('imports a CSV bulk payload', async () => {
    mockLocationsApi.bulkImport.mockResolvedValue({
      created: 1,
      skipped: 0,
      skippedNames: [],
    });
    const user = userEvent.setup();

    render(<ManageLocations />);
    await waitFor(() => {
      expect(screen.getByText('Madison Square Garden')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Bulk Import' }));
    const textarea = await screen.findByLabelText(
      /Paste JSON array or CSV with header row/i,
    );
    fireEvent.change(textarea, {
      target: {
        value: 'name,city,country,capacity\nTokyo Dome,Tokyo,Japan,55000',
      },
    });

    await user.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => {
      expect(mockLocationsApi.bulkImport).toHaveBeenCalledWith({
        locations: [
          {
            name: 'Tokyo Dome',
            city: 'Tokyo',
            country: 'Japan',
            capacity: 55000,
          },
        ],
      });
    });
    await waitFor(() => {
      expect(screen.getAllByText('Created 1 · Skipped 0').length).toBeGreaterThan(0);
    });
  });

  it('shows an inline parse error before submitting invalid JSON', async () => {
    const user = userEvent.setup();

    render(<ManageLocations />);
    await waitFor(() => {
      expect(screen.getByText('Madison Square Garden')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Bulk Import' }));
    const textarea = await screen.findByLabelText(
      /Paste JSON array or CSV with header row/i,
    );
    fireEvent.change(textarea, { target: { value: '[{ "name": "broken" ' } });

    await user.click(screen.getByRole('button', { name: 'Import' }));

    expect(mockLocationsApi.bulkImport).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/Invalid JSON/i),
    ).toBeInTheDocument();
  });
});
