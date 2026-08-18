export type FirebaseOnlineStorageConfig = {
  enabled: boolean;
  projectId: string;
  apiKey: string;
  appId: string;
  authDomain?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  collectionPath: string;
  documentId: string;
};

// Firebase Firestore REST-Konfiguration.
// Die App nutzt Firebase nur als Online-Speicher; Hosting bleibt weiterhin Vercel.
// Wichtig: Ohne Anmeldung funktionieren Online speichern/laden nur, wenn die Firestore-Regeln
// den Zugriff für deine App erlauben, z. B. im Testmodus oder mit passenden Security Rules.
export const firebaseOnlineStorageConfig: FirebaseOnlineStorageConfig = {
  enabled: true,
  projectId: "bmx-race-manager",
  apiKey: "AIzaSyCEvcE99DSeXmkfuA0LyRZD1Spsk9J13H0",
  appId: "1:126981692951:web:6a62ce562c260d7425c652",
  authDomain: "bmx-race-manager.firebaseapp.com",
  storageBucket: "bmx-race-manager.firebasestorage.app",
  messagingSenderId: "126981692951",
  collectionPath: "bmxRaceManager",
  documentId: "mainAppState",
};
