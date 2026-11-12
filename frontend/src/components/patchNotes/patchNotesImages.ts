/** One markdown image in a post, with the section ("##" heading) it sits in. */
export interface PatchNotesImage {
  src: string;
  alt: string;
  /** Character offset of the image in the markdown, matching the mdast node position. */
  offset: number;
  section: number;
}

const IMAGE_PATTERN = /!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
const SECTION_HEADING = /^#{1,2}\s/gm;

/**
 * Finds every image in the post and numbers the sections, so the lightbox can
 * step through the screenshots of the section the reader opened.
 */
export function collectPatchNotesImages(markdown: string): PatchNotesImage[] {
  const sectionStarts = [...markdown.matchAll(SECTION_HEADING)].map((match) => match.index ?? 0);
  return [...markdown.matchAll(IMAGE_PATTERN)].map((match) => {
    const offset = match.index ?? 0;
    return {
      alt: match[1] ?? '',
      src: match[2] ?? '',
      offset,
      section: sectionStarts.filter((start) => start <= offset).length,
    };
  });
}
