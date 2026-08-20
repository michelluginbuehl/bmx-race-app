import { firebaseOnlineStorageConfig } from "../config/firebaseConfig";

type OnlineStorageResponse = {
  ok: boolean;
  message: string;
  updatedAt?: string;
  liveVersion?: number;
  data?: any;
};

export type PublicLiveRacePayload = {
  publicVersion: number;
  liveVersion?: number;
  active: boolean;
  refreshSeconds?: number;
  hasRaceProgram?: boolean;
  publishedAt: string;
  updatedAt: string;
  appName: string;
  appVersion: string;
  eventId: string;
  eventName: string;
  raceName: string;
  raceStatus: string;
  location?: string;
  date?: string;
  participantCount: number;
  categories: any[];
  motos: any[];
  finals: any[];
  finalRankings: any[];
};

export type PublicLiveRaceResponse = {
  ok: boolean;
  message: string;
  exists: boolean;
  active: boolean;
  updatedAt?: string;
  data?: PublicLiveRacePayload | null;
};

export type PublicLiveRaceMeta = {
  liveVersion: number;
  active: boolean;
  updatedAt?: string;
  appName?: string;
  appVersion?: string;
  eventId?: string;
  eventName?: string;
  raceName?: string;
  raceStatus?: string;
  participantCount?: number;
  hasRaceProgram?: boolean;
  payloadSize?: number;
};

export type PublicLiveRaceMetaResponse = {
  ok: boolean;
  message: string;
  exists: boolean;
  active: boolean;
  updatedAt?: string;
  data?: PublicLiveRaceMeta | null;
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
  saveRevision?: number;
  savedByDevice?: string;
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
  saveRevision?: number;
  savedByDevice?: string;
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
const PUBLIC_LIVE_RACE_PATH = "bmxRacePublic/currentRace";
const PUBLIC_LIVE_RACE_META_PATH = "bmxRacePublic/currentRaceMeta";
const PUBLIC_LIVE_RACE_PAYLOAD_LIMIT = 900_000;

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

const getFirestoreDatabaseDocumentUrl = (documentPath: string) => {
  const { projectId, apiKey } = firebaseOnlineStorageConfig;
  const databaseId = String((firebaseOnlineStorageConfig as any).databaseId || "default").trim() || "default";
  const fullPath = String(documentPath || "")
    .split("/")
    .filter(Boolean)
    .map(encodePathPart)
    .join("/");

  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId.trim())}/databases/${encodeURIComponent(databaseId)}/documents/${fullPath}?key=${encodeURIComponent(apiKey.trim())}`;
};

const getFirestoreDocumentUrl = (extraPath = "") => {
  const { collectionPath, documentId } = firebaseOnlineStorageConfig;
  const cleanCollection = collectionPath.trim().replace(/^\/+|\/+$/g, "");
  const cleanDocument = documentId.trim().replace(/^\/+|\/+$/g, "");
  const basePath = `${cleanCollection}/${cleanDocument}`;
  return getFirestoreDatabaseDocumentUrl(`${basePath}/${extraPath}`);
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
    saveRevision: numberFromField(fields.saveRevision),
    savedByDevice: stringFromField(fields.savedByDevice),
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
    saveRevision: { integerValue: String(Number(meta.saveRevision || 0)) },
    savedByDevice: { stringValue: String(meta.savedByDevice || "") },
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
        saveRevision: Number.isFinite(Number(item.saveRevision)) ? Number(item.saveRevision) : undefined,
        savedByDevice: item.savedByDevice ? String(item.savedByDevice) : undefined,
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
      saveRevision: manifestMeta.saveRevision,
      savedByDevice: manifestMeta.savedByDevice,
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


const readPublicLiveRaceMetaDocument = async () => {
  const response = await fetch(getFirestoreDatabaseDocumentUrl(PUBLIC_LIVE_RACE_META_PATH), { method: "GET" });
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(await parseFirestoreError(response));
  }
  return response.json();
};

const parsePublicLiveRaceMetaDocument = (document: any): PublicLiveRaceMeta | null => {
  const fields = document?.fields || {};
  if (!fields || Object.keys(fields).length === 0) return null;
  const liveVersion = numberFromField(fields.liveVersion) || 0;
  const updatedAt = stringFromField(fields.updatedAt);
  return {
    liveVersion,
    active: fields?.active?.booleanValue === true,
    updatedAt,
    appName: stringFromField(fields.appName),
    appVersion: stringFromField(fields.appVersion),
    eventId: stringFromField(fields.eventId),
    eventName: stringFromField(fields.eventName),
    raceName: stringFromField(fields.raceName),
    raceStatus: stringFromField(fields.raceStatus),
    participantCount: numberFromField(fields.participantCount),
    hasRaceProgram: fields?.hasRaceProgram?.booleanValue === true,
    payloadSize: numberFromField(fields.payloadSize),
  };
};

export const loadPublicLiveRaceMeta = async (): Promise<PublicLiveRaceMetaResponse> => {
  if (!isOnlineStorageConfigured()) {
    return { ok: false, exists: false, active: false, message: "Online-Speicher ist noch nicht konfiguriert." };
  }

  try {
    const document = await readPublicLiveRaceMetaDocument();
    if (!document) return { ok: true, exists: false, active: false, message: "Aktuell ist kein Rennen live veröffentlicht." };
    const data = parsePublicLiveRaceMetaDocument(document);
    if (!data) return { ok: true, exists: false, active: false, message: "Aktuell ist kein Rennen live veröffentlicht." };
    return {
      ok: true,
      exists: true,
      active: data.active,
      updatedAt: data.updatedAt,
      data,
      message: data.active ? "Live-Meta geladen." : "Aktuell ist kein Rennen live veröffentlicht.",
    };
  } catch (error: any) {
    return { ok: false, exists: false, active: false, message: error?.message || "Live-Meta konnte nicht geladen werden." };
  }
};

const getNextPublicLiveVersion = async () => {
  try {
    const metaDocument = await readPublicLiveRaceMetaDocument();
    const currentVersion = numberFromField(metaDocument?.fields?.liveVersion) || 0;
    return currentVersion + 1;
  } catch {
    return 1;
  }
};

const readPublicLiveRaceDocument = async () => {
  const response = await fetch(getFirestoreDatabaseDocumentUrl(PUBLIC_LIVE_RACE_PATH), { method: "GET" });
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(await parseFirestoreError(response));
  }
  return response.json();
};

export const loadPublicLiveRace = async (): Promise<PublicLiveRaceResponse> => {
  if (!isOnlineStorageConfigured()) {
    return { ok: false, exists: false, active: false, message: "Online-Speicher ist noch nicht konfiguriert." };
  }

  try {
    const document = await readPublicLiveRaceDocument();
    if (!document) return { ok: true, exists: false, active: false, message: "Aktuell ist kein Rennen live veröffentlicht." };

    const fields = document?.fields || {};
    const active = fields?.active?.booleanValue === true;
    const updatedAt = fields?.updatedAt?.timestampValue || fields?.updatedAt?.stringValue;
    const payloadJson = fields?.payloadJson?.stringValue || "";
    if (!payloadJson) return { ok: true, exists: true, active: false, updatedAt, message: "Live-Rennen ist leer." };

    const data = JSON.parse(payloadJson) as PublicLiveRacePayload;
    const liveVersion = numberFromField(fields.liveVersion);
    if (liveVersion && !data.liveVersion) data.liveVersion = liveVersion;
    return {
      ok: true,
      exists: true,
      active: active && data?.active !== false,
      updatedAt: updatedAt || data?.updatedAt,
      data,
      message: active && data?.active !== false ? "Live-Rennen geladen." : "Aktuell ist kein Rennen live veröffentlicht.",
    };
  } catch (error: any) {
    return { ok: false, exists: false, active: false, message: error?.message || "Live-Rennen konnte nicht geladen werden." };
  }
};

export const publishPublicLiveRace = async (payload: PublicLiveRacePayload): Promise<OnlineStorageResponse> => {
  if (!isOnlineStorageConfigured()) {
    return { ok: false, message: "Online-Speicher ist noch nicht konfiguriert." };
  }

  try {
    const updatedAt = new Date().toISOString();
    const liveVersion = await getNextPublicLiveVersion();
    const hasRaceProgram =
      payload?.hasRaceProgram === true ||
      (Array.isArray(payload?.motos) && payload.motos.length > 0) ||
      (Array.isArray(payload?.finals) && payload.finals.length > 0) ||
      (Array.isArray(payload?.finalRankings) && payload.finalRankings.length > 0);
    const normalizedPayload = { ...payload, active: true, updatedAt, liveVersion, hasRaceProgram };
    const payloadJson = JSON.stringify(normalizedPayload);
    if (payloadJson.length > PUBLIC_LIVE_RACE_PAYLOAD_LIMIT) {
      return { ok: false, message: "Live-Rennen ist zu gross für ein einzelnes öffentliches Firestore-Dokument. Bitte später auf Chunk-Speicherung erweitern." };
    }

    const commonFields = {
      active: { booleanValue: true },
      updatedAt: { timestampValue: updatedAt },
      liveVersion: { integerValue: String(liveVersion) },
      appName: { stringValue: String(normalizedPayload.appName || "BMX Race Manager") },
      appVersion: { stringValue: String(normalizedPayload.appVersion || "") },
      eventId: { stringValue: String(normalizedPayload.eventId || "") },
      eventName: { stringValue: String(normalizedPayload.eventName || "") },
      raceName: { stringValue: String(normalizedPayload.raceName || "") },
      raceStatus: { stringValue: String(normalizedPayload.raceStatus || "") },
      participantCount: { integerValue: String(Number(normalizedPayload.participantCount || 0)) },
      hasRaceProgram: { booleanValue: hasRaceProgram },
      payloadSize: { integerValue: String(payloadJson.length) },
    };

    await patchFirestoreDocument(getFirestoreDatabaseDocumentUrl(PUBLIC_LIVE_RACE_PATH), {
      storageFormat: { stringValue: "public-live-race-v2" },
      ...commonFields,
      payloadJson: { stringValue: payloadJson },
    });

    await patchFirestoreDocument(getFirestoreDatabaseDocumentUrl(PUBLIC_LIVE_RACE_META_PATH), {
      storageFormat: { stringValue: "public-live-race-meta-v1" },
      ...commonFields,
    });

    return { ok: true, message: "Live-Rennen veröffentlicht.", updatedAt, liveVersion };
  } catch (error: any) {
    return { ok: false, message: error?.message || "Live-Rennen konnte nicht veröffentlicht werden." };
  }
};

export const deactivatePublicLiveRace = async (payload: Partial<PublicLiveRacePayload> = {}): Promise<OnlineStorageResponse> => {
  if (!isOnlineStorageConfigured()) {
    return { ok: false, message: "Online-Speicher ist noch nicht konfiguriert." };
  }

  try {
    const updatedAt = new Date().toISOString();
    const liveVersion = await getNextPublicLiveVersion();
    const normalizedPayload = {
      publicVersion: 1,
      liveVersion,
      active: false,
      publishedAt: String(payload.publishedAt || updatedAt),
      updatedAt,
      appName: String(payload.appName || "BMX Race Manager"),
      appVersion: String(payload.appVersion || ""),
      eventId: String(payload.eventId || ""),
      eventName: String(payload.eventName || ""),
      raceName: String(payload.raceName || ""),
      raceStatus: "Live-Ansicht beendet",
      location: String(payload.location || ""),
      date: String(payload.date || ""),
      participantCount: Number(payload.participantCount || 0),
      hasRaceProgram: false,
      categories: [],
      motos: [],
      finals: [],
      finalRankings: [],
    };
    const payloadJson = JSON.stringify(normalizedPayload);

    await patchFirestoreDocument(getFirestoreDatabaseDocumentUrl(PUBLIC_LIVE_RACE_PATH), {
      storageFormat: { stringValue: "public-live-race-v1" },
      active: { booleanValue: false },
      updatedAt: { timestampValue: updatedAt },
      liveVersion: { integerValue: String(liveVersion) },
      appName: { stringValue: normalizedPayload.appName },
      appVersion: { stringValue: normalizedPayload.appVersion },
      eventId: { stringValue: normalizedPayload.eventId },
      eventName: { stringValue: normalizedPayload.eventName },
      raceName: { stringValue: normalizedPayload.raceName },
      raceStatus: { stringValue: normalizedPayload.raceStatus },
      participantCount: { integerValue: String(normalizedPayload.participantCount) },
      hasRaceProgram: { booleanValue: false },
      payloadSize: { integerValue: String(payloadJson.length) },
      payloadJson: { stringValue: payloadJson },
    });

    await patchFirestoreDocument(getFirestoreDatabaseDocumentUrl(PUBLIC_LIVE_RACE_META_PATH), {
      storageFormat: { stringValue: "public-live-race-meta-v1" },
      active: { booleanValue: false },
      updatedAt: { timestampValue: updatedAt },
      liveVersion: { integerValue: String(liveVersion) },
      appName: { stringValue: normalizedPayload.appName },
      appVersion: { stringValue: normalizedPayload.appVersion },
      eventId: { stringValue: normalizedPayload.eventId },
      eventName: { stringValue: normalizedPayload.eventName },
      raceName: { stringValue: normalizedPayload.raceName },
      raceStatus: { stringValue: normalizedPayload.raceStatus },
      participantCount: { integerValue: String(normalizedPayload.participantCount) },
      hasRaceProgram: { booleanValue: false },
      payloadSize: { integerValue: String(payloadJson.length) },
    });

    return { ok: true, message: "Live-Rennen beendet.", updatedAt, liveVersion };
  } catch (error: any) {
    return { ok: false, message: error?.message || "Live-Rennen konnte nicht beendet werden." };
  }
};

