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
    .replace(/[^a-zA-Z0-9-_]/g, "_");
}

export function createBackupFileName(label = "backup"): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  return `${APP_CONFIG.backupPrefix}_${sanitizeFileName(label)}_${timestamp}.json`;
}

export function downloadJsonBackup(data: unknown, label?: string): void {
  const fileName = createBackupFileName(label);
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();

  URL.revokeObjectURL(url);
}

export async function readJsonBackup<T>(file: File): Promise<T> {
  const text = await file.text();
  return JSON.parse(text) as T;
}
