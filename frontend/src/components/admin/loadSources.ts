type SourceLoaders = Record<string, () => Promise<unknown>>;

export interface SettledSources<Loaders extends SourceLoaders> {
  /** Only the reads that succeeded have a value. */
  values: { [Key in keyof Loaders]?: Awaited<ReturnType<Loaders[Key]>> };
  failed: (keyof Loaders & string)[];
}

/**
 * Runs each read on its own, so one failure leaves the rest usable. Pass `only`
 * to rerun a subset, which is how Retry avoids refetching what already loaded.
 */
export async function settleSources<Loaders extends SourceLoaders>(
  loaders: Loaders,
  only?: readonly (keyof Loaders & string)[],
): Promise<SettledSources<Loaders>> {
  const keys = only ?? (Object.keys(loaders) as (keyof Loaders & string)[]);
  const results = await Promise.allSettled(keys.map(async (key) => loaders[key]!()));

  const values: SettledSources<Loaders>['values'] = {};
  const failed: SettledSources<Loaders>['failed'] = [];
  results.forEach((result, index) => {
    const key = keys[index]!;
    if (result.status === 'fulfilled') {
      values[key] = result.value as Awaited<ReturnType<Loaders[typeof key]>>;
    } else {
      failed.push(key);
    }
  });
  return { values, failed };
}
