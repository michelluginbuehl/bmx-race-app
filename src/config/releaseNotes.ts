export type ReleaseNote = {
  version: string;
  date: string;
  title: string;
  items: string[];
  current?: boolean;
};

export const APP_RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "v1.15.3",
    title: "Firestore-Datenbank-ID default",
    date: "2026-08-18",
    current: true,
    items: [
      "Online-Speicher verwendet neu die Firestore-Datenbank-ID default ohne Klammern.",
      "Damit passt die App zu der in Google Cloud erstellten benannten Datenbank default.",
      "Optional kann die Datenbank-ID über VITE_FIREBASE_DATABASE_ID gesetzt werden.",
      "Online speichern/laden, lokaler Speicher und Datei-Backup bleiben unverändert.",
    ],
  },
  {
    version: "v1.15.2",
    title: "Firebase-Konfiguration über Vercel Environment Variables",
    date: "2026-08-18",
    current: false,
    items: [
      "Firebase API Key und Projektwerte werden nicht mehr direkt im GitHub-Repository gespeichert.",
      "Firebase-Konfiguration wird über Vercel Environment Variables geladen.",
      "GitHub Secret-Scanning-Warnungen für src/config/firebaseConfig.ts werden dadurch künftig vermieden.",
      "Online speichern/laden bleibt unverändert vorbereitet; Firestore muss im Firebase-Projekt als (default)-Datenbank erstellt sein.",
      "Lokaler Speicher und Datei-Backup bleiben unverändert aktiv.",
    ],
  },
  {
    version: "v1.15.1",
    title: "Online-Speicher aktiviert",
    date: "2026-08-18",
    current: false,
    items: [
      "Firebase-Projekt bmx-race-manager in der App-Konfiguration aktiviert.",
      "Online speichern und Online laden verwenden jetzt Firestore REST und komplette App-Daten.",
      "Der Online-Speicher nutzt eine Chunk-Speicherung, damit auch grössere Backup-Daten nicht an der Firestore-Dokumentgrösse scheitern.",
      "Lokaler Speicher und Datei-Backup bleiben unverändert als Sicherheit erhalten.",
      "Beim Online-Laden wird weiterhin zuerst ein Sicherheitsbackup erstellt und erst nach Bestätigung lokal ersetzt.",
    ],
  },
  {
    version: "v1.15.0",
    title: "Online-Speicher vorbereitet",
    date: "2026-08-18",
    current: false,
    items: [
      "Firebase-Konfigurationsdatei ergänzt, damit der Online-Speicher später ohne App-Umbau aktiviert werden kann.",
      "Online-Speicher-Utility über Firestore REST vorbereitet; es benötigt keine zusätzlichen npm-Pakete.",
      "Auf der Startseite wurden die Buttons Online speichern, Online laden, Backup erstellen und Backup importieren vorbereitet.",
      "Der lokale Speicher bleibt unverändert aktiv und dient weiterhin als Sicherheit.",
      "Backup erstellen erzeugt weiterhin eine komplette JSON-Datei mit allen Rennen, Teilnehmern, Resultaten und Einstellungen.",
    ],
  },
  {
    version: "v1.14.6",
    title: "Teilnehmer-Auswahlbuttons bereinigt",
    date: "2026-08-18",
    current: false,
    items: [
      "Im Bereich Teilnehmer in dieser Rennserie / diesem Rennen wurden die Race-Alle-Auswahlbuttons entfernt.",
      "Alle Kategorie-auswählen-Buttons innerhalb der Kategorien wurden entfernt.",
      "Die Auswahl der Fahrer erfolgt weiterhin direkt über die Race-Checkboxen R1, R2, R3 und R4 in der Tabelle.",
      "Keine Änderung an Teilnehmerdaten, Race-Zuordnung, Resultaten, Motos, Gates oder Backups.",
    ],
  },
  {
    version: "v1.14.5",
    title: "Teilnehmerliste übersichtlicher",
    date: "2026-08-18",
    current: false,
    items: [
      "Im Bereich Teilnehmer in dieser Rennserie / diesem Rennen wurden die Kategorie-Auswahlbuttons entfernt.",
      "Die Filterbuttons Alle, Race ausgewählt, Race offen, Fehlende Angaben, Doppelte Nummern und Cruiser sind jetzt gleich hoch und optisch einheitlich.",
      "Die Suche und die Filterbuttons wurden getrennt angeordnet, damit die Ansicht auf dem iPad ruhiger und besser bedienbar bleibt.",
      "Keine Änderung an Teilnehmerdaten, Race-Zuordnung, Resultaten, Motos, Gates oder Backups.",
    ],
  },
  {
    version: "v1.14.4",
    title: "Teilnehmer direkt im Rennen erfassen und auswählen",
    date: "2026-08-18",
    current: false,
    items: [
      "Im Teilnehmerbereich eines Rennens kann jetzt direkt ein neuer Teilnehmer erfasst werden, ohne zurück ins Hauptmenü zu wechseln.",
      "Neue Teilnehmer erhalten weiterhin automatisch eine stabile Teilnehmer-ID und werden direkt dem aktuell gewählten Race zugeordnet.",
      "Die Teilnehmerauswahl wurde übersichtlicher nach Kategorien gruppiert.",
      "Teilnehmer können per Suche, Kategorie-Filter, Mehrfachauswahl oder Kategorie-Schnellaktion zum aktuellen Race hinzugefügt werden.",
      "Der Teilnehmerlisten-Filter zeigt neu auch nur ausgewählte oder noch offene Teilnehmer für das aktuelle Race an.",
      "Nach bereits erstellten Motos bleibt die bestehende Notfall-Nachmeldung zuständig, damit Gate-Zuteilungen geschützt bleiben.",
    ],
  },
  {
    version: "v1.14.2",
    title: "Buildfix Nachmeldungen",
    date: "2026-08-17",
    current: false,
    items: [
      "TypeScript-Buildfehler in der Nachmelde-Auswahl korrigiert.",
      "Teilnehmer nachträglich hinzufügen verwendet intern nun eine einheitlich typisierte Auswahl.",
      "Keine Änderung an Rennlogik, Gates, Motos, Resultaten oder bestehenden Daten.",
    ],
  },
  {
    version: "v1.14.1",
    title: "Gate-Anzeige und Nachmeldungen",
    date: "2026-08-17",
    current: false,
    items: [
      "In den Moto- und Final-Startlisten wird links von Plate neu die Spalte Gate angezeigt.",
      "Unter Notfall / Reparatur gibt es neu Teilnehmer nachträglich hinzufügen.",
      "Nachgemeldete Teilnehmer werden zuerst in freie Gate-Plätze ihrer Kategorie gesetzt, ohne bestehende Fahrer zu verschieben.",
      "Wenn eine Kategorie durch die Nachmeldung mehr Fahrer hat als die bestehenden Moto-Gruppen aufnehmen können, fragt die App nach und erstellt nur diese Kategorie neu.",
      "Motos anderer Kategorien bleiben bei einer Nachmeldung unverändert.",
    ],
  },
  {
    version: "v1.14.0",
    title: "Gesamtwertung mit Teilnehmerfilter",
    date: "2026-07-30",
    current: false,
    items: [
      "Beim Erstellen der Gesamtwertung fragt die App neu, ob alle Teilnehmer mit Resultat oder nur Teilnehmer mit genügend Rennen angezeigt werden sollen.",
      "Der Filter richtet sich nach der Einstellung, wie viele Rennen für die Gesamtwertung zählen.",
      "Teilnehmer mit zu wenigen Rennen können dadurch auf Wunsch aus der Gesamtwertung ausgeblendet werden.",
      "Rennresultate und bestehende Daten werden nicht verändert; es wird nur die erzeugte Gesamtwertung gefiltert.",
    ],
  },
  {
    version: "v1.13.9",
    title: "Bugfix Manuelle Rangliste sichtbar",
    date: "2026-07-30",
    current: false,
    items: [
      "Beim Klick auf Manuelle Rangliste wird der Eingabebereich nun direkt auf der Rennseite angezeigt.",
      "Die manuelle Rangliste bleibt unabhängig von Motos/Heats und zeigt alle Teilnehmer einer Kategorie in einer Kachel.",
      "Hinweistexte für fehlende Renninformationen wurden an die manuelle Rangliste angepasst.",
      "Rangliste speichern erzeugt weiterhin die gewohnten Resultate für Resultate-PDF und Gesamtwertung.",
    ],
  },
  {
    version: "v1.13.8",
    title: "Manuelle Rangliste pro Kategorie",
    date: "2026-07-30",
    current: false,
    items: [
      "Button Results manuell in Manuelle Rangliste umbenannt.",
      "Die manuelle Rangliste verwendet keine Motos/Heats mehr als Eingabebasis.",
      "Alle Teilnehmer einer Kategorie werden in einer einzigen Kachel angezeigt, auch bei mehr als 8 Teilnehmern.",
      "Die Klick-Reihenfolge erzeugt direkt die Rangliste der Kategorie.",
      "Resultate-PDF verwendet danach wie gewohnt die gespeicherte manuelle Rangliste.",
    ],
  },
  {
    version: "v1.13.7",
    title: "Teilnehmer-Excel Export und Import",
    date: "2026-06-09",
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
