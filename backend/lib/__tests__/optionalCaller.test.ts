import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const { mockAuthenticate } = vi.hoisted(() => ({ mockAuthenticate: vi.fn() }));
vi.mock('../authenticate', () => ({ authenticate: mockAuthenticate }));

import { canViewHiddenPlayer, getVerifiedCaller, isStaff } from '../optionalCaller';
import { bearer, fakeAuthenticate, makeEvent } from '../../functions/__tests__/visibilityTestHelpers';

const spoofedEvent = (): APIGatewayProxyEvent =>
  makeEvent({
    requestContext: {
      authorizer: { principalId: 'admin-sub', groups: 'Admin' },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  });

describe('optionalCaller', () => {
  beforeEach(() => {
    mockAuthenticate.mockReset();
    mockAuthenticate.mockImplementation(fakeAuthenticate);
  });

  it('treats a request with no token as anonymous without verifying anything', async () => {
    expect(await getVerifiedCaller(makeEvent())).toBeNull();
    expect(mockAuthenticate).not.toHaveBeenCalled();
  });

  it('ignores authorizer context that no verified token backs', async () => {
    expect(await getVerifiedCaller(spoofedEvent())).toBeNull();
  });

  it('treats a rejected token as anonymous', async () => {
    const event = makeEvent({ headers: { Authorization: 'Bearer invalid' } });
    expect(await getVerifiedCaller(event)).toBeNull();
  });

  it('treats a verification error as anonymous', async () => {
    mockAuthenticate.mockRejectedValue(new Error('jwks unavailable'));
    expect(await getVerifiedCaller(makeEvent(bearer('s', 'Admin')))).toBeNull();
  });

  it.each([
    ['Admin', true],
    ['Moderator', true],
    ['Wrestler', false],
    ['Fantasy', false],
    ['', false],
  ])('isStaff for groups %j is %s', async (groups, expected) => {
    const caller = await getVerifiedCaller(makeEvent(bearer('s', groups)));
    expect(isStaff(caller)).toBe(expected);
  });

  it('isStaff is false for an anonymous caller', () => {
    expect(isStaff(null)).toBe(false);
  });

  it('lets a player or staff view a hidden player, and nobody else', async () => {
    const player = { userId: 'owner' };
    const canView = (sub: string, groups: string): Promise<boolean> =>
      canViewHiddenPlayer(makeEvent(bearer(sub, groups)), player);

    expect(await canView('owner', 'Wrestler')).toBe(true);
    expect(await canView('mod', 'Moderator')).toBe(true);
    expect(await canView('someone-else', 'Wrestler')).toBe(false);
    expect(await canViewHiddenPlayer(makeEvent(), player)).toBe(false);
  });

  it('does not match a blank caller to a player with no linked user', async () => {
    expect(await canViewHiddenPlayer(makeEvent(bearer('', 'Wrestler')), {})).toBe(false);
  });
});
