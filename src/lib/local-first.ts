import { readStored, writeStored } from "./local-store";

const inflight = new Map<string, Promise<unknown>>();

// Reads storage only; the network is used on a miss or an explicit refresh, and the result is always written back.
export async function localFirst<T>(userId: string, key: string, fetcher: () => Promise<T>, options: { force?: boolean } = {}): Promise<T> {
  const id = `${userId}|${key}`;
  if (!options.force) {
    const stored = await readStored<T>(userId, key);
    if (stored !== undefined) return stored;
    const pending = inflight.get(id);
    if (pending) return pending as Promise<T>;
  }
  const run = fetcher().then(async (value) => {
    if (value !== null) await writeStored(userId, key, value);
    return value;
  });
  if (!options.force) {
    inflight.set(id, run);
    const cleanup = () => { if (inflight.get(id) === run) inflight.delete(id); };
    run.then(cleanup, cleanup);
  }
  return run;
}
