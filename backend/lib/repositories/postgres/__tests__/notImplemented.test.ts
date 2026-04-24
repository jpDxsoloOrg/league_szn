import { describe, it, expect } from 'vitest';
import { notImplementedAggregate } from '../notImplemented';

describe('notImplementedAggregate', () => {
  it('throws with the aggregate name when a direct method is invoked', () => {
    const stub = notImplementedAggregate<{ list(): Promise<unknown> }>('competition');
    expect(() => stub.list()).toThrow(/competition\.list is not implemented/);
  });

  it('throws for nested sub-repository method calls', () => {
    const stub = notImplementedAggregate<{
      matches: { findById(id: string): Promise<unknown> };
    }>('competition');
    expect(() => stub.matches.findById('x')).toThrow(
      /competition\.matches\.findById is not implemented/,
    );
  });

  it('returns undefined for the `then` property so it is not a thenable', () => {
    const stub = notImplementedAggregate<Record<string, unknown>>('season');
    expect((stub as { then?: unknown }).then).toBeUndefined();
  });
});
