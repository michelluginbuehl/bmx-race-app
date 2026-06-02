import { APP_CONFIG } from "../config/appConfig";

export function saveToStorage<T>(data: T): void {
  try {
    localStorage.setItem(APP_CONFIG.storageKey, JSON.stringify(data));
  } catch (error) {
    console.error("Daten konnten nicht gespeichert werden:", error);
  }
}

export function loadFromStorage<T>(): T | null {
  try {
    const raw = localStorage.getItem(APP_CONFIG.storageKey);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as T;
  } catch (error) {
    console.error("Daten konnten nicht geladen werden:", error);
    return null;
  }
}

export function clearStorage(): void {
  try {
    localStorage.removeItem(APP_CONFIG.storageKey);
  } catch (error) {
    console.error("Daten konnten nicht gelöscht werden:", error);
  }
}

export function storageExists(): boolean {
  return localStorage.getItem(APP_CONFIG.storageKey) !== null;
}
