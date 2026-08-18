import { firebaseOnlineStorageConfig } from "../config/firebaseConfig";

export type FirebaseAuthSession = {
  email: string;
  localId: string;
  idToken: string;
  refreshToken: string;
  expiresAt: string;
  signedInAt: string;
};

const AUTH_STORAGE_KEY = "bmx_firebase_auth_session_v1";
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

const safeJsonParse = (value: string | null) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const persistSession = (session: FirebaseAuthSession) => {
  try {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Anmeldung bleibt in dieser Browser-Sitzung trotzdem im React-State erhalten.
  }
};

const readRawStoredSession = (): FirebaseAuthSession | null => {
  if (typeof window === "undefined") return null;
  const parsed = safeJsonParse(window.localStorage.getItem(AUTH_STORAGE_KEY));
  if (!parsed || typeof parsed !== "object") return null;
  if (!parsed.idToken || !parsed.refreshToken || !parsed.email) return null;
  return {
    email: String(parsed.email || ""),
    localId: String(parsed.localId || ""),
    idToken: String(parsed.idToken || ""),
    refreshToken: String(parsed.refreshToken || ""),
    expiresAt: String(parsed.expiresAt || ""),
    signedInAt: String(parsed.signedInAt || ""),
  };
};

export const getStoredFirebaseAuthSession = () => readRawStoredSession();

const getApiKey = () => String(firebaseOnlineStorageConfig.apiKey || "").trim();

const assertAuthConfigured = () => {
  if (!getApiKey()) {
    throw new Error("Firebase API Key fehlt. Bitte Vercel Environment Variables prüfen.");
  }
};

const parseFirebaseAuthError = async (response: Response) => {
  try {
    const json = await response.json();
    const code = String(json?.error?.message || response.statusText || "AUTH_ERROR");
    const messages: Record<string, string> = {
      EMAIL_NOT_FOUND: "Diese E-Mail ist in Firebase Authentication nicht angelegt.",
      INVALID_PASSWORD: "Passwort ist falsch.",
      INVALID_LOGIN_CREDENTIALS: "E-Mail oder Passwort ist falsch.",
      USER_DISABLED: "Dieses Firebase-Benutzerkonto ist deaktiviert.",
      OPERATION_NOT_ALLOWED: "E-Mail/Passwort-Login ist in Firebase Authentication noch nicht aktiviert.",
      TOO_MANY_ATTEMPTS_TRY_LATER: "Zu viele Login-Versuche. Bitte später erneut versuchen.",
      INVALID_REFRESH_TOKEN: "Die gespeicherte Anmeldung ist abgelaufen. Bitte erneut anmelden.",
      TOKEN_EXPIRED: "Die Anmeldung ist abgelaufen. Bitte erneut anmelden.",
    };
    return messages[code] || code;
  } catch {
    return response.statusText || "Firebase Login fehlgeschlagen.";
  }
};

const buildSessionFromSignIn = (json: any): FirebaseAuthSession => {
  const expiresInSeconds = Math.max(60, Number(json?.expiresIn || 3600));
  return {
    email: String(json?.email || ""),
    localId: String(json?.localId || json?.user_id || ""),
    idToken: String(json?.idToken || json?.id_token || ""),
    refreshToken: String(json?.refreshToken || json?.refresh_token || ""),
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    signedInAt: new Date().toISOString(),
  };
};

export const signInWithFirebaseEmailPassword = async (email: string, password: string) => {
  assertAuthConfigured();
  const cleanEmail = String(email || "").trim();
  const cleanPassword = String(password || "");
  if (!cleanEmail || !cleanPassword) throw new Error("Bitte E-Mail und Passwort eingeben.");

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(getApiKey())}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: cleanEmail, password: cleanPassword, returnSecureToken: true }),
    },
  );

  if (!response.ok) throw new Error(await parseFirebaseAuthError(response));
  const session = buildSessionFromSignIn(await response.json());
  if (!session.idToken || !session.refreshToken) throw new Error("Firebase Login hat kein gültiges Token zurückgegeben.");
  persistSession(session);
  return session;
};

export const refreshFirebaseAuthSession = async (session: FirebaseAuthSession) => {
  assertAuthConfigured();
  const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(getApiKey())}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: session.refreshToken }).toString(),
  });

  if (!response.ok) throw new Error(await parseFirebaseAuthError(response));
  const json = await response.json();
  const expiresInSeconds = Math.max(60, Number(json?.expires_in || 3600));
  const refreshed: FirebaseAuthSession = {
    email: session.email,
    localId: String(json?.user_id || session.localId || ""),
    idToken: String(json?.id_token || ""),
    refreshToken: String(json?.refresh_token || session.refreshToken || ""),
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    signedInAt: session.signedInAt || new Date().toISOString(),
  };
  if (!refreshed.idToken || !refreshed.refreshToken) throw new Error("Firebase Anmeldung konnte nicht erneuert werden.");
  persistSession(refreshed);
  return refreshed;
};

export const getValidFirebaseAuthSession = async () => {
  const session = readRawStoredSession();
  if (!session) return null;
  const expiresAtMs = new Date(session.expiresAt).getTime();
  if (Number.isFinite(expiresAtMs) && expiresAtMs - Date.now() > REFRESH_MARGIN_MS) return session;

  try {
    return await refreshFirebaseAuthSession(session);
  } catch {
    signOutFirebaseAuth();
    return null;
  }
};

export const signOutFirebaseAuth = () => {
  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Ignorieren.
  }
};
