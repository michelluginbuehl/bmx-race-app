import { APP_NAME, APP_VERSION, DATA_SCHEMA_VERSION } from "../config/appConfig";

export type BackupEnvelope<T = unknown> = {
  appName: string;
  appVersion: string;
  backupVersion: string;
  schemaVersion: number;
  dataSchemaVersion: number;
  schemaNote: string;
  createdAt: string;
  exportedAt: string;
  data: T;
};

export type BackupValidationResult = {
  ok: boolean;
  valid: boolean;
  message: string;
  errors: string[];
};

export type BackupSummary = {
  schemaNote: string;
  exportedAt: string;
  eventCount: number;
  riderCount: number;
  appDataCount: number;
  backupVersion: string;
  dataSchemaVersion: number;
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

function countRidersInUnknownData(data: unknown): number {
  if (!data || typeof data !== "object") return 0;

  const root = data as Record<string, unknown>;

  if (Array.isArray(root.riders)) {
    return root.riders.length;
  }

  if (Array.isArray(root.managedEvents)) {
    return root.managedEvents.reduce((total, event) => {
      if (!event || typeof event !== "object") return total;
      const eventRecord = event as Record<string, unknown>;
      return total + (Array.isArray(eventRecord.riders) ? eventRecord.riders.length : 0);
    }, 0);
  }

  if (Array.isArray(root.events)) {
    return root.events.reduce((total, event) => {
      if (!event || typeof event !== "object") return total;
      const eventRecord = event as Record<string, unknown>;
      return total + (Array.isArray(eventRecord.riders) ? eventRecord.riders.length : 0);
    }, 0);
  }

  return 0;
}

function countEventsInUnknownData(data: unknown): number {
  if (!data || typeof data !== "object") return 0;

  const root = data as Record<string, unknown>;

  if (Array.isArray(root.managedEvents)) {
    return root.managedEvents.length;
  }

  if (Array.isArray(root.events)) {
    return root.events.length;
  }

  return 0;
}

export function createBackupEnvelope<T>(data: T): BackupEnvelope<T> {
  const exportedAt = new Date().toISOString();

  return {
    appName: APP_NAME,
    appVersion: APP_VERSION,
    backupVersion: APP_VERSION,
    schemaVersion: DATA_SCHEMA_VERSION,
    dataSchemaVersion: DATA_SCHEMA_VERSION,
    schemaNote: `BMX Race Manager Datenschema ${DATA_SCHEMA_VERSION}`,
    createdAt: exportedAt,
    exportedAt,
    data,
  };
}

export function getBackupSummary(backup: unknown): BackupSummary {
  const item =
    backup && typeof backup === "object"
      ? (backup as Partial<BackupEnvelope>)
      : {};

  const data = item.data ?? backup;

  return {
    schemaNote:
      typeof item.schemaNote === "string"
        ? item.schemaNote
        : `BMX Race Manager Datenschema ${DATA_SCHEMA_VERSION}`,
    exportedAt:
      typeof item.exportedAt === "string"
        ? item.exportedAt
        : typeof item.createdAt === "string"
          ? item.createdAt
          : "",
    eventCount: countEventsInUnknownData(data),
    riderCount: countRidersInUnknownData(data),
    appDataCount:
      data && typeof data === "object" ? Object.keys(data as Record<string, unknown>).length : 0,
    backupVersion:
      typeof item.backupVersion === "string"
        ? item.backupVersion
        : typeof item.appVersion === "string"
          ? item.appVersion
          : APP_VERSION,
    dataSchemaVersion:
      typeof item.dataSchemaVersion === "number"
        ? item.dataSchemaVersion
        : typeof item.schemaVersion === "number"
          ? item.schemaVersion
          : DATA_SCHEMA_VERSION,
  };
}

export function validateBackupStructure(backup: unknown): BackupValidationResult {
  const errors: string[] = [];

  if (!backup || typeof backup !== "object") {
    return {
      ok: false,
      valid: false,
      message: "Backup ist kein gültiges Objekt.",
      errors: ["Backup ist kein gültiges Objekt."],
    };
  }

  const item = backup as Partial<BackupEnvelope>;

  if (!("data" in item)) {
    errors.push("Backup enthält keine Daten.");
  }

  const hasVersion =
    typeof item.appVersion === "string" ||
    typeof item.backupVersion === "string" ||
    typeof item.schemaVersion === "number" ||
    typeof item.dataSchemaVersion === "number";

  if (!hasVersion) {
    errors.push("Backup enthält keine Versionsinformationen.");
  }

  return {
    ok: errors.length === 0,
    valid: errors.length === 0,
    message:
      errors.length === 0
        ? "Backup ist gültig."
        : errors.join("\n"),
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
