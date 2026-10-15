import * as SQLite from "expo-sqlite";
import { emitStoreChange } from "./store-events";

export const storeAvailable = true;

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

function report(action: string, error: unknown) {
  if (__DEV__) console.warn(`[local-store] ${action} failed`, error);
}

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync("travelbuddy-store.db")
      .then(async (database) => {
        await database.execAsync(`
          PRAGMA journal_mode = WAL;
          CREATE TABLE IF NOT EXISTS records (
            user_id TEXT NOT NULL,
            key TEXT NOT NULL,
            payload TEXT NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, key)
          );
        `);
        SQLite.deleteDatabaseAsync("travelbuddy-cache.db").catch(() => undefined);
        return database;
      })
      .catch((error: unknown) => {
        databasePromise = null;
        throw error;
      });
  }
  return databasePromise;
}

export async function readStored<T>(userId: string, key: string): Promise<T | undefined> {
  try {
    const database = await getDatabase();
    const row = await database.getFirstAsync<{ payload: string }>("SELECT payload FROM records WHERE user_id = ? AND key = ?", userId, key);
    return row ? JSON.parse(row.payload) as T : undefined;
  } catch (error) {
    report(`read ${key}`, error);
    return undefined;
  }
}

export async function writeStored<T>(userId: string, key: string, value: T): Promise<void> {
  try {
    const database = await getDatabase();
    await database.runAsync(
      `INSERT INTO records (user_id, key, payload, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
      userId,
      key,
      JSON.stringify(value),
      Date.now(),
    );
    emitStoreChange();
  } catch (error) {
    report(`write ${key}`, error);
  }
}

export async function updateStored<T>(userId: string, key: string, update: (current: T) => T): Promise<void> {
  const current = await readStored<T>(userId, key);
  if (current !== undefined) await writeStored(userId, key, update(current));
}

export async function removeStored(userId: string, key: string): Promise<void> {
  try {
    const database = await getDatabase();
    await database.runAsync("DELETE FROM records WHERE user_id = ? AND key = ?", userId, key);
    emitStoreChange();
  } catch (error) {
    report(`remove ${key}`, error);
  }
}

export async function clearStore(): Promise<void> {
  try {
    const database = await getDatabase();
    await database.runAsync("DELETE FROM records");
    emitStoreChange();
  } catch (error) {
    report("clear", error);
  }
}

export async function pruneStoreExcept(userId: string): Promise<void> {
  try {
    const database = await getDatabase();
    await database.runAsync("DELETE FROM records WHERE user_id <> ?", userId);
  } catch (error) {
    report("prune", error);
  }
}
