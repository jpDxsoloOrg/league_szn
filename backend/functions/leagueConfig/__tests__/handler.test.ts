import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

const mockCompanies = vi.fn();
const mockShows = vi.fn();
const mockDivisions = vi.fn();
const mockStipulations = vi.fn();
const mockMatchTypes = vi.fn();
const mockVideos = vi.fn();
const mockActivity = vi.fn();
const mockTransfers = vi.fn();
const mockStorylineRequests = vi.fn();

vi.mock('../../companies/handler', () => ({ handler: (...a: unknown[]) => mockCompanies(...a) }));
vi.mock('../../shows/handler', () => ({ handler: (...a: unknown[]) => mockShows(...a) }));
vi.mock('../../divisions/handler', () => ({ handler: (...a: unknown[]) => mockDivisions(...a) }));
vi.mock('../../stipulations/handler', () => ({ handler: (...a: unknown[]) => mockStipulations(...a) }));
vi.mock('../../matchTypes/handler', () => ({ handler: (...a: unknown[]) => mockMatchTypes(...a) }));
vi.mock('../../videos/handler', () => ({ handler: (...a: unknown[]) => mockVideos(...a) }));
vi.mock('../../activity/handler', () => ({ handler: (...a: unknown[]) => mockActivity(...a) }));
vi.mock('../../transfers/handler', () => ({ handler: (...a: unknown[]) => mockTransfers(...a) }));
vi.mock('../../storylineRequests/handler', () => ({ handler: (...a: unknown[]) => mockStorylineRequests(...a) }));

import { handler } from '../handler';

function makeEvent(resource: string, method = 'GET'): APIGatewayProxyEvent {
  return {
    httpMethod: method,
    resource,
    path: resource,
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
  };
}

const ctx = {} as Context;
const noopCb = () => {};

describe('leagueConfig dispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const ok = { statusCode: 200, body: '{}' };
    mockCompanies.mockResolvedValue(ok);
    mockShows.mockResolvedValue(ok);
    mockDivisions.mockResolvedValue(ok);
    mockStipulations.mockResolvedValue(ok);
    mockMatchTypes.mockResolvedValue(ok);
    mockVideos.mockResolvedValue(ok);
    mockActivity.mockResolvedValue(ok);
    mockTransfers.mockResolvedValue(ok);
    mockStorylineRequests.mockResolvedValue(ok);
  });

  const cases: Array<[string, ReturnType<typeof vi.fn>]> = [
    ['/companies', mockCompanies],
    ['/companies/{companyId}', mockCompanies],
    ['/shows', mockShows],
    ['/shows/{showId}', mockShows],
    ['/divisions', mockDivisions],
    ['/divisions/{divisionId}', mockDivisions],
    ['/stipulations', mockStipulations],
    ['/stipulations/{stipulationId}', mockStipulations],
    ['/match-types', mockMatchTypes],
    ['/match-types/{matchTypeId}', mockMatchTypes],
    ['/videos', mockVideos],
    ['/videos/{videoId}', mockVideos],
    ['/admin/videos', mockVideos],
    ['/admin/videos/{videoId}', mockVideos],
    ['/activity', mockActivity],
    ['/transfers', mockTransfers],
    ['/transfers/me', mockTransfers],
    ['/admin/transfers', mockTransfers],
    ['/admin/transfers/{requestId}', mockTransfers],
    ['/storyline-requests', mockStorylineRequests],
    ['/storyline-requests/me', mockStorylineRequests],
    ['/admin/storyline-requests', mockStorylineRequests],
    ['/admin/storyline-requests/{requestId}', mockStorylineRequests],
  ];

  for (const [resource, mockFn] of cases) {
    it(`routes ${resource} to the right sub-handler`, async () => {
      const event = makeEvent(resource);
      await handler(event, ctx, noopCb);
      expect(mockFn).toHaveBeenCalledWith(event, ctx, noopCb);
    });
  }

  it('returns 404 for an unknown resource', async () => {
    const event = makeEvent('/nope');
    const result = await handler(event, ctx, noopCb);
    expect(result?.statusCode).toBe(404);
    for (const m of [mockCompanies, mockShows, mockDivisions, mockStipulations, mockMatchTypes, mockVideos, mockActivity, mockTransfers, mockStorylineRequests]) {
      expect(m).not.toHaveBeenCalled();
    }
  });
});
