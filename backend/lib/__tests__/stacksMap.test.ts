import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

type StacksMap = (resource: { Type: string }) => { destination: string } | undefined;

const stacksMap = createRequire(__filename)('../../stacks-map.js') as StacksMap;

describe('stacks-map', () => {
  it('keeps EventBridge rules out of the root stack', () => {
    expect(stacksMap({ Type: 'AWS::Events::Rule' })?.destination).toBe('Overflow');
  });
});
