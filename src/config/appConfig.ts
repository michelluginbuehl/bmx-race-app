export const APP_CONFIG = {
  appName: "BMX Race Manager",
  version: "1.2.0",
  releaseDate: "2026-06-02",

  storageKey: "bmx-race-manager-data",
  backupPrefix: "bmx-race-backup",

  defaultRaceSeries: "BMX Bernercup 2026",
  defaultLocation: "",
  defaultRaceDate: "",

  pdf: {
    author: "BMX Race Manager",
    titlePrefix: "BMX",
  },
};

export type AppConfig = typeof APP_CONFIG;
