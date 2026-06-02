export type AppReleaseNote = {
  version: string;
  date: string;
  title: string;
  changes: string[];
  items: string[];
};

function withItems(note: Omit<AppReleaseNote, "items">): AppReleaseNote {
  return {
    ...note,
    items: note.changes,
  };
}

export const APP_RELEASE_NOTES: AppReleaseNote[] = [
  withItems({
    version: "1.2.1",
    date: "2026-06-02",
    title: "Stabilisierung Startseite und Datenspeicherung",
    changes: [
      "Startseiten-Daten werden rückwärtskompatibler aus dem lokalen Speicher gelesen.",
      "Lokale Speichermethoden sind wieder näher an localStorage angelehnt.",
      "Backup-Prüfung und Backup-Zusammenfassung robuster gemacht.",
      "Fehlende Release-Notes-Felder ergänzt.",
    ],
  }),
  withItems({
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
  }),
  withItems({
    version: "1.1.0",
    date: "2026-06-02",
    title: "Backup, Import und PDF",
    changes: [
      "Backup- und Restore-Funktionen vorbereitet.",
      "CSV-Import-Prüfung vorbereitet.",
      "Saubere PDF-Dateinamen vorbereitet.",
      "App-Version und Release Notes ergänzt.",
    ],
  }),
  withItems({
    version: "1.0.0",
    date: "2026-06-02",
    title: "Grundversion",
    changes: [
      "Grundfunktionen für BMX-Rennverwaltung.",
      "Fahrer, Kategorien, Vorläufe und Finalstruktur.",
      "PDF-Export vorbereitet.",
    ],
  }),
];

export const RELEASE_NOTES = APP_RELEASE_NOTES;

export type ReleaseNote = AppReleaseNote;
