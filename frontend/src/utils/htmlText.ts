/** Plain text of stored HTML, for excerpts. Parsed inertly: nothing in it runs or loads. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return '';
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  parsed.querySelectorAll('script, style').forEach((node) => node.remove());
  return (parsed.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Cuts text at a word boundary and marks the cut. */
export function excerpt(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxLength / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
