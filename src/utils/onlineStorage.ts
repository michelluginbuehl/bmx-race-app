import { firebaseOnlineStorageConfig } from "../config/firebaseConfig";

type OnlineStorageResponse = {
  ok: boolean;
  message: string;
  updatedAt?: string;
  data?: any;
};

export type OnlineStorageStatus = {
  ok: boolean;
  message: string;
  exists: boolean;
  updatedAt?: string;
  appVersion?: string;
  riderCount?: number;
  eventCount?: number;
  payloadSize?: number;
  backupVersion?: string;
  dataSchemaVersion?: string;
};

export type OnlineBackupListItem = {
  id: string;
  label: string;
  createdAt: string;
  appVersion?: string;
  riderCount?: number;
  eventCount?: number;
  payloadSize?: number;
  backupVersion?: string;
  dataSchemaVersion?: string;
};

type OnlineBackupListResponse = {
  ok: boolean;
  message: string;
  backups: OnlineBackupListItem[];
};

type OnlineBackupCreateResponse = OnlineStorageResponse & {
  backupId?: string;
  backups?: OnlineBackupListItem[];
};

const PAYLOAD_CHUNK_SIZE = 180_000;
const MAX_ONLINE_BACKUPS = 20;
const BACKUP_INDEX_PATH = "onlineBackupIndex/current";

let onlineStorageAuthToken = "";

export const setOnlineStorageAuthToken = (idToken?: string) => {
  onlineStorageAuthToken = String(idToken || "").trim();
};

const buildFirestoreHeaders = (headers: Record<string, string> = {}) => {
  return onlineStorageAuthToken
    ? { ...headers, Authorization: `Bearer ${onlineStorageAuthToken}` }
    : headers;
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

const encodePathPart = (part: string) => encodeURIComponent(part.trim());

const getFirestoreDocumentUrl = (extraPath = "") => {
  const { projectId, apiKey, collectionPath, documentId } = firebaseOnlineStorageConfig;
  const databaseId = String((firebaseOnlineStorageConfig as any).databaseId || "default").trim() || "default";
  const cleanCollection = collectionPath.trim().replace(/^\/+|\/+$/g, "");
  const cleanDocument = documentId.trim().replace(/^\/+|\/+$/g, "");
  const basePath = `${cleanCollection}/${cleanDocument}`;
  const fullPath = `${basePath}/${extraPath}`
    .split("/")
    .filter(Boolean)
    .map(encodePathPart)
    .join("/");

  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId.trim())}/databases/${encodeURIComponent(databaseId)}/documents/${fullPath}?key=${encodeURIComponent(apiKey.trim())}`;
};

const parseFirestoreError = async (response: Response) => {
  try {
    const json = await response.json();
    const message = json?.error?.message || response.statusText || "Unbekannter Online-Speicher-Fehler";
    if (response.status === 401 || response.status === 403) {
      return `${message} Bitte in der App mit Firebase Login anmelden und Firestore-Regeln prüfen.`;
    }
    return message;
  } catch {
    if (response.status === 401 || response.status === 403) {
      return `${response.statusText || "Zugriff verweigert"}. Bitte in der App mit Firebase Login anmelden und Firestore-Regeln prüfen.`;
    }
    return response.statusText || "Unbekannter Online-Speicher-Fehler";
  }
};

const splitPayload = (payloadJson: string) => {
  const chunks: string[] = [];
  for (let index = 0; index < payloadJson.length; index += PAYLOAD_CHUNK_SIZE) {
    chunks.push(payloadJson.slice(index, index + PAYLOAD_CHUNK_SIZE));
  }
  return chunks.length ? chunks : [""];
};

const patchFirestoreDocument = async (url: string, fields: Record<string, any>) => {
  const response = await fetch(url, {
    method: "PATCH",
    headers: buildFirestoreHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ fields }),
  });

  if (!response.ok) {
    throw new Error(await parseFirestoreError(response));
  }

  return response.json();
};

const readDocument = async (extraPath = "") => {
  const response = await fetch(getFirestoreDocumentUrl(extraPath), { method: "GET", headers: buildFirestoreHeaders() });
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(await parseFirestoreError(response));
  }
  return response.json();
};

const readManifest = async () => readDocument();

const deleteDocumentIfExists = async (extraPath = "") => {
  try {
    await fetch(getFirestoreDocumentUrl(extraPath), { method: "DELETE", headers: buildFirestoreHeaders() });
  } catch {
    // Best-effort-Aufräumen. Alte Daten werden nicht mehr referenziert, falls Löschen fehlschlägt.
  }
};

const deleteOldChunkIfExists = async (baseExtraPath: string, chunkIndex: number) => {
  const chunkPath = `${baseExtraPath}/chunks/chunk_${String(chunkIndex).padStart(4, "0")}`.replace(/^\/+/, "");
  await deleteDocumentIfExists(chunkPath);
};

const numberFromField = (field: any) => {
  if (!field) return undefined;
  const value = field.integerValue ?? field.doubleValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const stringFromField = (field: any) => {
  const value = field?.stringValue ?? field?.timestampValue;
  return typeof value === "string" ? value : undefined;
};

const parseManifestMeta = (document: any): Omit<OnlineStorageStatus, "ok" | "message" | "exists"> => {
  const fields = document?.fields || {};
  return {
    updatedAt: stringFromField(fields.updatedAt),
    appVersion: stringFromField(fields.appVersion),
    riderCount: numberFromField(fields.riderCount),
    eventCount: numberFromField(fields.eventCount),
    payloadSize: numberFromField(fields.payloadSize),
    backupVersion: stringFromField(fields.backupVersion),
    dataSchemaVersion: stringFromField(fields.dataSchemaVersion),
  };
};

const saveChunkedDocument = async (
  baseExtraPath: string,
  payload: any,
  meta: Record<string, any> = {},
  previousChunkCountOverride?: number,
): Promise<OnlineStorageResponse> => {
  const normalizedBasePath = baseExtraPath.replace(/^\/+|\/+$/g, "");
  const previousManifest = previousChunkCountOverride === undefined ? await readDocument(normalizedBasePath) : null;
  const previousChunkCount = previousChunkCountOverride ?? Number(previousManifest?.fields?.chunkCount?.integerValue || 0);

  const updatedAt = new Date().toISOString();
  const payloadJson = JSON.stringify(payload);
  const chunks = splitPayload(payloadJson);
  const writeId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  for (let index = 0; index < chunks.length; index += 1) {
    await patchFirestoreDocument(getFirestoreDocumentUrl(`${normalizedBasePath}/chunks/chunk_${String(index).padStart(4, "0")}`), {
      index: { integerValue: String(index) },
      writeId: { stringValue: writeId },
      payloadChunk: { stringValue: chunks[index] },
      updatedAt: { timestampValue: updatedAt },
    });
  }

  for (let index = chunks.length; index < previousChunkCount; index += 1) {
    await deleteOldChunkIfExists(normalizedBasePath, index);
  }

  await patchFirestoreDocument(getFirestoreDocumentUrl(normalizedBasePath), {
    storageFormat: { stringValue: "chunked-json-v1" },
    chunkCount: { integerValue: String(chunks.length) },
    payloadSize: { integerValue: String(payloadJson.length) },
    writeId: { stringValue: writeId },
    updatedAt: { timestampValue: updatedAt },
    label: { stringValue: String(meta.label || "") },
    backupId: { stringValue: String(meta.backupId || "") },
    appName: { stringValue: String(meta.appName || payload?.appName || payload?.app || "BMX Race Manager") },
    appVersion: { stringValue: String(meta.appVersion || payload?.appVersion || "") },
    backupVersion: { stringValue: String(payload?.backupVersion || "") },
    dataSchemaVersion: { stringValue: String(payload?.dataSchemaVersion || payload?.schemaVersion || "") },
    riderCount: { integerValue: String(Number(meta.riderCount ?? payload?.riders?.length ?? payload?.data?.riders?.length ?? 0)) },
    eventCount: { integerValue: String(Number(meta.eventCount ?? payload?.managedEvents?.length ?? payload?.data?.managedEvents?.length ?? 0)) },
  });

  return { ok: true, message: "Online gespeichert.", updatedAt };
};

const loadChunkedDocument = async (baseExtraPath = ""): Promise<OnlineStorageResponse> => {
  const normalizedBasePath = baseExtraPath.replace(/^\/+|\/+$/g, "");
  const document = await readDocument(normalizedBasePath);
  if (!document) return { ok: false, message: "Es wurden noch keine Online-Daten gefunden." };

  const fields = document?.fields || {};
  const updatedAt = fields?.updatedAt?.timestampValue;

  // Rückwärtskompatibel: v1.15.0 hatte einen einzelnen payloadJson-String gespeichert.
  const legacyPayloadJson = fields?.payloadJson?.stringValue;
  if (legacyPayloadJson) {
    try {
      return {
        ok: true,
        message: "Online-Daten geladen.",
        updatedAt,
        data: JSON.parse(legacyPayloadJson),
      };
    } catch {
      return { ok: false, message: "Online-Daten konnten nicht gelesen werden." };
    }
  }

  const chunkCount = Number(fields?.chunkCount?.integerValue || 0);
  const expectedWriteId = fields?.writeId?.stringValue;
  if (!chunkCount) return { ok: false, message: "Online-Daten enthalten keine App-Daten." };

  try {
    const chunks: string[] = [];
    for (let index = 0; index < chunkCount; index += 1) {
      const chunkResponse = await fetch(getFirestoreDocumentUrl(`${normalizedBasePath}/chunks/chunk_${String(index).padStart(4, "0")}`), { method: "GET", headers: buildFirestoreHeaders() });
      if (!chunkResponse.ok) {
        return { ok: false, message: `Online-Daten sind unvollständig. Chunk ${index + 1} fehlt.` };
      }
      const chunkDoc = await chunkResponse.json();
      const chunkFields = chunkDoc?.fields || {};
      const chunkWriteId = chunkFields?.writeId?.stringValue;
      if (expectedWriteId && chunkWriteId && chunkWriteId !== expectedWriteId) {
        return { ok: false, message: "Online-Daten sind nicht konsistent. Bitte erneut online speichern." };
      }
      chunks.push(chunkFields?.payloadChunk?.stringValue || "");
    }

    return {
      ok: true,
      message: "Online-Daten geladen.",
      updatedAt,
      data: JSON.parse(chunks.join("")),
    };
  } catch {
    return { ok: false, message: "Online-Daten konnten nicht gelesen werden." };
  }
};

const readBackupIndex = async (): Promise<OnlineBackupListItem[]> => {
  const document = await readDocument(BACKUP_INDEX_PATH);
  const raw = document?.fields?.itemsJson?.stringValue;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.id === "string" && typeof item.createdAt === "string")
      .map((item) => ({
        id: String(item.id),
        label: String(item.label || "Online Backup"),
        createdAt: String(item.createdAt),
        appVersion: item.appVersion ? String(item.appVersion) : undefined,
        riderCount: Number.isFinite(Number(item.riderCount)) ? Number(item.riderCount) : undefined,
        eventCount: Number.isFinite(Number(item.eventCount)) ? Number(item.eventCount) : undefined,
        payloadSize: Number.isFinite(Number(item.payloadSize)) ? Number(item.payloadSize) : undefined,
        backupVersion: item.backupVersion ? String(item.backupVersion) : undefined,
        dataSchemaVersion: item.dataSchemaVersion ? String(item.dataSchemaVersion) : undefined,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
};

const writeBackupIndex = async (items: OnlineBackupListItem[]) => {
  const normalized = items
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, MAX_ONLINE_BACKUPS);

  await patchFirestoreDocument(getFirestoreDocumentUrl(BACKUP_INDEX_PATH), {
    storageFormat: { stringValue: "online-backup-index-v1" },
    updatedAt: { timestampValue: new Date().toISOString() },
    maxBackups: { integerValue: String(MAX_ONLINE_BACKUPS) },
    backupCount: { integerValue: String(normalized.length) },
    itemsJson: { stringValue: JSON.stringify(normalized) },
  });
};

const deleteOnlineBackupByItem = async (item: OnlineBackupListItem) => {
  const basePath = `onlineBackups/${item.id}`;
  try {
    const manifest = await readDocument(basePath);
    const chunkCount = Number(manifest?.fields?.chunkCount?.integerValue || 0);
    for (let index = 0; index < chunkCount; index += 1) {
      await deleteOldChunkIfExists(basePath, index);
    }
    await deleteDocumentIfExists(basePath);
  } catch {
    // Best-effort-Aufräumen. Nicht mehr referenzierte alte Online-Backups werden ignoriert.
  }
};

export const getOnlineAppStateStatus = async (): Promise<OnlineStorageStatus> => {
  if (!isOnlineStorageConfigured()) {
    return { ok: false, exists: false, message: "Online-Speicher ist noch nicht konfiguriert." };
  }

  try {
    const document = await readManifest();
    if (!document) return { ok: true, exists: false, message: "Keine Online-Daten vorhanden." };
    return { ok: true, exists: true, message: "Online-Daten vorhanden.", ...parseManifestMeta(document) };
  } catch (error: any) {
    return { ok: false, exists: false, message: error?.message || "Online-Status konnte nicht gelesen werden." };
  }
};

export const saveOnlineAppState = async (payload: any, meta: Record<string, any> = {}): Promise<OnlineStorageResponse> => {
  if (!isOnlineStorageConfigured()) {
    return { ok: false, message: "Online-Speicher ist noch nicht konfiguriert." };
  }

  try {
    return await saveChunkedDocument("", payload, meta);
  } catch (error: any) {
    return { ok: false, message: error?.message || "Online-Speichern fehlgeschlagen." };
  }
};

export const loadOnlineAppState = async (): Promise<OnlineStorageResponse> => {
  if (!isOnlineStorageConfigured()) {
    return { ok: false, message: "Online-Speicher ist noch nicht konfiguriert." };
  }

  try {
    return await loadChunkedDocument("");
  } catch (error: any) {
    return { ok: false, message: error?.message || "Online-Laden fehlgeschlagen." };
  }
};

export const listOnlineBackups = async (): Promise<OnlineBackupListResponse> => {
  if (!isOnlineStorageConfigured()) {
    return { ok: false, message: "Online-Speicher ist noch nicht konfiguriert.", backups: [] };
  }

  try {
    const backups = await readBackupIndex();
    return { ok: true, message: backups.length ? "Online-Backups gefunden." : "Keine Online-Backups vorhanden.", backups };
  } catch (error: any) {
    return { ok: false, message: error?.message || "Online-Backups konnten nicht gelesen werden.", backups: [] };
  }
};

export const createOnlineBackup = async (
  payload: any,
  label: string,
  meta: Record<string, any> = {},
): Promise<OnlineBackupCreateResponse> => {
  if (!isOnlineStorageConfigured()) {
    return { ok: false, message: "Online-Speicher ist noch nicht konfiguriert." };
  }

  try {
    const safeLabel = String(label || "Online Backup").trim().slice(0, 120) || "Online Backup";
    const id = `backup_${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}_${Math.random().toString(36).slice(2, 8)}`;
    const basePath = `onlineBackups/${id}`;
    const result = await saveChunkedDocument(basePath, payload, { ...meta, label: safeLabel, backupId: id }, 0);
    if (!result.ok) return result;

    const manifest = await readDocument(basePath);
    const manifestMeta = parseManifestMeta(manifest);
    const item: OnlineBackupListItem = {
      id,
      label: safeLabel,
      createdAt: result.updatedAt || new Date().toISOString(),
      appVersion: manifestMeta.appVersion,
      riderCount: manifestMeta.riderCount,
      eventCount: manifestMeta.eventCount,
      payloadSize: manifestMeta.payloadSize,
      backupVersion: manifestMeta.backupVersion,
      dataSchemaVersion: manifestMeta.dataSchemaVersion,
    };

    const current = await readBackupIndex();
    const next = [item, ...current.filter((backup) => backup.id !== id)].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const kept = next.slice(0, MAX_ONLINE_BACKUPS);
    const removed = next.slice(MAX_ONLINE_BACKUPS);
    await writeBackupIndex(kept);

    for (const oldItem of removed) {
      await deleteOnlineBackupByItem(oldItem);
    }

    return { ok: true, message: "Online-Backup erstellt.", updatedAt: item.createdAt, backupId: id, backups: kept };
  } catch (error: any) {
    return { ok: false, message: error?.message || "Online-Backup konnte nicht erstellt werden." };
  }
};

export const loadOnlineBackup = async (backupId: string): Promise<OnlineStorageResponse> => {
  if (!isOnlineStorageConfigured()) {
    return { ok: false, message: "Online-Speicher ist noch nicht konfiguriert." };
  }

  const cleanId = String(backupId || "").trim();
  if (!cleanId) return { ok: false, message: "Kein Online-Backup ausgewählt." };

  try {
    return await loadChunkedDocument(`onlineBackups/${cleanId}`);
  } catch (error: any) {
    return { ok: false, message: error?.message || "Online-Backup konnte nicht geladen werden." };
  }
};
