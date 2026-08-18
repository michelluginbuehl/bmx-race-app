export type FirebaseOnlineStorageConfig = {
  enabled: boolean;
  projectId: string;
  apiKey: string;
  collectionPath: string;
  documentId: string;
};

// Firebase Firestore REST-Konfiguration.
// Noch deaktiviert, damit die App ohne Firebase-Projekt weiterhin normal baut und lokal funktioniert.
// Zum Aktivieren:
// 1. Firebase-Projekt erstellen
// 2. Firestore-Datenbank aktivieren
// 3. Web-App API-Key und projectId eintragen
// 4. enabled auf true setzen
export const firebaseOnlineStorageConfig: FirebaseOnlineStorageConfig = {
  enabled: false,
  projectId: "",
  apiKey: "",
  collectionPath: "bmxRaceManager",
  documentId: "mainAppState",
};
