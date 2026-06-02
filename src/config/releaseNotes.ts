export type AppReleaseNote = {
  version: string;
  date: string;
  title: string;
  changes: string[];
  items: string[];
};

export const APP_RELEASE_NOTES: AppReleaseNote[] = [
  {
    version: "1.2.0",
    date: "2026-06-02",
    title: "Resultate, Finals und Race-Abschluss",
    changes: [
      "Technische Grundlage für Resultateingabe vorbereitet.",
      "Technische Grundlage für DNS, DNF und DSQ vorbereitet.",
      "Technische Grundlage für Finalvorschau vorbereitet.",
      "Technische Grundlage für Race-Abschluss mit Schreibschutz vorbereitet.",
      "Kartenlayout für bessere Bedienung auf dem iPad vorbereitet.",
    ],
    items: [
      "Technische Grundlage für Resultateingabe vorbereitet.",
      "Technische Grundlage für DNS, DNF und DSQ vorbereitet.",
      "Technische Grundlage für Finalvorschau vorbereitet.",
      "Technische Grundlage für Race-Abschluss mit Schreibschutz vorbereitet.",
      "Kartenlayout für bessere Bedienung auf dem iPad vorbereitet.",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-06-02",
    title: "Backup, Import und PDF",
    changes: [
      "Backup- und Restore-Funktionen vorbereitet.",
      "CSV-Import-Prüfung vorbereitet.",
      "Saubere PDF-Dateinamen vorbereitet.",
      "App-Version und Release Notes ergänzt.",
    ],
    items: [
      "Backup- und Restore-Funktionen vorbereitet.",
      "CSV-Import-Prüfung vorbereitet.",
      "Saubere PDF-Dateinamen vorbereitet.",
      "App-Version und Release Notes ergänzt.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-06-02",
    title: "Grundversion",
    changes: [
      "Grundfunktionen für BMX-Rennverwaltung.",
      "Fahrer, Kategorien, Vorläufe und Finalstruktur.",
      "PDF-Export vorbereitet.",
    ],
    items: [
      "Grundfunktionen für BMX-Rennverwaltung.",
      "Fahrer, Kategorien, Vorläufe und Finalstruktur.",
      "PDF-Export vorbereitet.",
    ],
  },
];

// Zusätzlicher Alias, falls andere Komponenten RELEASE_NOTES verwenden.
export const RELEASE_NOTES = APP_RELEASE_NOTES;

export type ReleaseNote = AppReleaseNote;
