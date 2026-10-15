// Web is network-only: nothing is persisted.
export const storeAvailable = false;

export async function readStored<T>(_userId: string, _key: string): Promise<T | undefined> {
  return undefined;
}

export async function writeStored<T>(_userId: string, _key: string, _value: T): Promise<void> {}

export async function updateStored<T>(_userId: string, _key: string, _update: (current: T) => T): Promise<void> {}

export async function removeStored(_userId: string, _key: string): Promise<void> {}

export async function clearStore(): Promise<void> {}

export async function pruneStoreExcept(_userId: string): Promise<void> {}
