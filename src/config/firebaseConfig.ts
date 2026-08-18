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
  databaseId: string;
};

// Firebase Firestore REST- und Firebase Authentication REST-Konfiguration.
// Die Werte werden über Vercel Environment Variables gesetzt, damit keine API Keys
// direkt im GitHub-Repository stehen und GitHub Secret Scanning nicht anschlägt.
// Benötigte Variablen in Vercel:
// - VITE_FIREBASE_ENABLED=true
// - VITE_FIREBASE_API_KEY=...
// - VITE_FIREBASE_PROJECT_ID=...
// - VITE_FIREBASE_APP_ID=...
// Optional:
// - VITE_FIREBASE_DATABASE_ID=default
//   Hinweis: Wenn in Google Cloud eine benannte Datenbank ohne Klammern erstellt wurde,
//   muss hier genau dieser Name verwendet werden.
// Optional:
// - VITE_FIREBASE_AUTH_DOMAIN=...
// - VITE_FIREBASE_STORAGE_BUCKET=...
// - VITE_FIREBASE_MESSAGING_SENDER_ID=...
//
// v1.15.9 nutzt zusätzlich Firebase Authentication per REST API.
// Dafür wird derselbe VITE_FIREBASE_API_KEY verwendet; das Passwort wird nie
// in Vercel oder GitHub gespeichert, sondern vom Benutzer in der App eingegeben.
const env = (import.meta as any).env ?? {};

const enabledFromEnv = String(env.VITE_FIREBASE_ENABLED ?? "").toLowerCase() === "true";
const projectId = String(env.VITE_FIREBASE_PROJECT_ID ?? "").trim();
const apiKey = String(env.VITE_FIREBASE_API_KEY ?? "").trim();
const appId = String(env.VITE_FIREBASE_APP_ID ?? "").trim();
const databaseId = String(env.VITE_FIREBASE_DATABASE_ID ?? "default").trim() || "default";

export const firebaseOnlineStorageConfig: FirebaseOnlineStorageConfig = {
  enabled: enabledFromEnv && Boolean(projectId) && Boolean(apiKey) && Boolean(appId),
  projectId,
  apiKey,
  appId,
  authDomain: String(env.VITE_FIREBASE_AUTH_DOMAIN ?? "").trim() || undefined,
  storageBucket: String(env.VITE_FIREBASE_STORAGE_BUCKET ?? "").trim() || undefined,
  messagingSenderId: String(env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "").trim() || undefined,
  collectionPath: "bmxRaceManager",
  documentId: "mainAppState",
  databaseId,
};
