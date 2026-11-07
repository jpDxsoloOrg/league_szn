import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import i18n from 'i18next';
import en from '../../i18n/locales/en.json';
import de from '../../i18n/locales/de.json';
import { ApiError, SIGNUP_BLOCKED_EVENT, playersApi } from '../api';

function refuseWith(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: vi.fn().mockResolvedValue(body),
  }) as unknown as typeof fetch;
}

const failure = async (): Promise<ApiError> => {
  const caught = await playersApi.update('p1', { name: 'x' }).catch((err: unknown) => err);
  return caught as ApiError;
};

describe('ApiError refusal codes', () => {
  beforeAll(async () => {
    await i18n.init({
      lng: 'en',
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      resources: { en: { translation: en }, de: { translation: de } },
    });
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('keeps the code and replaces the message with the translation', async () => {
    refuseWith(409, { message: 'That player is not available right now', code: 'PLAYER_UNAVAILABLE' });
    const error = await failure();
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('PLAYER_UNAVAILABLE');
    expect(error.message).toBe(en.discipline.errors.PLAYER_UNAVAILABLE);
  });

  it('translates in the viewer language', async () => {
    await i18n.changeLanguage('de');
    refuseWith(409, { message: 'stale', code: 'DISCIPLINE_CONFLICT' });
    expect((await failure()).message).toBe(de.discipline.errors.DISCIPLINE_CONFLICT);
  });

  it('puts the end of a block in the message, and not the raw timestamp', async () => {
    refuseWith(403, {
      message: 'You cannot sign up until 2026-11-13T15:04:00.000Z',
      code: 'SIGNUP_BLOCKED',
      blockedUntil: '2026-11-13T15:04:00.000Z',
    });
    const error = await failure();
    expect(error.blockedUntil).toBe('2026-11-13T15:04:00.000Z');
    expect(error.message).toContain('2026');
    expect(error.message).not.toContain('T15:04');
  });

  it('has a message for a block with no date', async () => {
    refuseWith(403, { message: 'Blocked', code: 'SIGNUP_BLOCKED' });
    expect((await failure()).message).toBe(en.discipline.errors.SIGNUP_BLOCKED_NO_DATE);
  });

  it('leaves an unknown code and its message alone', async () => {
    refuseWith(409, { message: 'Server words', code: 'SOMETHING_ELSE' });
    const error = await failure();
    expect(error.message).toBe('Server words');
    expect(error.code).toBe('SOMETHING_ELSE');
  });

  it('announces a sign-up block and nothing else', async () => {
    const listener = vi.fn();
    window.addEventListener(SIGNUP_BLOCKED_EVENT, listener);

    refuseWith(409, { message: 'x', code: 'PLAYER_UNAVAILABLE' });
    await failure();
    expect(listener).not.toHaveBeenCalled();

    refuseWith(403, { message: 'x', code: 'SIGNUP_BLOCKED', blockedUntil: '2026-11-13T15:04:00.000Z' });
    await failure();
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener(SIGNUP_BLOCKED_EVENT, listener);
  });
});
