/** Stand-in for react-i18next: returns the default text with values filled in. */
function fill(text: string, values: Record<string, unknown>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}

export function mockT(key: string, second?: string | Record<string, unknown>, third?: Record<string, unknown>): string {
  if (typeof second === 'string') return fill(second, third ?? {});
  if (second && typeof second.defaultValue === 'string') return fill(second.defaultValue, second);
  return key;
}

export const i18nMock = {
  useTranslation: () => ({ t: mockT, i18n: { language: 'en' } }),
};
