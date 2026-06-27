/**
 * Run query thunks in sequential chunks of `chunkSize`. Peak concurrent
 * thunks = chunkSize. Result order matches input order, with full tuple typing
 * preserved per slot — destructure exactly like `await Promise.all([...])`.
 *
 * Use when issuing more than `pool.max - 1` prisma queries to the same client
 * within one request (per-tenant pool is capped at 4 — see lib/prisma.ts).
 *
 * Example:
 *   const [rowsA, rowsB, rowsC] = await runChunkedQueries(
 *     3,
 *     () => prisma.a.findMany({...}),
 *     () => prisma.b.findMany({...}),
 *     () => prisma.c.findMany({...}),
 *   );
 */
export async function runChunkedQueries<T extends readonly unknown[]>(
  chunkSize: number,
  ...thunks: { [K in keyof T]: () => Promise<T[K]> }
): Promise<T> {
  if (chunkSize < 1) throw new Error("chunkSize must be >= 1");
  const out: unknown[] = new Array(thunks.length);
  for (let i = 0; i < thunks.length; i += chunkSize) {
    const slice = thunks.slice(i, i + chunkSize) as Array<() => Promise<unknown>>;
    const settled = await Promise.all(slice.map((fn) => fn()));
    for (let j = 0; j < settled.length; j++) out[i + j] = settled[j];
  }
  return out as unknown as T;
}

/**
 * Sister to runChunkedQueries that returns `PromiseSettledResult` per slot,
 * matching `Promise.allSettled` semantics. Use when individual query failures
 * must be tolerated and inspected positionally.
 */
export async function runChunkedSettled<T extends readonly unknown[]>(
  chunkSize: number,
  ...thunks: { [K in keyof T]: () => Promise<T[K]> }
): Promise<{ [K in keyof T]: PromiseSettledResult<T[K]> }> {
  if (chunkSize < 1) throw new Error("chunkSize must be >= 1");
  const out: PromiseSettledResult<unknown>[] = new Array(thunks.length);
  for (let i = 0; i < thunks.length; i += chunkSize) {
    const slice = thunks.slice(i, i + chunkSize) as Array<() => Promise<unknown>>;
    const settled = await Promise.allSettled(slice.map((fn) => fn()));
    for (let j = 0; j < settled.length; j++) out[i + j] = settled[j];
  }
  return out as unknown as { [K in keyof T]: PromiseSettledResult<T[K]> };
}
