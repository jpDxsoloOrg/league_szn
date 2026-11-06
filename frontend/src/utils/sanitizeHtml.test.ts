import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from './sanitizeHtml';

describe('sanitizeHtml', () => {
  it('returns an empty string for missing input', () => {
    expect(sanitizeHtml(undefined)).toBe('');
    expect(sanitizeHtml(null)).toBe('');
    expect(sanitizeHtml('')).toBe('');
  });

  it('removes scripts and event handlers', () => {
    const clean = sanitizeHtml('<p onclick="run()">Hi</p><script>run()</script><img src="x.png" onerror="run()">');
    expect(clean).toContain('Hi');
    expect(clean).not.toMatch(/script|onclick|onerror/);
  });

  it('removes javascript URLs', () => {
    expect(sanitizeHtml('<a href="javascript:run()">go</a>')).not.toContain('javascript:');
  });

  it('removes embedding and form elements', () => {
    const clean = sanitizeHtml('<iframe src="/x"></iframe><form><input></form><style>p{}</style><object></object>');
    expect(clean).not.toMatch(/iframe|form|input|style|object/);
  });

  it('keeps formatted announcement markup', () => {
    const html = '<div style="text-align: center;"><h1>Card</h1><span style="color: red;">Main event</span></div>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it('keeps inline video with a site-relative source', () => {
    const clean = sanitizeHtml('<video width="100%" controls playsinline preload="metadata"><source src="/videos/a.mp4"></video>');
    expect(clean).toContain('<video');
    expect(clean).toContain('controls');
    expect(clean).toContain('playsinline');
    expect(clean).toContain('src="/videos/a.mp4"');
  });

  it('adds rel to links opening a new tab', () => {
    expect(sanitizeHtml('<a href="https://example.com" target="_blank">x</a>')).toContain('rel="noopener noreferrer"');
  });
});
