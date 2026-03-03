const inflightEntries = new Map<
  string,
  {
    promise: Promise<unknown>;
    timer: NodeJS.Timeout;
  }
>();

export function withInflight<T>(key: string, ttlMs: number, factory: () => Promise<T>): Promise<T> {
  const existing = inflightEntries.get(key);
  if (existing) {
    return existing.promise as Promise<T>;
  }

  let promise: Promise<T>;
  const timer = setTimeout(() => {
    const current = inflightEntries.get(key);
    if (current?.promise === promise) {
      inflightEntries.delete(key);
    }
  }, ttlMs);
  timer.unref?.();

  promise = (async () => factory())().finally(() => {
    const current = inflightEntries.get(key);
    if (current?.promise === promise) {
      clearTimeout(timer);
      inflightEntries.delete(key);
    }
  });

  inflightEntries.set(key, { promise, timer });
  return promise;
}
