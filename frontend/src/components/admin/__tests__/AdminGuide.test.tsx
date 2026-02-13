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
    expect(screen.getByText('Add Players')).toBeInTheDocument();
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
});
