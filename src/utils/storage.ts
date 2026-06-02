export type StorageValue<T> = {
  schemaVersion: number;
  savedAt: string;
  data: T;
};

export function encodeStorageValue<T>(data: T, schemaVersion = 1): string {
  const value: StorageValue<T> = {
    schemaVersion,
    savedAt: new Date().toISOString(),
    data,
  };

  return JSON.stringify(value);
}

function decodeStorageValue<T>(raw: string | null): T | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);

    if (
      parsed &&
      typeof parsed === "object" &&
      "data" in parsed &&
      "schemaVersion" in parsed
    ) {
      return parsed.data as T;
    }

    return parsed as T;
  } catch {
    return null;
  }
}

export const appStorage = {
  get<T>(key: string, fallbackValue: T): T {
    const decoded = decodeStorageValue<T>(localStorage.getItem(key));
    return decoded ?? fallbackValue;
  },

  set<T>(key: string, value: T): void {
    localStorage.setItem(key, encodeStorageValue(value));
  },

  remove(key: string): void {
    localStorage.removeItem(key);
  },

  clear(): void {
    localStorage.clear();
  },

  exists(key: string): boolean {
    return localStorage.getItem(key) !== null;
  },
};

export function saveToStorage<T>(key: string, data: T): void {
  appStorage.set(key, data);
}

export function loadFromStorage<T>(key: string, fallbackValue: T): T {
  return appStorage.get(key, fallbackValue);
}

export function clearStorage(key: string): void {
  appStorage.remove(key);
}

export function storageExists(key: string): boolean {
  return appStorage.exists(key);
}
