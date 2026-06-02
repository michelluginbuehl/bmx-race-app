export const appStorage = {
  getItem(key: string): string | null {
    return window.localStorage.getItem(key);
  },
  setItem(key: string, value: string): void {
    window.localStorage.setItem(key, value);
  },
  removeItem(key: string): void {
    window.localStorage.removeItem(key);
  },
  keys(): string[] {
    return Object.keys(window.localStorage);
  },
  readJson<T>(key: string, fallback: T): T {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  writeJson(key: string, value: unknown): void {
    window.localStorage.setItem(key, JSON.stringify(value));
  },
};

export const encodeStorageValue = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value);
