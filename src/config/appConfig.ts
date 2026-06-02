export const APP_NAME = "BMX Race Manager";
export const APP_VERSION = "1.2.1";
export const APP_CHANGE_NOTE =
  "Version 1.2.1: Stabilisierung der Startseite, lokale Datenspeicherung und Backup-Kompatibilität.";
export const DATA_SCHEMA_VERSION = 1;

/**
 * Wichtig:
 * Diese Keys dürfen nachträglich möglichst nicht mehr geändert werden,
 * sonst findet die App bereits gespeicherte Rennen nicht mehr.
 */
export const STORAGE_KEYS = {
  managedEvents: "bmx-race-manager-managed-events",
  activeEventId: "bmx-race-manager-active-event-id",
  appSettings: "bmx-race-manager-app-settings",
  backup: "bmx-race-manager-backup",
  duplicateOkKeys: "bmx-race-manager-duplicate-ok-keys",
};

export const LEGACY_STORAGE_KEYS = {
  managedEvents: [
    STORAGE_KEYS.managedEvents,
    "bmx-race-app-managed-events",
    "bmx-race-manager-data",
    "bmx-race-app-data",
    "managedEvents",
    "events",
    "races",
  ],
  activeEventId: [
    STORAGE_KEYS.activeEventId,
    "bmx-race-app-active-event-id",
    "activeEventId",
    "activeRaceId",
  ],
  appSettings: [
    STORAGE_KEYS.appSettings,
    "bmx-race-app-settings",
    "appSettings",
    "settings",
  ],
  duplicateOkKeys: [
    STORAGE_KEYS.duplicateOkKeys,
    "bmx-race-app-duplicate-ok-keys",
    "duplicateOkKeys",
  ],
};

export const APP_CONFIG = {
  appName: APP_NAME,
  version: APP_VERSION,
  changeNote: APP_CHANGE_NOTE,
  dataSchemaVersion: DATA_SCHEMA_VERSION,
  storageKeys: STORAGE_KEYS,
  legacyStorageKeys: LEGACY_STORAGE_KEYS,

  releaseDate: "2026-06-02",
  storageKey: STORAGE_KEYS.managedEvents,
  backupPrefix: "bmx-race-backup",

  defaultRaceSeries: "BMX Bernercup 2026",
  defaultLocation: "",
  defaultRaceDate: "",

  pdf: {
    author: APP_NAME,
    titlePrefix: "BMX",
  },
};

export type AppConfig = typeof APP_CONFIG;
