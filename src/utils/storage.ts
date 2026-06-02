import { APP_CONFIG } from "../config/appConfig";

export function saveToStorage<T>(data: T): void {
  localStorage.setItem(APP_CONFIG.storageKey, JSON.stringify(data));
}

export function loadFromStorage<T>(): T | null {
  const raw = localStorage.getItem(APP_CONFIG.storageKey);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function clearStorage(): void {
  localStorage.removeItem(APP_CONFIG.storageKey);
}
