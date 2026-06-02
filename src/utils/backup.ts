import { APP_NAME, APP_VERSION, BACKUP_VERSION, DATA_SCHEMA_VERSION } from "../config/appConfig";

export type BackupValidationResult = {
  ok: boolean;
  message?: string;
};

export type BackupSummary = {
  exportedAt: string;
  eventCount: number;
  riderCount: number;
  appDataCount: number;
  backupVersion: number;
  dataSchemaVersion: number;
  schemaNote: string;
};

export const createBackupEnvelope = (input: {
  reason: string;
  lastSaveAt?: string;
  managedEvents: any[];
  riders: any[];
  appData: any[];
}) => ({
  app: APP_NAME,
  appName: APP_NAME,
  appVersion: APP_VERSION,
  backupVersion: BACKUP_VERSION,
  dataSchemaVersion: DATA_SCHEMA_VERSION,
  version: DATA_SCHEMA_VERSION,
  scope: "full-file",
  exportedAt: new Date().toISOString(),
  reason: input.reason,
  lastSaveAt: input.lastSaveAt || "",
  managedEvents: input.managedEvents,
  riders: input.riders,
  appData: input.appData,
});

export const validateBackupStructure = (backup: any): BackupValidationResult => {
  if (!backup || typeof backup !== "object") {
    return { ok: false, message: "Die Backup-Datei ist leer oder kein gültiges JSON-Objekt." };
  }

  if (!Array.isArray(backup.riders) || !Array.isArray(backup.appData)) {
    return { ok: false, message: "Ungültige Backup-Datei. Bitte eine JSON-Backup-Datei des BMX Race Manager auswählen." };
  }

  const invalidAppData = backup.appData.some(
    (row: any) => !row || typeof row.key !== "string" || !Object.prototype.hasOwnProperty.call(row, "value"),
  );
  if (invalidAppData) {
    return { ok: false, message: "Die Backup-Datei enthält beschädigte App-Daten." };
  }

  const invalidRiders = backup.riders.some((rider: any) => !rider || typeof rider.id === "undefined");
  if (invalidRiders) {
    return { ok: false, message: "Die Backup-Datei enthält beschädigte Teilnehmerdaten." };
  }

  if (backup.managedEvents && !Array.isArray(backup.managedEvents)) {
    return { ok: false, message: "Die Backup-Datei enthält eine ungültige Rennen-/Serienliste." };
  }

  return { ok: true };
};

export const getBackupSummary = (backup: any): BackupSummary => {
  const dataSchemaVersion = Number(backup.dataSchemaVersion || backup.version || 1);
  const backupVersion = Number(backup.backupVersion || 1);
  const schemaNote = dataSchemaVersion < DATA_SCHEMA_VERSION
    ? `\n\nHinweis: Dieses Backup stammt aus einer älteren Datenstruktur (v${dataSchemaVersion}). Nach dem Import wird eine Datenprüfung empfohlen.`
    : "";

  return {
    exportedAt: backup.exportedAt ? new Date(backup.exportedAt).toLocaleString("de-CH") : "unbekannt",
    eventCount: Array.isArray(backup.managedEvents) ? backup.managedEvents.length : 0,
    riderCount: Array.isArray(backup.riders) ? backup.riders.length : 0,
    appDataCount: Array.isArray(backup.appData) ? backup.appData.length : 0,
    backupVersion,
    dataSchemaVersion,
    schemaNote,
  };
};

export const normalizeManagedEventsForSchema = <T extends { dataVersion?: number; updatedAt?: string }>(events: T[]): T[] =>
  events.map((event) => ({
    ...event,
    dataVersion: Number(event.dataVersion || DATA_SCHEMA_VERSION),
  }));
