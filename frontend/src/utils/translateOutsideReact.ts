import i18n from 'i18next';

/**
 * Translate from code that has no `useTranslation`, such as the API client.
 * Uses the app's i18next instance directly, because the i18n module pulls in
 * the React bindings. `fallback` covers a call before i18next has started.
 */
export function translateOutsideReact(key: string, fallback: string, options: Record<string, string> = {}): string {
  if (!i18n.isInitialized) return fallback;
  return i18n.t(key, { ...options, defaultValue: fallback });
}
