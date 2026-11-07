import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { getAuthContext, requireRole } from '../../lib/auth';
import {
  computeDiscipline,
  isDeactivated,
  nextStrikeOutcome,
  toSignupGuardKey,
  validateReason,
  type StrikeOutcome,
} from '../../lib/discipline';
import {
  clearSoftHolds,
  disableAccount,
  disciplineConflict,
  emptyHoldings,
  getHoldings,
  isValidVersion,
  notifyDiscipline,
  readAccount,
  readIsStaffAccount,
  resolveActorName,
  type AccountRecord,
  type AccountSync,
  type DisciplineActionResult,
  type DisciplineHoldings,
} from '../../lib/disciplineActions';
import { parseBody } from '../../lib/parseBody';
import { getRepositories } from '../../lib/repositories';
import { ConcurrencyError } from '../../lib/repositories/errors';
import type { Player, PlayerDeactivation, PlayerStrike } from '../../lib/repositories/types';
import { badRequest, created, notFound, refused, serverError } from '../../lib/response';

interface IssueStrikeBody {
  reason?: unknown;
  expectedVersion?: unknown;
  expectedOutcome?: unknown;
}

const OUTCOMES: readonly unknown[] = ['warned', 'signup-blocked', 'deactivated'] satisfies StrikeOutcome[];

/** Message for a strike that does not deactivate. A deactivated player cannot sign in to read one. */
export function strikeMessage(outcome: StrikeOutcome, priorActiveStrikes: number): string {
  if (outcome === 'warned') return 'You received a strike. Check your profile for details.';
  return priorActiveStrikes === 1
    ? 'You received a second strike. You cannot sign up for matches for 7 days.'
    : 'You received another strike. You cannot sign up for matches for 7 days from now.';
}

async function holdingsOrEmpty(playerId: string): Promise<DisciplineHoldings> {
  try {
    return await getHoldings(playerId);
  } catch (err) {
    console.error('Failed to read holdings after deactivation:', err);
    return emptyHoldings();
  }
}

/** Disables the login first, since everything after it is slower and less important. */
async function finishDeactivation(
  player: Player,
  account: AccountRecord | null,
): Promise<Pick<DisciplineActionResult, 'accountSync' | 'softHoldsCleared' | 'holdings'>> {
  let accountSync: AccountSync = 'not-linked';
  if (player.userId && account) {
    accountSync = account.enabled ? await disableAccount(player.userId) : 'not-needed';
  }
  const softHoldsCleared = await clearSoftHolds(player.playerId);
  return { accountSync, softHoldsCleared, holdings: await holdingsOrEmpty(player.playerId) };
}

/** POST /players/{playerId}/strikes. Writes the row first, so enforcement starts even if a later step fails. */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    const playerId = event.pathParameters?.playerId;
    if (!playerId) return badRequest('Player ID is required');

    const { roster: { players } } = getRepositories();
    const player = await players.findById(playerId);
    if (!player) return notFound('Player not found');
    if (isDeactivated(player)) return refused(409, 'ALREADY_DEACTIVATED', 'This player is already deactivated');

    const { data: body, error: parseError } = parseBody<IssueStrikeBody>(event);
    if (parseError) return parseError;
    const validated = validateReason(body.reason);
    if ('error' in validated) return badRequest(validated.error);
    if (!isValidVersion(body.expectedVersion)) return badRequest('expectedVersion is required');
    if (!OUTCOMES.includes(body.expectedOutcome)) return badRequest('expectedOutcome is required');

    const now = new Date();
    const version = player.disciplineVersion ?? 0;
    const outcome = nextStrikeOutcome(player, now);
    if (body.expectedVersion !== version || body.expectedOutcome !== outcome) return disciplineConflict();

    // A dead link reads as no account. Any other Cognito error stops here, with nothing written.
    let hasAccount = false;
    let account: AccountRecord | null = null;
    if (player.userId) {
      const isStaffAccount = await readIsStaffAccount(player.userId);
      if (isStaffAccount) return refused(409, 'STAFF_PROTECTED', 'Remove this player\'s staff role first');
      hasAccount = isStaffAccount !== null;
      if (hasAccount && outcome !== 'warned') {
        account = await readAccount(player.userId);
        hasAccount = account !== null;
      }
    }

    const auth = getAuthContext(event);
    const actorName = await resolveActorName(auth);
    const issuedAt = now.toISOString();
    const strike: PlayerStrike = {
      strikeId: uuidv4(),
      issuedAt,
      issuedBy: auth.sub,
      issuedByName: actorName,
      reason: validated.reason,
    };
    const deactivation: PlayerDeactivation | null = outcome === 'deactivated'
      ? {
        deactivatedAt: issuedAt,
        deactivatedBy: auth.sub,
        deactivatedByName: actorName,
        strikeId: strike.strikeId,
        ...(account?.enabled === false ? { cognitoAlreadyDisabled: true } : {}),
      }
      : null;

    const priorActiveStrikes = computeDiscipline(player, now).activeStrikeCount;
    let updated: Player;
    try {
      updated = await players.updateDiscipline(playerId, {
        strikes: [...(player.strikes ?? []), strike],
        deactivations: [...(player.deactivations ?? []), ...(deactivation ? [deactivation] : [])],
        deactivatedAt: deactivation ? issuedAt : null,
        ...(account?.email ? { signupGuardKey: toSignupGuardKey(account.email) } : {}),
      }, version);
    } catch (err) {
      if (err instanceof ConcurrencyError) return disciplineConflict();
      throw err;
    }

    const base = { playerId, version: updated.disciplineVersion ?? 0, summary: computeDiscipline(updated, now) };

    if (outcome === 'deactivated') {
      const result: DisciplineActionResult = { ...base, ...(await finishDeactivation(player, account)) };
      return created(result);
    }

    const softHoldsCleared = outcome === 'signup-blocked' ? await clearSoftHolds(playerId) : true;
    await notifyDiscipline(
      hasAccount ? player.userId : undefined,
      'strike_issued',
      strikeMessage(outcome, priorActiveStrikes),
      strike.strikeId,
    );
    const result: DisciplineActionResult = {
      ...base,
      accountSync: 'not-needed',
      softHoldsCleared,
      holdings: emptyHoldings(),
    };
    return created(result);
  } catch (err) {
    console.error('Error issuing strike:', err);
    return serverError('Failed to issue strike');
  }
};
