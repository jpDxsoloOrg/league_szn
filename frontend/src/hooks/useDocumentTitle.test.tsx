import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { useDocumentTitle, useRouteTitle } from './useDocumentTitle';

function Page({ title }: { title: string }) {
  useDocumentTitle(title);
  return null;
}

function Shell({ routeTitle, pageTitle }: { routeTitle: string; pageTitle?: string }) {
  useRouteTitle(routeTitle);
  return pageTitle ? <Page title={pageTitle} /> : null;
}

describe('document titles', () => {
  it('names a route that does not set its own title', () => {
    render(<Shell routeTitle="Rivalries" />);
    expect(document.title).toBe('Rivalries | League SZN');
  });

  it('lets a page override the route, even though its effect runs first', () => {
    render(<Shell routeTitle="Rivalries" pageTitle="Edge vs Christian" />);
    expect(document.title).toBe('Edge vs Christian | League SZN');
  });

  it('falls back to the route title when the page leaves', () => {
    const view = render(<Shell routeTitle="Rivalries" pageTitle="Edge vs Christian" />);
    view.rerender(<Shell routeTitle="Standings" />);
    expect(document.title).toBe('Standings | League SZN');
  });

  it('keeps the bare name when the title is empty', () => {
    render(<Shell routeTitle="" />);
    expect(document.title).toBe('League SZN');
  });
});
