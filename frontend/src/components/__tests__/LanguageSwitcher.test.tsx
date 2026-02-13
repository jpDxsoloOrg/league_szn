import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- Hoisted mocks ---
const { mockChangeLanguage, mockI18n } = vi.hoisted(() => {
  const mockChangeLanguage = vi.fn();
  const mockI18n = {
    language: 'en',
    changeLanguage: mockChangeLanguage,
  };
  return { mockChangeLanguage, mockI18n };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: mockI18n }),
}));

import LanguageSwitcher from '../LanguageSwitcher';

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockI18n.language = 'en';
  });

  it('renders toggle button and opens dropdown with language options on click', async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    // Button exists with collapsed state
    const toggleBtn = screen.getByRole('button', { expanded: false });
    expect(toggleBtn).toBeInTheDocument();

    // Dropdown not visible initially
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    // Open dropdown
    await user.click(toggleBtn);

    // Dropdown visible with language options
    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();

    // Both language options visible
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('Deutsch')).toBeInTheDocument();

    // English should be active (aria-selected)
    const enOption = screen.getByText('English').closest('[role="option"]');
    expect(enOption).toHaveAttribute('aria-selected', 'true');
    const deOption = screen.getByText('Deutsch').closest('[role="option"]');
    expect(deOption).toHaveAttribute('aria-selected', 'false');
  });

  it('calls i18n.changeLanguage when selecting a different language', async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    // Open dropdown
    const toggleBtn = screen.getByRole('button');
    await user.click(toggleBtn);

    // Select Deutsch
    const deOption = screen.getByText('Deutsch');
    await user.click(deOption);

    expect(mockChangeLanguage).toHaveBeenCalledWith('de');

    // Dropdown should close after selection
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
