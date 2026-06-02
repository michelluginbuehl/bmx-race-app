export const APP_NAME = "BMX Race Manager";
export const APP_VERSION = "1.2.0";
export const APP_CHANGE_NOTE = "Version 1.2.0: technische Vorbereitung für Backup, Restore, Release Notes und stabile Datenspeicherung.";
export const DATA_SCHEMA_VERSION = 1;

export const STORAGE_KEYS = {
  managedEvents: "bmx-race-manager-managed-events",
  activeEventId: "bmx-race-manager-active-event-id",
  appSettings: "bmx-race-manager-app-settings",
  backup: "bmx-race-manager-backup",
};

export const APP_CONFIG = {
  appName: APP_NAME,
  version: APP_VERSION,
  changeNote: APP_CHANGE_NOTE,
  dataSchemaVersion: DATA_SCHEMA_VERSION,
  storageKeys: STORAGE_KEYS,

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
