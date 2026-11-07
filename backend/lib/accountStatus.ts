import type { APIGatewayProxyEvent } from 'aws-lambda';
import { dynamoDb, TableNames } from './dynamodb';
import { isDeactivated, isSignupBlocked, toSignupGuardKey, type DisciplineFields } from './discipline';

/**
 * Account checks that run on the token and signup paths. They read DynamoDB
 * directly, with no repository or Cognito client, to keep cold starts small.
 *
 * Every check fails open: a DynamoDB problem must not sign everyone out or stop
 * signups (owner decision 18). Cognito disable still blocks refresh, and the
 * handler gates still apply. With no table configured, which is only the case
 * in unit tests and scripts, there is nothing to read and no request is sent.
 */
export const ACCOUNT_CHECK_TIMEOUT_MS = 1500;

interface SignupGuardRow extends DisciplineFields {
  playerId: string;
  signupGuardKey?: string;
  psnId?: string;
}

async function failOpen(label: string, check: () => Promise<boolean>): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`${label} timed out after ${ACCOUNT_CHECK_TIMEOUT_MS}ms; allowing`);
      resolve(false);
    }, ACCOUNT_CHECK_TIMEOUT_MS);
  });
  try {
    return await Promise.race([check(), timedOut]);
  } catch (err) {
    console.error(`${label} failed; allowing:`, err);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * True when any non-deleted row for this sub is deactivated, read straight from
 * UserIdIndex. The index does not enforce one row per sub, so every row counts.
 * Fails open: a timeout or error logs and returns false.
 */
export async function isAccountDeactivated(sub: string): Promise<boolean> {
  return failOpen('Account status check', async () => {
    if (!TableNames.PLAYERS) return false;
    const rows = await dynamoDb.queryAll({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': sub },
      ProjectionExpression: 'deactivatedAt, deletedAt',
    });
    return rows.some((row) => !row.deletedAt && isDeactivated(row as DisciplineFields));
  });
}

const callerChecks = new WeakMap<APIGatewayProxyEvent, Promise<boolean>>();

/** The same, remembered per event so one request pays for one query. */
export function isCallerDeactivated(event: APIGatewayProxyEvent, sub: string): Promise<boolean> {
  const remembered = callerChecks.get(event);
  if (remembered) return remembered;
  const check = isAccountDeactivated(sub);
  callerChecks.set(event, check);
  return check;
}

const normalizePsnId = (psnId: string): string => psnId.trim().toLowerCase();

/**
 * True when an isSignupBlocked row matches the guard key or PSN ID (trimmed,
 * ignoring case). Same timeout, fails open. Only rows with strikes can match.
 */
export async function isSignupRefused(input: {
  email?: string;
  psnId?: string;
  excludePlayerId?: string;
}): Promise<boolean> {
  const guardKey = input.email ? toSignupGuardKey(input.email) : '';
  const psnId = input.psnId ? normalizePsnId(input.psnId) : '';
  if (!guardKey && !psnId) return false;

  return failOpen('Signup guard check', async () => {
    if (!TableNames.PLAYERS) return false;
    const rows = await dynamoDb.scanAll({
      TableName: TableNames.PLAYERS,
      FilterExpression: 'attribute_exists(strikes) AND attribute_not_exists(deletedAt)',
      ProjectionExpression: 'playerId, strikes, deactivatedAt, signupGuardKey, psnId',
    }) as unknown as SignupGuardRow[];
    const now = new Date();
    return rows.some((row) => {
      if (row.playerId === input.excludePlayerId) return false;
      const matches = (guardKey !== '' && row.signupGuardKey === guardKey)
        || (psnId !== '' && row.psnId !== undefined && normalizePsnId(row.psnId) === psnId);
      return matches && isSignupBlocked(row, now);
    });
  });
}
