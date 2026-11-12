import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string | number>) => (options ? `${key}:${Object.values(options).join('/')}` : key),
    i18n: { language: 'en' },
  }),
}));

import PatchNotesMarkdown from '../PatchNotesMarkdown';
import { collectPatchNotesImages } from '../patchNotesImages';

const POST = [
  'Intro.',
  '',
  '## Call-Ups',
  '',
  'Young Boys get a path.',
  '',
  '![Road to the Main Roster](/patch-notes/images/v1.1.0/road.webp)',
  '![Call-Ups board](/patch-notes/images/v1.1.0/board.webp)',
  '',
  '## Tag Teams',
  '',
  '![Create Tag Team](/patch-notes/images/v1.1.0/create-team.webp)',
].join('\n');

function renderPost() {
  return render(
    <MemoryRouter>
      <PatchNotesMarkdown content={POST} />
    </MemoryRouter>,
  );
}

function dialogImage(): HTMLImageElement {
  return within(screen.getByRole('dialog')).getByRole('img') as HTMLImageElement;
}

describe('collectPatchNotesImages', () => {
  it('groups images by their "##" section', () => {
    const images = collectPatchNotesImages(POST);
    expect(images.map((image) => [image.alt, image.section])).toEqual([
      ['Road to the Main Roster', 1],
      ['Call-Ups board', 1],
      ['Create Tag Team', 2],
    ]);
  });
});

describe('PatchNotesMarkdown screenshots', () => {
  it('renders images as lazy thumbnails with captions, consecutive ones in a gallery row', () => {
    const { container } = renderPost();
    const thumbs = screen.getAllByRole('button', { name: /patchNotes\.lightbox\.open/ });
    expect(thumbs).toHaveLength(3);
    const image = within(thumbs[0]!).getByAltText('Road to the Main Roster');
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('src', '/patch-notes/images/v1.1.0/road.webp');
    expect(thumbs[0]).toHaveTextContent('Road to the Main Roster');
    const galleries = container.querySelectorAll('.patch-notes-gallery');
    expect(galleries).toHaveLength(2);
    expect(galleries[0]!.querySelectorAll('.patch-notes-thumb')).toHaveLength(2);
    expect(container.querySelector('p .patch-notes-thumb')).toBeNull();
  });

  it('opens the full-size image in a dialog and closes on Escape, returning focus', async () => {
    renderPost();
    const thumb = screen.getByRole('button', { name: 'patchNotes.lightbox.open:Call-Ups board' });
    thumb.focus();
    fireEvent.click(thumb);

    const dialog = await screen.findByRole('dialog');
    expect(dialogImage()).toHaveAttribute('src', '/patch-notes/images/v1.1.0/board.webp');
    expect(dialog).toHaveTextContent('Call-Ups board');
    expect(dialog).toHaveTextContent('patchNotes.lightbox.position:2/2');

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(thumb).toHaveFocus());
  });

  it('closes with the close button', async () => {
    renderPost();
    fireEvent.click(screen.getByRole('button', { name: 'patchNotes.lightbox.open:Create Tag Team' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'patchNotes.lightbox.close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('steps through the section with arrow keys and buttons, wrapping around', async () => {
    renderPost();
    fireEvent.click(screen.getByRole('button', { name: 'patchNotes.lightbox.open:Road to the Main Roster' }));
    await screen.findByRole('dialog');
    expect(dialogImage()).toHaveAttribute('alt', 'Road to the Main Roster');

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(dialogImage()).toHaveAttribute('alt', 'Call-Ups board');

    // Wraps within the section; never jumps to the Tag Teams screenshot.
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(dialogImage()).toHaveAttribute('alt', 'Road to the Main Roster');

    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(dialogImage()).toHaveAttribute('alt', 'Call-Ups board');

    fireEvent.click(screen.getByRole('button', { name: 'patchNotes.lightbox.previous' }));
    expect(dialogImage()).toHaveAttribute('alt', 'Road to the Main Roster');
    fireEvent.click(screen.getByRole('button', { name: 'patchNotes.lightbox.next' }));
    expect(dialogImage()).toHaveAttribute('alt', 'Call-Ups board');
  });

  it('hides the arrows when the section has a single screenshot', async () => {
    renderPost();
    fireEvent.click(screen.getByRole('button', { name: 'patchNotes.lightbox.open:Create Tag Team' }));
    await screen.findByRole('dialog');
    expect(screen.queryByRole('button', { name: 'patchNotes.lightbox.next' })).toBeNull();
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(dialogImage()).toHaveAttribute('alt', 'Create Tag Team');
  });
});
