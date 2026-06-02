export type ReleaseNote = {
  version: string;
  date: string;
  title: string;
  changes: string[];
};

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "1.2.0",
    date: "2026-06-02",
    title: "Resultate, Finals und Race-Abschluss",
    changes: [
      "Verbesserte Grundlage für Resultateingabe.",
      "Vorbereitung für DNS, DNF und DSQ.",
      "Vorbereitung für Finalvorschau.",
      "Vorbereitung für Race-Abschluss mit Schreibschutz.",
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
  },
];
