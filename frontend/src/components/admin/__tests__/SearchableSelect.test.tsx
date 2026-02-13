import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import SearchableSelect from '../SearchableSelect';

const mockOptions = [
  { value: 'p1', label: 'The Rock' },
  { value: 'p2', label: 'Stone Cold' },
  { value: 'p3', label: 'Triple H' },
  { value: 'p4', label: 'Undertaker' },
];

describe('SearchableSelect', () => {
  let mockOnChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnChange = vi.fn();
  });

  it('renders input with placeholder and opens dropdown on focus', async () => {
    const user = userEvent.setup();
    render(
      <SearchableSelect
        options={mockOptions}
        value=""
        onChange={mockOnChange}
        placeholder="Select a wrestler..."
      />
    );

    const input = screen.getByPlaceholderText('Select a wrestler...');
    expect(input).toBeInTheDocument();

    // No dropdown yet
    expect(screen.queryByText('The Rock')).not.toBeInTheDocument();

    // Focus to open dropdown
    await user.click(input);

    // All options visible
    expect(screen.getByText('The Rock')).toBeInTheDocument();
    expect(screen.getByText('Stone Cold')).toBeInTheDocument();
    expect(screen.getByText('Triple H')).toBeInTheDocument();
    expect(screen.getByText('Undertaker')).toBeInTheDocument();
  });

  it('filters options based on search input', async () => {
    const user = userEvent.setup();
    render(
      <SearchableSelect
        options={mockOptions}
        value=""
        onChange={mockOnChange}
        placeholder="Search..."
      />
    );

    const input = screen.getByPlaceholderText('Search...');
    await user.click(input);

    // Type search text
    await user.type(input, 'stone');

    // Only matching option visible
    expect(screen.getByText('Stone Cold')).toBeInTheDocument();
    expect(screen.queryByText('The Rock')).not.toBeInTheDocument();
    expect(screen.queryByText('Triple H')).not.toBeInTheDocument();
    expect(screen.queryByText('Undertaker')).not.toBeInTheDocument();
  });

  it('calls onChange callback when an option is selected', async () => {
    const user = userEvent.setup();
    render(
      <SearchableSelect
        options={mockOptions}
        value=""
        onChange={mockOnChange}
        placeholder="Search..."
      />
    );

    const input = screen.getByPlaceholderText('Search...');
    await user.click(input);

    // Click on "Triple H" option
    await user.click(screen.getByText('Triple H'));

    expect(mockOnChange).toHaveBeenCalledWith('p3');

    // Dropdown should close after selection
    expect(screen.queryByText('Stone Cold')).not.toBeInTheDocument();
  });

  it('shows "No matches" when search yields no results', async () => {
    const user = userEvent.setup();
    render(
      <SearchableSelect
        options={mockOptions}
        value=""
        onChange={mockOnChange}
        placeholder="Search..."
      />
    );

    const input = screen.getByPlaceholderText('Search...');
    await user.click(input);
    await user.type(input, 'zzzzz');

    expect(screen.getByText('No matches')).toBeInTheDocument();
  });

  it('displays selected option label when a value is set and dropdown is closed', () => {
    render(
      <SearchableSelect
        options={mockOptions}
        value="p2"
        onChange={mockOnChange}
        placeholder="Search..."
      />
    );

    // Input shows the selected label
    const input = screen.getByDisplayValue('Stone Cold');
    expect(input).toBeInTheDocument();

    // Clear button visible when value is set
    const clearBtn = screen.getByText('\u00d7');
    expect(clearBtn).toBeInTheDocument();
  });
});
