# Private Testumgebung

Testversion: https://bmx-race-app-git-test-environment-michels-projects-6fda5878.vercel.app
Richtige Version: https://bmx-race-app.vercel.app

Die Vorschau verlangt zuerst den bestehenden Vercel-Zugang und danach den bisherigen Firebase-App-Login. Nur die hinterlegte Firebase-UID von Michel darf Testdaten lesen und ändern. Auch ein direkter Aufruf von `#live` verlangt diesen Login. Nach dem Abmelden oder Neuladen ist eine neue App-Anmeldung nötig.

Die Testumgebung startet mit eigenen, leeren Daten. Ein Testrennen erstellen und über die vorhandene Live-Funktion in die **private** Test-Zuschaueransicht übernehmen. Im gelben Hinweis steht der Zugang zur Test-Zuschaueransicht. Ein Link zur Test-Zuschaueransicht gibt anderen Personen keinen Zugriff.

## Getrennte Daten

| Bereich | Richtige Version | Testumgebung |
| --- | --- | --- |
| App-Daten und Backups | bmxRaceManager/mainAppState | bmxRaceTest/mainAppState |
| Live-Anzeige | bmxRacePublic | bmxRaceTestLive |
| Lokale Datenbank | BMXDB | BMXDB-test |
| Lokale Einstellungen | bisherige Schlüssel | Präfix bmx_test: |

Die Auswahl wechselt zwischen zwei eigenständigen Bereitstellungen. Die Datenumgebung wird beim Build festgelegt; URL-Parameter können sie nicht umschalten. Preview-Builds sind immer Tests. Lokal ist Test der sichere Standard; `BMX_APP_ENVIRONMENT=production npm run build` prüft einen Produktionsbuild. Vercel Production setzt automatisch die richtige Umgebung.

## Freigabe

Neue Designs und Funktionen kommen auf den Branch `test-environment`. Vercel aktualisiert dessen feste Testadresse. Nach Michels ausdrücklicher Freigabe wird der geprüfte Code in `main` übernommen. Erst dessen Produktionsbereitstellung aktualisiert die richtige Version. Testdaten werden dabei nicht übernommen. Ein Klick auf „Richtige Version“ veröffentlicht nichts.

Das GitHub-Repository ist öffentlich. Die private Vorschau und ihre Daten sind geschützt; der Quellcode im Repository ist weiterhin öffentlich einsehbar.

## Prüfung der Einrichtung

- Automatische Tests für getrennte Online-Pfade, Anmeldung der Test-Zuschaueransicht und lokale Speicherzugriffe.
- Google-Regelsimulator: Test-Livelesen anonym abgewiesen, Eigentümer zugelassen; Test-Backup-Schreiben für Eigentümer zugelassen und fremde UID abgewiesen.
- Firestore-Testregeln am 12.09.2026 veröffentlicht.
- Anonymer Aufruf der Vercel-Vorschau führt zur Vercel-Anmeldung.
