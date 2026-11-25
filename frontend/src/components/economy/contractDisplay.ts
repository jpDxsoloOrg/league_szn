import type { TFunction } from 'i18next';
import type { ContractType } from '../../services/api/contracts.api';
import { matchesLeft } from './offerForm';

/*
 * Wording for a contract's length and badge (ECO-12). Money never appears
 * here: the badge is public.
 */

interface ContractLength {
  type: ContractType;
  matchesTotal?: number;
  matchesPlayed: number;
  seasonId?: string;
}

/** "3 of 5 matches left" or "Through Season 4". */
export function contractLengthLabel(
  contract: ContractLength,
  seasonNames: ReadonlyMap<string, string>,
  t: TFunction,
): string {
  const left = matchesLeft(contract);
  if (left !== undefined) {
    return t('contracts.length.matches', {
      defaultValue: '{{left}} of {{total}} matches left',
      left,
      total: contract.matchesTotal,
    });
  }
  const season = contract.seasonId ? seasonNames.get(contract.seasonId) : undefined;
  return season
    ? t('contracts.length.season', { defaultValue: 'Through {{season}}', season })
    : t('contracts.length.seasonUnknown', 'Until the season ends');
}

/** The public profile badge: "Season contract, through Season 4" or "Free agent". */
export function contractBadgeLabel(
  contract: ContractLength | null,
  seasonNames: ReadonlyMap<string, string>,
  t: TFunction,
): string {
  if (!contract) return t('contracts.badge.freeAgent', 'Free agent');
  const type = t(`contracts.types.${contract.type}`, contract.type);
  if (contract.type === 'season') {
    const season = contract.seasonId ? seasonNames.get(contract.seasonId) : undefined;
    return season
      ? t('contracts.badge.season', { defaultValue: '{{type}}, through {{season}}', type, season })
      : type;
  }
  return t('contracts.badge.matches', {
    defaultValue: '{{type}}, {{left}} of {{total}} matches left',
    type,
    left: matchesLeft(contract),
    total: contract.matchesTotal,
  });
}
