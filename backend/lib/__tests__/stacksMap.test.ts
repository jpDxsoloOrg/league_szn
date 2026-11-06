import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

type StacksMap = (resource: { Type: string }) => { destination: string } | undefined;
type CloudFormationTemplate = { Resources: Record<string, unknown> };

interface StackCycleChecker {
  buildDependencyGraph: (template: CloudFormationTemplate) => Map<string, Set<string>>;
  findCycle: (graph: Map<string, Set<string>>) => string[] | null;
}

const load = createRequire(__filename);
const stacksMap = load('../../stacks-map.js') as StacksMap;
const { buildDependencyGraph, findCycle } = load('../../scripts/check-stack-cycles.js') as StackCycleChecker;

const cycleIn = (Resources: Record<string, unknown>): string[] | null =>
  findCycle(buildDependencyGraph({ Resources }));

describe('stacks-map', () => {
  it('keeps EventBridge rules out of the root stack', () => {
    expect(stacksMap({ Type: 'AWS::Events::Rule' })?.destination).toBe('Overflow');
  });

  it('keeps a new permission in the same stack as its new function', () => {
    expect(stacksMap({ Type: 'AWS::Lambda::Permission' })?.destination).toBe(
      stacksMap({ Type: 'AWS::Lambda::Function' })?.destination,
    );
  });
});

describe('check-stack-cycles', () => {
  it('passes a chain of nested stacks', () => {
    expect(cycleIn({
      PermissionsNestedStack: {},
      OverflowNestedStack: { DependsOn: 'PermissionsNestedStack' },
    })).toBeNull();
  });

  it('finds a cycle made of a DependsOn and a parameter reference', () => {
    const cycle = cycleIn({
      OverflowNestedStack: { DependsOn: ['PermissionsNestedStack'] },
      PermissionsNestedStack: {
        Properties: {
          Parameters: {
            FunctionArnParameter: { 'Fn::GetAtt': ['OverflowNestedStack', 'Outputs.FunctionArn'] },
          },
        },
      },
    });
    expect(cycle).toEqual(expect.arrayContaining(['OverflowNestedStack', 'PermissionsNestedStack']));
  });

  it('finds a cycle that runs through a root resource', () => {
    expect(cycleIn({
      OverflowNestedStack: { DependsOn: ['ApiGatewayMethodGet'] },
      ApiGatewayMethodGet: { DependsOn: ['PermissionsNestedStack'] },
      PermissionsNestedStack: { Properties: { Target: { Ref: 'OverflowNestedStack' } } },
    })).not.toBeNull();
  });

  it('reads references inside Fn::Sub and ignores parameters', () => {
    expect(cycleIn({
      First: { Properties: { Value: { 'Fn::Sub': '${Second.Arn}/${AWS::Region}' } } },
      Second: { Properties: { Value: { Ref: 'First' }, Stage: { Ref: 'SomeParameter' } } },
    })).not.toBeNull();
  });
});
