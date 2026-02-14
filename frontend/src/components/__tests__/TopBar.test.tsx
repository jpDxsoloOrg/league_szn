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

  it('renders breadcrumb with parent (including group) and title for admin sub-routes', () => {
    renderTopBar('/admin/divisions');

    // Parent now includes the group name: "nav.admin / admin.panel.groups.leagueSetup"
    const parent = screen.getByText('nav.admin / admin.panel.groups.leagueSetup');
    expect(parent).toBeInTheDocument();
    expect(parent).toHaveClass('top-bar-parent');
    expect(screen.getByText('admin.panel.tabs.divisions')).toBeInTheDocument();
    expect(screen.getByText('admin.panel.tabs.divisions')).toHaveClass('top-bar-title');
    expect(screen.getByText('/')).toHaveClass('top-bar-separator');
  });
});
