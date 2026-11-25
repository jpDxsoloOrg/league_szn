import { randomInt } from 'node:crypto';
import type { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type { MatchType, Player, Stipulation } from '../../lib/repositories/types';
import { badRequest, notFound, serverError, success } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { realWrestlerName } from '../../lib/needsWrestler';
import { simulate, type SideProbability } from '../../lib/policies/matchSim';
import type { SimCategory } from '../../lib/policies/buildRules';
import { resolveSimCategory, type SimCategoryMatch } from '../../lib/sim/category';
import { loadSimInputs, simSidesFromMatch, type FormWindow } from '../../lib/sim/loadSimInputs';
import {
  buildPlayByPlay,
  type PlayByPlayMoveset,
  type SimBeat,
} from '../../lib/sim/playByPlay';

/**
 * POST /simulate (BLD-08)
 *
 * GM "what if" preview: runs the match sim (BLD-05) for a scheduled match or
 * an ad-hoc set of sides and returns the odds, the winner and a play-by-play.
 * Staff only (Admin, Moderator): odds are a booking tool and never appear in
 * public payloads. Nothing is written: no match, result, record or log.
 *
 * Body, one of:
 *   { matchId, seed? }  the match's sides (teams, else one per participant)
 *                       and its sim category; the form window is its season.
 *   { sides: string[][], stipulationId?, matchTypeId?, seed? }
 *                       2–8 sides of 1–4 existing players each.
 * Without `seed` a random one is drawn; send it back to replay the same result.
 */

export const MIN_SIDES = 2;
export const MAX_SIDES = 8;
export const MAX_SIDE_MEMBERS = 4;
/** Seeds are unsigned 32-bit integers (see `normalizeSeed`). */
export const MAX_SEED = 0xffffffff;

export interface SimulateRequestBody {
  matchId?: unknown;
  sides?: unknown;
  stipulationId?: unknown;
  matchTypeId?: unknown;
  seed?: unknown;
}

export interface SimulateProbability {
  sideId: string;
  playerIds: string[];
  /** Win chance in percent, one decimal place. */
  pct: number;
}

export interface SimulateResponse {
  seed: number;
  category: SimCategory;
  /** In side order. */
  probabilities: SimulateProbability[];
  winnerSideId: string;
  /** i18n keys (`sim.beats.*`) and params, rendered by the frontend. */
  playByPlay: SimBeat[];
  /** Players fighting in their specialty. */
  specialtyHits: string[];
  /** Set when the preview is for a scheduled match. */
  matchId?: string;
  /** Players whose saved build is over budget and was scaled down. */
  scaledPlayerIds: string[];
  formWindow: FormWindow;
  /** Same digest + seed = same result. */
  inputsDigest: string;
  rulesVersion: number;
}

interface SimSetup {
  sides: string[][];
  category: SimCategory;
  seasonId?: string;
  matchId?: string;
}

type SetupResult = { ok: true; setup: SimSetup } | { ok: false; response: APIGatewayProxyResult };

const fail = (response: APIGatewayProxyResult): SetupResult => ({ ok: false, response });

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Null when the sides are valid, otherwise the reason. */
export function validateSides(sides: unknown): string | null {
  if (!Array.isArray(sides) || sides.length < MIN_SIDES || sides.length > MAX_SIDES) {
    return `sides must be an array of ${MIN_SIDES}–${MAX_SIDES} sides`;
  }
  const seen = new Set<string>();
  for (const side of sides) {
    if (!Array.isArray(side) || side.length < 1 || side.length > MAX_SIDE_MEMBERS) {
      return `each side must have 1–${MAX_SIDE_MEMBERS} players`;
    }
    for (const playerId of side) {
      if (!isNonEmptyString(playerId)) return 'player ids must be non-empty strings';
      if (seen.has(playerId)) return `player ${playerId} appears more than once`;
      seen.add(playerId);
    }
  }
  return null;
}

function parseSeed(seed: unknown): number | null {
  if (seed === undefined || seed === null) return randomInt(0, MAX_SEED + 1);
  if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) return null;
  return seed;
}

async function setupFromMatch(matchId: string): Promise<SetupResult> {
  const { competition } = getRepositories();
  const match = await competition.matches.findById(matchId);
  if (!match) return fail(notFound('Match not found'));
  if (match.status === 'completed') return fail(badRequest('Match is already decided'));
  if (match.status === 'cancelled') return fail(badRequest('Match is cancelled'));

  const sides = simSidesFromMatch(match);
  const sidesError = validateSides(sides);
  if (sidesError) return fail(badRequest(`Match cannot be simulated: ${sidesError}`));

  const [stipulations, matchTypes] = await Promise.all([
    competition.stipulations.list(),
    competition.matchTypes.list(),
  ]);
  return {
    ok: true,
    setup: {
      sides,
      category: resolveSimCategory(match, stipulations, matchTypes),
      matchId,
      ...(match.seasonId ? { seasonId: match.seasonId } : {}),
    },
  };
}

async function setupFromSides(body: SimulateRequestBody): Promise<SetupResult> {
  const sidesError = validateSides(body.sides);
  if (sidesError) return fail(badRequest(sidesError));
  const sides = (body.sides as string[][]).map((side) => [...side]);

  const { stipulationId, matchTypeId } = body;
  if (stipulationId !== undefined && !isNonEmptyString(stipulationId)) {
    return fail(badRequest('stipulationId must be a non-empty string'));
  }
  if (matchTypeId !== undefined && !isNonEmptyString(matchTypeId)) {
    return fail(badRequest('matchTypeId must be a non-empty string'));
  }

  const { competition } = getRepositories();
  const [stipulation, matchType] = await Promise.all([
    stipulationId ? competition.stipulations.findById(stipulationId) : Promise.resolve(null),
    matchTypeId ? competition.matchTypes.findById(matchTypeId) : Promise.resolve(null),
  ]);
  if (stipulationId && !stipulation) return fail(badRequest('Unknown stipulationId'));
  if (matchTypeId && !matchType) return fail(badRequest('Unknown matchTypeId'));

  const categoryMatch: SimCategoryMatch = {
    ...(stipulationId ? { stipulationId } : {}),
    ...(matchTypeId ? { matchFormat: matchTypeId } : {}),
  };
  const stipulations: Stipulation[] = stipulation ? [stipulation] : [];
  const matchTypes: MatchType[] = matchType ? [matchType] : [];
  return { ok: true, setup: { sides, category: resolveSimCategory(categoryMatch, stipulations, matchTypes) } };
}

function displayName(player: Player): string {
  return realWrestlerName(player.currentWrestler) ?? player.name;
}

function toPct(entry: SideProbability): number {
  return Math.round(entry.probability * 1000) / 10;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const { data: body, error: parseError } = parseBody<SimulateRequestBody>(event);
    if (parseError) return parseError;

    const hasMatch = body.matchId !== undefined;
    const hasSides = body.sides !== undefined;
    if (hasMatch === hasSides) return badRequest('Send either matchId or sides');
    if (hasMatch && !isNonEmptyString(body.matchId)) return badRequest('matchId must be a non-empty string');

    const seed = parseSeed(body.seed);
    if (seed === null) return badRequest(`seed must be an integer from 0 to ${MAX_SEED}`);

    const setupResult = hasMatch
      ? await setupFromMatch(body.matchId as string)
      : await setupFromSides(body);
    if (!setupResult.ok) return setupResult.response;
    const { setup } = setupResult;

    const loaded = await loadSimInputs({
      sides: setup.sides,
      ...(setup.seasonId ? { seasonId: setup.seasonId } : {}),
    });
    if (!loaded.ok) return badRequest(`Unknown player(s): ${loaded.missingPlayerIds.join(', ')}`);
    const { inputs } = loaded;

    const result = simulate(inputs.sides, { category: setup.category, seed });

    const names: Record<string, string> = {};
    const moves: Record<string, PlayByPlayMoveset> = {};
    for (const [playerId, player] of inputs.playersById) {
      names[playerId] = displayName(player);
      moves[playerId] = { signatures: player.signatures, finishers: player.finishers };
    }
    const playByPlay = buildPlayByPlay(result, inputs.sides, names, moves);

    const playerIdsBySide = new Map(inputs.sides.map((side) => [side.sideId, side.members.map((member) => member.playerId)]));
    const response: SimulateResponse = {
      seed: result.seed,
      category: result.category,
      probabilities: result.probabilities.map((entry) => ({
        sideId: entry.sideId,
        playerIds: playerIdsBySide.get(entry.sideId) ?? [],
        pct: toPct(entry),
      })),
      winnerSideId: result.winnerSideId,
      playByPlay,
      specialtyHits: result.specialtyHits,
      ...(setup.matchId ? { matchId: setup.matchId } : {}),
      scaledPlayerIds: inputs.scaledPlayerIds,
      formWindow: inputs.formWindow,
      inputsDigest: result.inputsDigest,
      rulesVersion: result.rulesVersion,
    };
    return success(response);
  } catch (err) {
    console.error('Error simulating match:', err);
    return serverError('Failed to simulate match');
  }
};
