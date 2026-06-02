import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from "../config/appConfig";

export type StorageValue<T> = {
  schemaVersion: number;
  savedAt: string;
  data: T;
};

function isStorageEnvelope(value: unknown): value is StorageValue<unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    "data" in value &&
    "schemaVersion" in value &&
    "savedAt" in value
  );
}

function tryParseJson(raw: string | null): unknown {
  if (raw === null) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function unwrapStorageEnvelope(value: unknown): unknown {
  let current = value;

  // Mehrfach entpacken, falls alte Versionen versehentlich verschachtelt gespeichert haben.
  for (let index = 0; index < 5; index += 1) {
    if (typeof current === "string") {
      const parsed = tryParseJson(current);
      if (parsed === current) return current;
      current = parsed;
      continue;
    }

    if (isStorageEnvelope(current)) {
      current = current.data;
      continue;
    }

    return current;
  }

  return current;
}

function toPlainStorageString(value: string): string {
  const parsed = tryParseJson(value);
  const unwrapped = unwrapStorageEnvelope(parsed);

  if (typeof unwrapped === "string") {
    return JSON.stringify(unwrapped);
  }

  return JSON.stringify(unwrapped);
}

export function encodeStorageValue<T>(data: T, schemaVersion = 1): string {
  return JSON.stringify({
    schemaVersion,
    savedAt: new Date().toISOString(),
    data,
  });
}

export function decodeStorageValue<T>(raw: string | null): T | null {
  if (!raw) return null;

  const parsed = tryParseJson(raw);
  const unwrapped = unwrapStorageEnvelope(parsed);

  if (unwrapped === null || unwrapped === undefined) return null;

  return unwrapped as T;
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

function mirrorToCandidateKeys(key: string, value: string): void {
  const plain = toPlainStorageString(value);

  for (const candidate of candidateKeysFor(key)) {
    try {
      localStorage.setItem(candidate, plain);
    } catch {
      // Einzelne fehlgeschlagene Spiegelungen sollen die App nicht blockieren.
    }
  }
}

export const appStorage = {
  get<T>(key: string, fallbackValue: T): T {
    const decoded = decodeStorageValue<T>(getFirstExistingRawValue(key));
    return decoded ?? fallbackValue;
  },

  set<T>(key: string, value: T): void {
    mirrorToCandidateKeys(key, JSON.stringify(value));
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

  /**
   * localStorage-kompatibel:
   * App.tsx verwendet getItem() oft direkt mit JSON.parse(...).
   * Deshalb gibt getItem() immer den eigentlichen gespeicherten Wert zurück,
   * nicht den technischen Envelope von encodeStorageValue().
   */
  getItem(key: string): string | null {
    const raw = getFirstExistingRawValue(key);
    if (raw === null) return null;

    const decoded = decodeStorageValue<unknown>(raw);

    if (decoded === null || decoded === undefined) return null;

    return JSON.stringify(decoded);
  },

  /**
   * localStorage-kompatibel:
   * Wenn App.tsx einen mit encodeStorageValue() erzeugten String speichert,
   * wird dieser hier sofort entpackt. Dadurch funktionieren spätere
   * JSON.parse(appStorage.getItem(...)) Aufrufe wieder stabil.
   */
  setItem(key: string, value: string): void {
    mirrorToCandidateKeys(key, value);
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
