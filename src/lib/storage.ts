/**
 * Whether the browser keeps the library for good. Without persistence it may clear IndexedDB
 * (books and annotations) when the device runs short of space.
 */
export interface StorageStatus {
  /** null when the browser can't tell (no StorageManager). */
  persisted: boolean | null;
  /** Bytes used and available to the app, when known. */
  usage?: number;
  quota?: number;
}

export async function storageStatus(): Promise<StorageStatus> {
  const storage = navigator.storage;
  if (!storage?.persisted) return { persisted: null };
  const [persisted, estimate] = await Promise.all([storage.persisted().catch(() => false), storage.estimate?.().catch(() => undefined)]);
  return { persisted, usage: estimate?.usage, quota: estimate?.quota };
}

/** Asks the browser to keep the data; true if it agreed (Chrome decides by itself, e.g. for installed apps). */
export async function protectStorage(): Promise<boolean> {
  return (await navigator.storage?.persist?.().catch(() => false)) ?? false;
}

/** "1,2 GB", "350 MB", "12 KB". */
export function formatBytes(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toLocaleString('pt-BR', { maximumFractionDigits: bytes < 10 && i > 1 ? 1 : 0 })} ${units[i]}`;
}
