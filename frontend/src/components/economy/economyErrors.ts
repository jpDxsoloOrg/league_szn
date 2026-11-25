import type { TFunction } from 'i18next';
import { ApiError } from '../../services/api/apiClient';
import { isShopRefusalCode } from '../../services/api/shop.api';
import { refusalKey } from './shopItems';

/**
 * The message for a failed shop, GM interference, fine or no-show request:
 * a translated refusal when the server sent a known `code`, the server's own
 * message for other API errors, and `fallback` otherwise.
 */
export function economyErrorMessage(err: unknown, t: TFunction, fallback: string): string {
  if (err instanceof ApiError) {
    if (isShopRefusalCode(err.code)) return t(refusalKey(err.code), err.message);
    if (err.message) return err.message;
  }
  return fallback;
}
