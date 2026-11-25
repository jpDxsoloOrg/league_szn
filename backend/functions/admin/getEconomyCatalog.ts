import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { SHOP_ITEM_KEYS, type ShopItemKey, type ShopSettings } from '../../lib/policies/economyDefaults';

export type CatalogItem = ShopSettings[ShopItemKey] & { key: ShopItemKey };

/**
 * GET /economy/catalog — public. The shop's enabled items with their prices
 * and effect values, plus the currency name. Contract pay, fines and the
 * settings history stay on the GM-only endpoint.
 */
export const handler: APIGatewayProxyHandler = async () => {
  try {
    const { user: { siteConfig } } = getRepositories();
    const settings = await siteConfig.getEconomySettings();
    const items: CatalogItem[] = SHOP_ITEM_KEYS
      .map((key): CatalogItem => ({ key, ...settings.shop[key] }))
      .filter((item) => item.enabled);
    return success({
      currencyName: settings.currencyName,
      currencySymbol: settings.currencySymbol,
      version: settings.version,
      items,
    });
  } catch (error) {
    console.error('Get economy catalog error:', error);
    return serverError('Failed to load the shop catalog');
  }
};
