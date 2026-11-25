import { APIGatewayProxyHandler } from 'aws-lambda';
import { getAuthContext } from '../../lib/auth';
import { bookingRefusal } from '../../lib/discipline';
import { parseBody } from '../../lib/parseBody';
import { ECONOMY_CONTRACT_TYPES, type EconomySettings } from '../../lib/policies/economyDefaults';
import { validateOffer, type ContractOfferInput } from '../../lib/policies/contracts';
import { getRepositories, type ContractType } from '../../lib/repositories';
import { badRequest, created, errorWithDetails, notFound, serverError } from '../../lib/response';
import { contractLabel, notifyPlayer, readNote } from './contractShared';

interface OfferBody {
  playerId?: unknown;
  type?: unknown;
  matchesTotal?: unknown;
  seasonId?: unknown;
  perMatchPay?: unknown;
  weeklySalary?: unknown;
  winBonus?: unknown;
  note?: unknown;
}

function isContractType(value: unknown): value is ContractType {
  return typeof value === 'string' && (ECONOMY_CONTRACT_TYPES as readonly string[]).includes(value);
}

/**
 * Fill the offer from the GM's body over the per-type defaults in the economy
 * settings. A field the GM sends wins; `validateOffer` then checks the result,
 * so a non-number override is rejected there rather than silently replaced.
 */
export function resolveOfferInput(
  body: OfferBody,
  playerId: string,
  type: ContractType,
  settings: EconomySettings,
  activeSeasonId: string | undefined,
): ContractOfferInput {
  const defaults = settings.contractDefaults[type];
  const pick = (value: unknown, fallback: number): number => (value === undefined ? fallback : value as number);
  const input: ContractOfferInput = {
    playerId,
    type,
    perMatchPay: pick(body.perMatchPay, defaults.perMatchPay),
    weeklySalary: pick(body.weeklySalary, defaults.weeklySalary),
    winBonus: pick(body.winBonus, defaults.winBonus),
  };
  if (type === 'season') {
    const seasonId = body.seasonId ?? activeSeasonId;
    if (seasonId !== undefined) input.seasonId = seasonId as string;
  } else {
    const fallbackMatches = type === 'tryout' ? settings.contractDefaults.tryout.matches : undefined;
    const matchesTotal = body.matchesTotal ?? fallbackMatches;
    if (matchesTotal !== undefined) input.matchesTotal = matchesTotal as number;
    if (body.seasonId !== undefined) input.seasonId = body.seasonId as string;
  }
  return input;
}

/**
 * POST /contracts (Moderator/Admin): offer a contract to a player. Pay terms
 * default to the economy settings for the type and can be overridden. A player
 * may hold several open offers; only accepting one is limited to one active
 * contract. Deactivated players can't receive offers.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { data: body, error: parseError } = parseBody<OfferBody>(event);
    if (parseError) return parseError;

    if (typeof body.playerId !== 'string' || body.playerId.trim() === '') {
      return badRequest('playerId is required');
    }
    if (!isContractType(body.type)) {
      return badRequest(`type must be one of ${ECONOMY_CONTRACT_TYPES.join(', ')}`);
    }
    const { note, error: noteError } = readNote(body.note, false);
    if (noteError) return badRequest(noteError);

    const repos = getRepositories();
    const player = await repos.roster.players.findById(body.playerId);
    if (!player) return notFound('Player not found');
    const refusal = bookingRefusal(player);
    if (refusal) return refusal;
    if (!player.userId) {
      return badRequest('This player has no linked account, so they could not answer an offer');
    }

    const [settings, activeSeason] = await Promise.all([
      repos.user.siteConfig.getEconomySettings(),
      repos.season.seasons.findActive(),
    ]);
    const activeSeasonId = activeSeason?.seasonId;
    const input = resolveOfferInput(body, player.playerId, body.type, settings, activeSeasonId);
    if (note !== undefined) input.note = note;

    const validation = validateOffer(input, settings, { activeSeasonId });
    if (!validation.ok) {
      return errorWithDetails(400, 'The offer is not valid', { errors: validation.errors });
    }

    const { offer } = validation;
    const contract = await repos.contracts.create({
      ...offer,
      offeredBy: getAuthContext(event).sub,
    });

    await notifyPlayer(
      player,
      contract,
      'contract_offer',
      `You have a new ${contractLabel(contract)} offer. Answer it by ${contract.offerExpiresAt.slice(0, 10)}.`,
    );

    return created(contract);
  } catch (err) {
    console.error('Error offering contract:', err);
    return serverError('Failed to offer contract');
  }
};
