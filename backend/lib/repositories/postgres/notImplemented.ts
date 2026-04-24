// Proxy-based stub for aggregate repositories the postgres driver doesn't
// yet implement. Any property access descends into a nested proxy; invoking
// the resulting function throws a clear error. So both `repos.season.list()`
// and `repos.competition.matches.list()` fail at call time, not lookup time.

export function notImplementedAggregate<T>(aggregateName: string): T {
  const handler: ProxyHandler<(...args: unknown[]) => unknown> = {
    get(_target, prop) {
      if (prop === 'then') return undefined; // not a thenable
      return notImplementedAggregate(`${aggregateName}.${String(prop)}`);
    },
    apply() {
      throw new Error(
        `PostgresDriver: ${aggregateName} is not implemented yet. ` +
          `Only the roster aggregate is currently supported by DB_DRIVER=postgres.`,
      );
    },
  };
  const fn = (() => undefined) as (...args: unknown[]) => unknown;
  return new Proxy(fn, handler) as unknown as T;
}
