import { firebaseOnlineStorageConfig } from "../config/firebaseConfig";

type OnlineStorageResponse = {
  ok: boolean;
  message: string;
  updatedAt?: string;
  data?: any;
};

const hasConfigValue = (value: string) => Boolean(value && value.trim() && !value.includes("DEIN_") && !value.includes("YOUR_"));

export const isOnlineStorageConfigured = () => {
  return Boolean(
    firebaseOnlineStorageConfig.enabled &&
      hasConfigValue(firebaseOnlineStorageConfig.projectId) &&
      hasConfigValue(firebaseOnlineStorageConfig.apiKey) &&
      hasConfigValue(firebaseOnlineStorageConfig.collectionPath) &&
      hasConfigValue(firebaseOnlineStorageConfig.documentId),
  );
};

const getFirestoreDocumentUrl = () => {
  const { projectId, apiKey, collectionPath, documentId } = firebaseOnlineStorageConfig;
  const cleanCollection = collectionPath.trim().replace(/^\/+|\/+$/g, "");
  const cleanDocument = documentId.trim().replace(/^\/+|\/+$/g, "");
  const documentPath = `${cleanCollection}/${cleanDocument}`
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");

  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId.trim())}/databases/(default)/documents/${documentPath}?key=${encodeURIComponent(apiKey.trim())}`;
};

const parseFirestoreError = async (response: Response) => {
  try {
    const json = await response.json();
    return json?.error?.message || response.statusText || "Unbekannter Online-Speicher-Fehler";
  } catch {
    return response.statusText || "Unbekannter Online-Speicher-Fehler";
  }
};

export const saveOnlineAppState = async (payload: any, meta: Record<string, any> = {}): Promise<OnlineStorageResponse> => {
  if (!isOnlineStorageConfigured()) {
    return { ok: false, message: "Online-Speicher ist noch nicht konfiguriert." };
  }

  const updatedAt = new Date().toISOString();
  const body = {
    fields: {
      payloadJson: { stringValue: JSON.stringify(payload) },
      updatedAt: { timestampValue: updatedAt },
      appName: { stringValue: String(meta.appName || payload?.appName || payload?.app || "BMX Race Manager") },
      appVersion: { stringValue: String(meta.appVersion || payload?.appVersion || "") },
      backupVersion: { stringValue: String(payload?.backupVersion || "") },
      dataSchemaVersion: { stringValue: String(payload?.dataSchemaVersion || payload?.schemaVersion || "") },
      riderCount: { integerValue: String(Number(meta.riderCount ?? payload?.riders?.length ?? payload?.data?.riders?.length ?? 0)) },
      eventCount: { integerValue: String(Number(meta.eventCount ?? payload?.managedEvents?.length ?? payload?.data?.managedEvents?.length ?? 0)) },
    },
  };

  const response = await fetch(getFirestoreDocumentUrl(), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return { ok: false, message: await parseFirestoreError(response) };
  }

  return { ok: true, message: "Online gespeichert.", updatedAt };
};

export const loadOnlineAppState = async (): Promise<OnlineStorageResponse> => {
  if (!isOnlineStorageConfigured()) {
    return { ok: false, message: "Online-Speicher ist noch nicht konfiguriert." };
  }

  const response = await fetch(getFirestoreDocumentUrl(), { method: "GET" });

  if (!response.ok) {
    if (response.status === 404) return { ok: false, message: "Es wurden noch keine Online-Daten gefunden." };
    return { ok: false, message: await parseFirestoreError(response) };
  }

  const document = await response.json();
  const payloadJson = document?.fields?.payloadJson?.stringValue;
  if (!payloadJson) return { ok: false, message: "Online-Daten enthalten keine App-Daten." };

  try {
    return {
      ok: true,
      message: "Online-Daten geladen.",
      updatedAt: document?.fields?.updatedAt?.timestampValue,
      data: JSON.parse(payloadJson),
    };
  } catch {
    return { ok: false, message: "Online-Daten konnten nicht gelesen werden." };
  }
};
