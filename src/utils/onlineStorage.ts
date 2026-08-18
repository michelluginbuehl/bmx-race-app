import { firebaseOnlineStorageConfig } from "../config/firebaseConfig";

type OnlineStorageResponse = {
  ok: boolean;
  message: string;
  updatedAt?: string;
  data?: any;
};

const PAYLOAD_CHUNK_SIZE = 180_000;

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
  const cleanCollection = collectionPath.trim().replace(/^\/+|\/+$/g, "");
  const cleanDocument = documentId.trim().replace(/^\/+|\/+$/g, "");
  const basePath = `${cleanCollection}/${cleanDocument}`;
  const fullPath = `${basePath}/${extraPath}`
    .split("/")
    .filter(Boolean)
    .map(encodePathPart)
    .join("/");

  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId.trim())}/databases/(default)/documents/${fullPath}?key=${encodeURIComponent(apiKey.trim())}`;
};

const parseFirestoreError = async (response: Response) => {
  try {
    const json = await response.json();
    return json?.error?.message || response.statusText || "Unbekannter Online-Speicher-Fehler";
  } catch {
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });

  if (!response.ok) {
    throw new Error(await parseFirestoreError(response));
  }

  return response.json();
};

const readManifest = async () => {
  const response = await fetch(getFirestoreDocumentUrl(), { method: "GET" });
  if (!response.ok) return null;
  return response.json();
};

const deleteOldChunkIfExists = async (chunkIndex: number) => {
  const url = getFirestoreDocumentUrl(`chunks/chunk_${String(chunkIndex).padStart(4, "0")}`);
  try {
    await fetch(url, { method: "DELETE" });
  } catch {
    // Das Löschen alter überschüssiger Chunks ist nur Aufräumarbeit.
    // Laden verwendet die Chunk-Anzahl aus dem Manifest und ignoriert alte Chunks.
  }
};

export const saveOnlineAppState = async (payload: any, meta: Record<string, any> = {}): Promise<OnlineStorageResponse> => {
  if (!isOnlineStorageConfigured()) {
    return { ok: false, message: "Online-Speicher ist noch nicht konfiguriert." };
  }

  try {
    const previousManifest = await readManifest();
    const previousChunkCount = Number(previousManifest?.fields?.chunkCount?.integerValue || 0);

    const updatedAt = new Date().toISOString();
    const payloadJson = JSON.stringify(payload);
    const chunks = splitPayload(payloadJson);
    const writeId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    for (let index = 0; index < chunks.length; index += 1) {
      await patchFirestoreDocument(getFirestoreDocumentUrl(`chunks/chunk_${String(index).padStart(4, "0")}`), {
        index: { integerValue: String(index) },
        writeId: { stringValue: writeId },
        payloadChunk: { stringValue: chunks[index] },
        updatedAt: { timestampValue: updatedAt },
      });
    }

    for (let index = chunks.length; index < previousChunkCount; index += 1) {
      await deleteOldChunkIfExists(index);
    }

    await patchFirestoreDocument(getFirestoreDocumentUrl(), {
      storageFormat: { stringValue: "chunked-json-v1" },
      chunkCount: { integerValue: String(chunks.length) },
      payloadSize: { integerValue: String(payloadJson.length) },
      writeId: { stringValue: writeId },
      updatedAt: { timestampValue: updatedAt },
      appName: { stringValue: String(meta.appName || payload?.appName || payload?.app || "BMX Race Manager") },
      appVersion: { stringValue: String(meta.appVersion || payload?.appVersion || "") },
      backupVersion: { stringValue: String(payload?.backupVersion || "") },
      dataSchemaVersion: { stringValue: String(payload?.dataSchemaVersion || payload?.schemaVersion || "") },
      riderCount: { integerValue: String(Number(meta.riderCount ?? payload?.riders?.length ?? payload?.data?.riders?.length ?? 0)) },
      eventCount: { integerValue: String(Number(meta.eventCount ?? payload?.managedEvents?.length ?? payload?.data?.managedEvents?.length ?? 0)) },
    });

    return { ok: true, message: "Online gespeichert.", updatedAt };
  } catch (error: any) {
    return { ok: false, message: error?.message || "Online-Speichern fehlgeschlagen." };
  }
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
      const chunkResponse = await fetch(getFirestoreDocumentUrl(`chunks/chunk_${String(index).padStart(4, "0")}`), { method: "GET" });
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
