import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockChangeLanguage, mockI18n } = vi.hoisted(() => {
  const mockChangeLanguage = vi.fn();
  return { mockChangeLanguage, mockI18n: { language: 'en', changeLanguage: mockChangeLanguage } };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: mockI18n }),
}));

import LanguageSwitcher from '../LanguageSwitcher';

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockI18n.language = 'en';
  });

  it('opens a menu with the current language checked', async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'languageSwitcher.label' }));

    expect(screen.getByRole('menuitemradio', { name: 'English' })).toBeChecked();
    expect(screen.getByRole('menuitemradio', { name: 'Deutsch' })).not.toBeChecked();
  });

  it('treats a regional language as its base language', async () => {
    const user = userEvent.setup();
    mockI18n.language = 'de-DE';
    render(<LanguageSwitcher />);

    await user.click(screen.getByRole('button', { name: 'languageSwitcher.label' }));

    expect(screen.getByRole('menuitemradio', { name: 'Deutsch' })).toBeChecked();
  });

  it('changes language and closes the menu', async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    await user.click(screen.getByRole('button', { name: 'languageSwitcher.label' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Deutsch' }));

    expect(mockChangeLanguage).toHaveBeenCalledWith('de');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens from the keyboard', async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    await user.tab();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});
