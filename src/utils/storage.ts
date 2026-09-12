import { LOCAL_STORAGE_PREFIX } from "../config/environment";

export const appStorage = {
  getItem(key: string): string | null {
    return window.localStorage.getItem(LOCAL_STORAGE_PREFIX + key);
  },
  setItem(key: string, value: string): void {
    window.localStorage.setItem(LOCAL_STORAGE_PREFIX + key, value);
  },
  removeItem(key: string): void {
    window.localStorage.removeItem(LOCAL_STORAGE_PREFIX + key);
  },
  keys(): string[] {
    return Object.keys(window.localStorage)
      .filter((key) => LOCAL_STORAGE_PREFIX ? key.startsWith(LOCAL_STORAGE_PREFIX) : !key.startsWith("bmx_test:"))
      .map((key) => key.slice(LOCAL_STORAGE_PREFIX.length));
  },
  readJson<T>(key: string, fallback: T): T {
    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_PREFIX + key);
      if (raw === null) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  writeJson(key: string, value: unknown): void {
    window.localStorage.setItem(LOCAL_STORAGE_PREFIX + key, JSON.stringify(value));
  },
};

export const encodeStorageValue = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value);
