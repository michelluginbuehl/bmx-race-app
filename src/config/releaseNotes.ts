export type ReleaseNote = {
  version: string;
  date: string;
  title: string;
  items: string[];
  current?: boolean;
};

export const APP_RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "v1.13.7",
    title: "Teilnehmer-Excel Export und Import",
    date: "2026-06-09",
    current: true,
    items: [
      "Teilnehmer können aus der Hauptdatenbank als Excel-Datei exportiert werden.",
      "Das Excel enthält eine editierbare Tabelle Teilnehmer und eine geschützte Übersicht Resultate.",
      "Neue Teilnehmer ohne Teilnehmer-ID erhalten beim Re-Import automatisch eine stabile Teilnehmer-ID.",
      "Bestehende Teilnehmer werden über Teilnehmer-ID oder Stammdaten erkannt und zentral aktualisiert.",
      "Resultate, Rennen, Motos, Finals und Gesamtwertung werden beim Excel-Import nicht überschrieben, sondern nur mit den aktualisierten Stammdaten synchronisiert.",
    ],
  },
  {
    version: "v1.13.6",
    title: "Zentrale Teilnehmer-ID und Daten-Synchronisierung",
    date: "2026-06-09",
    items: [
      "Teilnehmerdaten werden beim Bearbeiten über die stabile Teilnehmer-ID synchronisiert.",
      "Änderungen an Name, Startnummer, Jahrgang, Geschlecht, Verein oder Cruiser-Status werden in Hauptdatenbank, Rennen, Motos, Resultaten, Finals und Gesamtwertung übernommen.",
      "Beim Bearbeiten auf der Teilnehmer-Hauptseite und auf der Renn-Teilnehmerseite wird automatisch zum Eingabeformular gescrollt.",
      "Die stabile Teilnehmer-ID wird in der Teilnehmer-Hauptdatenbank und in der Renn-Teilnehmerliste sichtbar angezeigt.",
      "Interne Race-Zuordnungen und Resultat-Verknüpfungen bleiben erhalten, damit bestehende Ranglisten stabil bleiben.",
    ],
  },
  {
    version: "v1.13.5",
    title: "Stabiles Rennen-Löschen und Papierkorb leeren",
    date: "2026-06-09",
    
    items: [
      "Löschen von Rennen/Rennserien weiter stabilisiert: Die Oberfläche wird zuerst vom geöffneten Rennen entkoppelt, bevor lokale Daten gelöscht werden.",
      "Beim Löschen des aktuell geöffneten Rennens wird die Event-ID geleert und zur Startseite gewechselt, damit kein Render mehr auf entfernte Race-Daten zugreift.",
      "Bereinigung von Teilnehmer-, AppData- und localStorage-Daten erfolgt gemeinsam und robuster.",
      "Im Papierkorb gibt es neu den Button Papierkorb leeren, um alle gelöschten Teilnehmer auf einmal endgültig zu entfernen.",
      "Vor dem Leeren des Papierkorbs wird automatisch ein komplettes Sicherheitsbackup erstellt.",
    ],
  },
  {
    version: "v1.13.4",
    title: "Stabiles Löschen von Rennen und Teilnehmerdaten",
    date: "2026-06-09",
    items: [
      "Löschen von Rennen/Rennserien stabilisiert, damit nach dem ersten Klick nicht mehr auf bereits entfernte Daten zugegriffen wird.",
      "Beim Löschen des aktuell geöffneten Rennens wird der Rennstatus zuerst sicher zurückgesetzt und danach zur Startseite gewechselt.",
      "Alle Teilnehmer löschen entfernt Teilnehmer nun endgültig inklusive Papierkorb-Einträgen und zugehörigen Motos, Resultaten, Finals und Gesamtwertungsdaten.",
      "Alte Teilnehmerdaten werden dadurch nicht mehr als bereits vorhanden erkannt, wenn später Teilnehmer importiert oder neu hinzugefügt werden.",
      "Vor dem vollständigen Löschen wird weiterhin automatisch ein komplettes Sicherheitsbackup erstellt.",
    ],
  },
  {
    version: "v1.13.3",
    title: "Import/Export als komplettes App-Backup",
    date: "2026-06-09",
    
    items: [
      "Speichern und Backup exportieren immer die komplette App-Datei mit allen Rennen, Rennserien, Teilnehmern, Resultaten und Einstellungen.",
      "Import/Export wird nur auf der Startseite angezeigt.",
      "Auf Rennseiten gibt es wieder einen Speichern-Button mit derselben kompletten Backup-Export-Funktion.",
      "Ein Import ersetzt die lokalen Daten auf dem Gerät vollständig, damit danach nur die importierten Daten sichtbar sind.",
      "Einzelrennen-/Event-Export-Buttons wurden aus der Oberfläche entfernt, um unvollständige Import-Dateien zu vermeiden.",
    ],
  },
  {
    version: "v1.13.2",
    title: "Alle Teilnehmer gesammelt löschen",
    date: "2026-06-09",
    items: [
      "Teilnehmer-Hauptdatenbank erhält eine Funktion, um alle aktiven Teilnehmer gesammelt in den Papierkorb zu verschieben.",
      "Vor dem Sammellöschen wird automatisch ein Sicherheitsbackup erstellt.",
      "Die Löschung ist bewusst als Papierkorb-Aktion umgesetzt, damit Teilnehmer wiederhergestellt werden können.",
      "Rennlogik, Resultate und Gesamtwertung werden nicht verändert.",
    ],
  },
  {
    version: "v1.13.1",
    title: "Stabile Teilnehmerbearbeitung und Kategorie-Zusammenlegung",
    date: "2026-06-09",
    items: [
      "Beim Bearbeiten von Teilnehmern wird automatisch nach oben zum Eingabefeld gescrollt.",
      "Race-Zuordnungen bleiben beim Bearbeiten erhalten.",
      "Teilnehmer erhalten eine stabile Teilnehmer-ID, damit Resultate und Gesamtwertung verbunden bleiben.",
      "Falls eine Bearbeitung eine neue technische ID erzeugt, werden Resultat-Referenzen auf die neue ID übertragen.",
      "Jede Kategorie kann nun wie Cruiser mit einer anderen Kategorie zusammen starten.",
      "Rangliste und Gesamtwertung bleiben trotz gemeinsamer Starts pro Original-Kategorie getrennt.",
    ],
  },
  {
    version: "v1.13.0",
    date: "02.06.2026",
    title: "Technische Struktur verbessert",
    items: [
      "App-Konfiguration, Version und Datenstruktur-Version in eigene Datei ausgelagert",
      "Release Notes aus App.tsx ausgelagert",
      "Header in eigene Komponente ausgelagert",
      "Zentraler Storage-Wrapper für lokale Browser-Speicherung ergänzt",
      "Backup-Dateien mit App-, Backup- und Datenstruktur-Metadaten erweitert",
      "Import-Prüfung robuster gemacht und Datenmodell-Version für Rennserien ergänzt",
      "Keine Änderung an Rennlogik oder bestehenden gespeicherten Daten",
    ],
  },
  {
    version: "v1.12.9",
    date: "02.06.2026",
    title: "Release Notes auf History-Seite",
    items: [
      "Versionshistorie auf der Seite History / Speicher & Import ergänzt",
      "Release Notes im Stil einer Software-History sichtbar gemacht",
      "Keine Änderung an Speicherlogik, Import/Export, Rennen oder bestehenden Daten",
    ],
  },
  {
    version: "v1.12.8",
    date: "02.06.2026",
    title: "Rennblatt-Buttons bereinigt",
    items: [
      "Button Resultate manuell erstellen in Results manuell umbenannt",
      "Button Speichern im Rennblatt entfernt",
      "Keine Änderung an Rennlogik oder Backup-System",
    ],
  },
  {
    version: "v1.12.7",
    date: "02.06.2026",
    title: "iPad-Bedienung optisch verbessert",
    items: [
      "Buttons vergrössert und Touch-Flächen verbessert",
      "Abstände zwischen Bedienelementen erhöht",
      "Kritische Aktionen farblich klarer markiert",
      "Rennstatus-Anzeigen sichtbarer gemacht",
    ],
  },
  {
    version: "v1.12.6",
    date: "02.06.2026",
    title: "Header-Banner ausgelagert und responsiver gemacht",
    items: [
      "Banner aus App.tsx in src/assets/header-banner.jpg ausgelagert",
      "Header-Kachel responsiver gemacht",
      "Logo im Banner wird weniger stark zugeschnitten",
    ],
  },
  {
    version: "v1.12.5",
    date: "02.06.2026",
    title: "Header-Höhe nachjustiert",
    items: [
      "Kopf-Kachel nochmals höher gemacht",
      "Banner-Zuschnitt reduziert, damit das Logo besser sichtbar ist",
    ],
  },
  {
    version: "v1.12.4",
    date: "02.06.2026",
    title: "Header-Kachel erhöht",
    items: [
      "Kopf-Kachel oben höher gemacht",
      "Banner-Hintergrund beibehalten",
    ],
  },
  {
    version: "v1.12.3",
    date: "02.06.2026",
    title: "Neuer Header-Banner",
    items: [
      "Neuer Banner als Hintergrund der Kopf-Kachel eingebaut",
      "App-Name im Header entfernt",
      "Zielflaggen-Emoji links entfernt",
      "Versionsnummer sichtbar gelassen",
      "Gespeichert-/Backup-Kachel kleiner und unten ausgerichtet",
      "Klick auf Kopf-Kachel führt zurück zur Startseite",
    ],
  },
];
