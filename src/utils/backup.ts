import { APP_CONFIG } from "../config/appConfig";

function sanitizeFileName(value: string): string {
  return value
    .replace(/[ä]/g, "ae")
    .replace(/[ö]/g, "oe")
    .replace(/[ü]/g, "ue")
    .replace(/[Ä]/g, "Ae")
    .replace(/[Ö]/g, "Oe")
    .replace(/[Ü]/g, "Ue")
    .replace(/[ß]/g, "ss")
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function createBackupFileName(label = "backup"): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-");

  return `${APP_CONFIG.backupPrefix}_${sanitizeFileName(label)}_${timestamp}.json`;
}

export function downloadJsonBackup(data: unknown, label = "manual"): void {
  try {
    const fileName = createBackupFileName(label);
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Backup konnte nicht erstellt werden:", error);
    alert("Backup konnte nicht erstellt werden.");
  }
}

export async function readJsonBackup<T>(file: File): Promise<T> {
  const text = await file.text();

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Backup-Datei ist keine gültige JSON-Datei.");
  }
}
