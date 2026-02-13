import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../TopBar.css', () => ({}));

import TopBar from '../TopBar';

function renderTopBar(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <TopBar />
    </MemoryRouter>
  );
}

describe('TopBar', () => {
  it('renders top-level page title without breadcrumb for root routes', () => {
    renderTopBar('/');

    const title = screen.getByText('nav.standings');
    expect(title).toBeInTheDocument();
    expect(title).toHaveClass('top-bar-title');
    // No breadcrumb parent
    expect(screen.queryByClassName?.('top-bar-parent')).toBeFalsy();
    expect(screen.queryByText('/')).not.toBeInTheDocument();
  });

  it('renders breadcrumb with parent and title for admin sub-routes', () => {
    renderTopBar('/admin/divisions');

    expect(screen.getByText('nav.admin')).toBeInTheDocument();
    expect(screen.getByText('nav.admin')).toHaveClass('top-bar-parent');
    expect(screen.getByText('admin.panel.tabs.divisions')).toBeInTheDocument();
    expect(screen.getByText('admin.panel.tabs.divisions')).toHaveClass('top-bar-title');
    expect(screen.getByText('/')).toHaveClass('top-bar-separator');
  });
});
