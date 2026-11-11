import DOMPurify from 'dompurify';

/**
 * Elements removed even though DOMPurify's HTML profile would keep them.
 * Announcement bodies are formatted text plus inline video, so nothing here
 * has a legitimate use and each can submit, restyle or embed content.
 */
const FORBIDDEN_TAGS = ['style', 'form', 'input', 'button', 'textarea', 'select', 'option', 'iframe', 'object', 'embed'];

const SANITIZE_CONFIG = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: FORBIDDEN_TAGS,
  ADD_ATTR: ['target', 'playsinline'],
};

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node instanceof HTMLAnchorElement && node.hasAttribute('target')) {
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/**
 * Sanitizes stored HTML before it is rendered with dangerouslySetInnerHTML.
 * Keeps inline `style` attributes and `<video>`, which announcements use.
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}
