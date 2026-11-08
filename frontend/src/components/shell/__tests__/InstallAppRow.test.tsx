import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { InstallPrompt } from '../../../pwa/useInstallPrompt';

const { mockUseInstallPrompt } = vi.hoisted(() => ({
  mockUseInstallPrompt: vi.fn<() => InstallPrompt>(),
}));

vi.mock('../../../pwa/useInstallPrompt', () => ({ useInstallPrompt: mockUseInstallPrompt }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}));

import InstallAppRow, { INSTALL_GUIDE_PATH } from '../InstallAppRow';

function renderRow() {
  return render(
    <MemoryRouter>
      <InstallAppRow />
    </MemoryRouter>,
  );
}

describe('InstallAppRow', () => {
  const promptInstall = vi.fn(async () => true);

  beforeEach(() => {
    promptInstall.mockClear();
  });

  it('shows an Install button that opens the browser prompt', async () => {
    mockUseInstallPrompt.mockReturnValue({ status: 'available', promptInstall });
    renderRow();

    await userEvent.click(screen.getByRole('button', { name: /pwa\.install\.action/ }));

    expect(promptInstall).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('pwa.install.iosHint')).not.toBeInTheDocument();
  });

  it('shows the Share hint on iOS, linking to the install guide', () => {
    mockUseInstallPrompt.mockReturnValue({ status: 'ios', promptInstall });
    renderRow();

    const link = screen.getByRole('link', { name: /pwa\.install\.action/ });
    expect(link).toHaveAttribute('href', INSTALL_GUIDE_PATH);
    expect(link).toHaveTextContent('pwa.install.iosHint');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each(['installed', 'unavailable'] as const)('renders nothing when the status is %s', (status) => {
    mockUseInstallPrompt.mockReturnValue({ status, promptInstall });
    const { container } = renderRow();

    expect(container).toBeEmptyDOMElement();
  });
});
