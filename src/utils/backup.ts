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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function unwrapData(value: unknown): unknown {
  const record = asRecord(value);
  if (record && "data" in record) return record.data;
  return value;
}

function countRidersInUnknownData(data: unknown): number {
  const unwrapped = unwrapData(data);
  const root = asRecord(unwrapped);
  if (!root) return 0;

  if (Array.isArray(root.riders)) {
    return root.riders.length;
  }

  if (Array.isArray(root.managedEvents)) {
    return root.managedEvents.reduce((total, event) => {
      const eventRecord = asRecord(event);
      return total + (Array.isArray(eventRecord?.riders) ? eventRecord.riders.length : 0);
    }, 0);
  }

  if (Array.isArray(root.events)) {
    return root.events.reduce((total, event) => {
      const eventRecord = asRecord(event);
      return total + (Array.isArray(eventRecord?.riders) ? eventRecord.riders.length : 0);
    }, 0);
  }

  return 0;
}

function countEventsInUnknownData(data: unknown): number {
  const unwrapped = unwrapData(data);
  const root = asRecord(unwrapped);
  if (!root) return 0;

  if (Array.isArray(root.managedEvents)) return root.managedEvents.length;
  if (Array.isArray(root.events)) return root.events.length;
  if (Array.isArray(unwrapped)) return unwrapped.length;

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
  const item = asRecord(backup) ?? {};
  const data = "data" in item ? item.data : backup;

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
  const item = asRecord(backup);

  if (!item) {
    return {
      ok: false,
      valid: false,
      message: "Backup ist kein gültiges Objekt.",
      errors: ["Backup ist kein gültiges Objekt."],
    };
  }

  // Alte Exporte ohne Envelope erlauben, sofern sie wie App-Daten aussehen.
  const hasEnvelopeData = "data" in item;
  const looksLikeRawAppData =
    "managedEvents" in item ||
    "events" in item ||
    "riders" in item ||
    "appSettings" in item;

  if (!hasEnvelopeData && !looksLikeRawAppData) {
    errors.push("Backup enthält keine erkennbaren App-Daten.");
  }

  return {
    ok: errors.length === 0,
    valid: errors.length === 0,
    message: errors.length === 0 ? "Backup ist gültig." : errors.join("\n"),
    errors,
  };
}

export function normalizeManagedEventsForSchema<T>(managedEvents: T): T {
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
