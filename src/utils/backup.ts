import { APP_NAME, APP_VERSION, DATA_SCHEMA_VERSION } from "../config/appConfig";

export type BackupEnvelope<T = unknown> = {
  appName: string;
  appVersion: string;
  schemaVersion: number;
  createdAt: string;
  data: T;
};

export type BackupValidationResult = {
  valid: boolean;
  errors: string[];
};

function sanitizeFileName(value: string): string {
  return value
    .replace(/[ä]/g, "ae")
    .replace(/[ö]/g, "oe")
    .replace(/[ü]/g, "ue")
    .replace(/[Ä]/g, "Ae")
    .replace(/[Ö]/g, "Oe")
    .replace(/[Ü]/g, "Ue")
    .replace(/[ß]/g, "ss")
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function createBackupEnvelope<T>(data: T): BackupEnvelope<T> {
  return {
    appName: APP_NAME,
    appVersion: APP_VERSION,
    schemaVersion: DATA_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    data,
  };
}

export function getBackupSummary(backup: unknown): string {
  if (!backup || typeof backup !== "object") {
    return "Ungültiges Backup";
  }

  const item = backup as Partial<BackupEnvelope>;

  const appName = item.appName ?? "Unbekannte App";
  const appVersion = item.appVersion ?? "unbekannte Version";
  const createdAt = item.createdAt
    ? new Date(item.createdAt).toLocaleString()
    : "unbekanntes Datum";

  return `${appName} ${appVersion} – erstellt am ${createdAt}`;
}

export function validateBackupStructure(backup: unknown): BackupValidationResult {
  const errors: string[] = [];

  if (!backup || typeof backup !== "object") {
    return {
      valid: false,
      errors: ["Backup ist kein gültiges Objekt."],
    };
  }

  const item = backup as Partial<BackupEnvelope>;

  if (!item.appName) {
    errors.push("Backup enthält keinen App-Namen.");
  }

  if (!item.appVersion) {
    errors.push("Backup enthält keine App-Version.");
  }

  if (!item.schemaVersion) {
    errors.push("Backup enthält keine Schema-Version.");
  }

  if (!item.createdAt) {
    errors.push("Backup enthält kein Erstellungsdatum.");
  }

  if (!("data" in item)) {
    errors.push("Backup enthält keine Daten.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function normalizeManagedEventsForSchema<T>(managedEvents: T): T {
  // Aktuell keine Migration nötig. Diese Funktion bleibt bewusst als stabile
  // Schnittstelle bestehen, falls spätere Datenversionen angepasst werden müssen.
  return managedEvents;
}

export function createBackupFileName(label = "backup"): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `bmx-race-backup_${sanitizeFileName(label)}_${timestamp}.json`;
}

export function downloadJsonBackup(data: unknown, label = "manual"): void {
  const fileName = createBackupFileName(label);
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

export async function readJsonBackup<T>(file: File): Promise<T> {
  const text = await file.text();
  return JSON.parse(text) as T;
}
