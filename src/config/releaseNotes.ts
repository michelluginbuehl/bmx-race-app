export type ReleaseNote = {
  version: string;
  date: string;
  changes: string[];
};

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "1.2.0",
    date: "2026-06-02",
    changes: [
      "Resultateingabe verbessert",
      "Finalvorschau ergänzt",
      "Race-Abschluss mit Schreibschutz ergänzt",
      "Kartenlayout für bessere iPad-Bedienung vorbereitet",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-06-02",
    changes: [
      "Backup und Restore ergänzt",
      "CSV-Import-Prüfung ergänzt",
      "PDF-Dateinamen verbessert",
      "App-Version und Release Notes ergänzt",
    ],
  },
];
