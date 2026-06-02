import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from "../config/appConfig";

export type StorageValue<T> = {
  schemaVersion: number;
  savedAt: string;
  data: T;
};

export function encodeStorageValue<T>(data: T, schemaVersion = 1): string {
  return JSON.stringify({
    schemaVersion,
    savedAt: new Date().toISOString(),
    data,
  });
}

export function decodeStorageValue<T>(raw: string | null): T | null {
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

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function candidateKeysFor(key: string): string[] {
  if (key === STORAGE_KEYS.managedEvents) {
    return unique([key, ...LEGACY_STORAGE_KEYS.managedEvents]);
  }

  if (key === STORAGE_KEYS.activeEventId) {
    return unique([key, ...LEGACY_STORAGE_KEYS.activeEventId]);
  }

  if (key === STORAGE_KEYS.appSettings) {
    return unique([key, ...LEGACY_STORAGE_KEYS.appSettings]);
  }

  if (key === STORAGE_KEYS.duplicateOkKeys) {
    return unique([key, ...LEGACY_STORAGE_KEYS.duplicateOkKeys]);
  }

  return [key];
}

function getFirstExistingRawValue(key: string): string | null {
  for (const candidate of candidateKeysFor(key)) {
    const value = localStorage.getItem(candidate);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function mirrorToLegacyKeys(key: string, value: string): void {
  // Nur die wichtigsten Daten spiegeln. So bleiben alte App-Stände lesbar.
  for (const candidate of candidateKeysFor(key)) {
    try {
      localStorage.setItem(candidate, value);
    } catch {
      // Einzelne fehlgeschlagene Spiegelungen sollen die App nicht blockieren.
    }
  }
}

export const appStorage = {
  get<T>(key: string, fallbackValue: T): T {
    const raw = getFirstExistingRawValue(key);
    const decoded = decodeStorageValue<T>(raw);
    return decoded ?? fallbackValue;
  },

  set<T>(key: string, value: T): void {
    // Bewusst als normaler JSON-Wert speichern. Das vermeidet verschachtelte
    // Speicherformate und ist kompatibler mit bestehendem App-Code.
    const raw = JSON.stringify(value);
    mirrorToLegacyKeys(key, raw);
  },

  remove(key: string): void {
    for (const candidate of candidateKeysFor(key)) {
      localStorage.removeItem(candidate);
    }
  },

  clear(): void {
    localStorage.clear();
  },

  exists(key: string): boolean {
    return getFirstExistingRawValue(key) !== null;
  },

  getItem(key: string): string | null {
    return getFirstExistingRawValue(key);
  },

  setItem(key: string, value: string): void {
    mirrorToLegacyKeys(key, value);
  },

  removeItem(key: string): void {
    this.remove(key);
  },

  keys(): string[] {
    const result: string[] = [];

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key) result.push(key);
    }

    return result;
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
