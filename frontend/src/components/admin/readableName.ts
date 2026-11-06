const RAW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Some API fields fall back to a stored id, which must never reach the page. */
export function readableName(value: string | null | undefined, fallback: string): string {
  return !value || RAW_ID.test(value) ? fallback : value;
}
