/**
 * Shared pieces of the contracts routes (ECO-04): the public contract view,
 * notification wording and the offer-owner lookup used by accept / decline.
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getAuthContext } from '../../lib/auth';
import { createNotification, createNotifications, type NotificationType } from '../../lib/notifications';
import { isOfferExpired } from '../../lib/policies/contracts';
import { getRepositories, ConcurrencyError, type Contract, type Player } from '../../lib/repositories';
import { conflict, forbidden, notFound } from '../../lib/response';
import { listStaffUserIds } from '../../lib/staffUsers';

/** Longest GM note on an offer or a release. */
export const CONTRACT_NOTE_MAX_LENGTH = 500;

export const OFFER_EXPIRED_MESSAGE = 'This offer has expired';

/**
 * What anyone may see of a contract: its kind, state and how it ends. Money
 * (pay, salary, bonus), the offering GM and notes stay with staff and the player.
 */
export interface PublicContract {
  contractId: string;
  playerId: string;
  type: Contract['type'];
  status: Contract['status'];
  matchesTotal?: number;
  matchesPlayed: number;
  seasonId?: string;
  startedAt?: string;
  endedAt?: string;
}

export function toPublicContract(contract: Contract): PublicContract {
  return {
    contractId: contract.contractId,
    playerId: contract.playerId,
    type: contract.type,
    status: contract.status,
    ...(contract.matchesTotal !== undefined && { matchesTotal: contract.matchesTotal }),
    matchesPlayed: contract.matchesPlayed,
    ...(contract.seasonId !== undefined && { seasonId: contract.seasonId }),
    ...(contract.startedAt !== undefined && { startedAt: contract.startedAt }),
    ...(contract.endedAt !== undefined && { endedAt: contract.endedAt }),
  };
}

const CONTRACT_TYPE_LABELS: Record<Contract['type'], string> = {
  tryout: 'tryout',
  matches: 'match',
  season: 'season',
};

export function contractLabel(contract: Pick<Contract, 'type'>): string {
  return `${CONTRACT_TYPE_LABELS[contract.type]} contract`;
}

export function playerLabel(player: Pick<Player, 'name' | 'currentWrestler'>): string {
  return player.currentWrestler?.trim() || player.name;
}

/** One notification to the player's account. A player without an account gets none. */
export async function notifyPlayer(
  player: Pick<Player, 'userId'>,
  contract: Pick<Contract, 'contractId'>,
  type: NotificationType,
  message: string,
): Promise<void> {
  if (!player.userId) return;
  await createNotification({
    userId: player.userId,
    type,
    message,
    sourceId: contract.contractId,
    sourceType: 'contract',
  });
}

/** One notification to every Admin and Moderator. Never throws. */
export async function notifyStaff(
  contract: Pick<Contract, 'contractId'>,
  type: NotificationType,
  message: string,
): Promise<void> {
  const staffIds = await listStaffUserIds();
  await createNotifications(staffIds.map((userId) => ({
    userId,
    type,
    message,
    sourceId: contract.contractId,
    sourceType: 'contract' as const,
  })));
}

/**
 * Best-effort move of an overdue offer to `expired`, so a lazy check and the
 * hourly sweep agree. Returns true when this call made the change.
 */
export async function expireOffer(contract: Contract, now: Date = new Date()): Promise<boolean> {
  try {
    await getRepositories().contracts.update(contract.contractId, {
      status: 'expired',
      endedAt: now.toISOString(),
      endReason: 'offerExpired',
    }, 'offered');
    return true;
  } catch (err) {
    if (err instanceof ConcurrencyError) return false;
    throw err;
  }
}

export type OwnOfferLookup =
  | { ok: true; contract: Contract; player: Player }
  | { ok: false; response: APIGatewayProxyResult };

/**
 * The offer named in the path, if the caller is the player it was made to and
 * it is still open. An offer past its expiry is expired on the spot.
 */
export async function loadOwnOpenOffer(event: APIGatewayProxyEvent): Promise<OwnOfferLookup> {
  const contractId = event.pathParameters?.contractId;
  if (!contractId) return { ok: false, response: notFound('Contract not found') };

  const { contracts, roster: { players } } = getRepositories();
  const contract = await contracts.findById(contractId);
  if (!contract) return { ok: false, response: notFound('Contract not found') };

  const player = await players.findById(contract.playerId);
  const { sub } = getAuthContext(event);
  if (!player || !sub || player.userId !== sub) {
    return { ok: false, response: forbidden('Only the player this offer was made to can answer it') };
  }

  if (contract.status !== 'offered') {
    return { ok: false, response: conflict(`This offer is ${contract.status}`) };
  }
  if (isOfferExpired(contract)) {
    await expireOffer(contract);
    return { ok: false, response: conflict(OFFER_EXPIRED_MESSAGE) };
  }
  return { ok: true, contract, player };
}

/** Reads an optional note: a trimmed string up to the limit, or an error message. */
export function readNote(value: unknown, required: boolean): { note?: string; error?: string } {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    return required ? { error: 'note is required' } : {};
  }
  if (typeof value !== 'string') return { error: 'note must be a string' };
  if (value.length > CONTRACT_NOTE_MAX_LENGTH) {
    return { error: `note must be at most ${CONTRACT_NOTE_MAX_LENGTH} characters` };
  }
  return { note: value.trim() };
}
