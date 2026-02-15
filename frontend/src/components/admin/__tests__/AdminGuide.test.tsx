import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import AdminGuide from '../AdminGuide';

describe('AdminGuide', () => {
  it('renders admin documentation content with quickstart and all sections', () => {
    render(<AdminGuide />);

    // Title
    expect(screen.getByText('Admin Guide')).toBeInTheDocument();

    // Intro text
    expect(
      screen.getByText(/This guide explains how to manage the WWE 2K League/)
    ).toBeInTheDocument();

    // Quickstart section with numbered steps
    expect(screen.getByText('Quickstart Guide')).toBeInTheDocument();
    expect(screen.getByText('Manage Users')).toBeInTheDocument();
    expect(screen.getByText('Create Divisions')).toBeInTheDocument();
    expect(screen.getAllByText('Manage Players').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Create a Season')).toBeInTheDocument();
    expect(screen.getByText('Create Championships')).toBeInTheDocument();

    // Key management sections present (use getAllByText for terms that appear
    // in both quickstart descriptions and section headings)
    const headings = screen.getAllByRole('heading');
    const headingTexts = headings.map(h => h.textContent);
    expect(headingTexts).toContain('User Management');
    expect(headingTexts).toContain('Managing Players');
    expect(headingTexts).toContain('Managing Divisions');
    expect(headingTexts).toContain('Managing Seasons');
    expect(headingTexts).toContain('Managing Championships');
    expect(headingTexts).toContain('Scheduling Matches');
    expect(headingTexts).toContain('Recording Results');
    expect(headingTexts).toContain('Creating Tournaments');
    expect(headingTexts).toContain('Contender Configuration');
    expect(headingTexts).toContain('Typical Weekly Workflow');
  });

  it('renders table of contents with links to major sections', () => {
    render(<AdminGuide />);

    const nav = screen.getByRole('navigation', { name: 'Table of contents' });
    expect(nav).toBeInTheDocument();

    const tocLinks = nav.querySelectorAll('a[href^="#"]');
    const hrefs = Array.from(tocLinks).map(a => a.getAttribute('href'));

    expect(hrefs).toContain('#quickstart');
    expect(hrefs).toContain('#challenges');
    expect(hrefs).toContain('#promos');
    expect(hrefs).toContain('#schedule-match');
    expect(hrefs).toContain('#data-management');
    expect(hrefs).toContain('#workflow');
  });

  it('renders Challenges and Promos sections under Content & social', () => {
    render(<AdminGuide />);

    expect(screen.getByRole('heading', { name: 'Content & social' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Challenges' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Promos' })).toBeInTheDocument();
  });

  it('does not contain "coming soon" in Wrestler role description', () => {
    render(<AdminGuide />);

    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });
});
