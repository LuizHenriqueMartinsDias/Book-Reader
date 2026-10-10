import { db, lastChangeAt } from '../db/schema';
import { createBackup, download } from './backup';
import { currentToken, driveAvailable, DriveSignInCancelled, forgetToken, getToken } from './drive/auth';
import { DriveError, uploadBackup } from './drive/files';

export const DAY = 24 * 60 * 60 * 1000;
/** Backups kept in the backup folder; older ones are deleted. */
const KEEP = 10;
/** File names of backups (others in a backup folder are left alone). */
export const BACKUP_NAME = /^book-reader-backup-\d{4}-\d{2}-\d{2}\.json$/;

/** `book-reader-backup-2026-10-10.json`, by the local date (one file per day, overwritten). */
export function backupFileName(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `book-reader-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

/**
 * Whether a backup is due: there's something to back up, it changed since the last backup (or
 * that's unknown), and the last backup is at least `maxAge` old. Never backed up: due right away.
 */
export function needsBackup(o: { now: number; lastBackupAt: number | null; lastChangeAt: number | null; hasData: boolean; maxAge: number }) {
  if (!o.hasData) return false;
  if (o.lastBackupAt == null) return true;
  if (o.lastChangeAt != null && o.lastChangeAt <= o.lastBackupAt) return false;
  return o.now - o.lastBackupAt >= o.maxAge;
}

/** Whether the library has anything a backup would hold. */
export async function hasBackupData() {
  const counts = await Promise.all([db.notes.count(), db.strokes.count(), db.highlights.count(), db.notebooks.count(), db.habitLogs.count()]);
  return counts.some((n) => n > 0);
}

export async function backupDue(lastBackupAt: number | null, maxAge: number, now = Date.now()) {
  return needsBackup({ now, lastBackupAt, lastChangeAt: lastChangeAt(), hasData: await hasBackupData(), maxAge });
}

// ---- Backup folder (computers: File System Access API, Chrome and Edge) ----

type Access = { mode: 'readwrite' };
/** Chrome's handle methods that TypeScript's DOM types don't have yet. */
export interface FolderHandle extends FileSystemDirectoryHandle {
  queryPermission(d: Access): Promise<PermissionState>;
  requestPermission(d: Access): Promise<PermissionState>;
  keys(): AsyncIterable<string>;
}
type Picker = (o: { id?: string; mode?: 'readwrite'; startIn?: string }) => Promise<FolderHandle>;

const FOLDER_KEY = 'backupFolder';
/** The handle as picked (stored ones come back from IndexedDB as the same kind of object). */
let folderCache: FolderHandle | null | undefined;

/** Computers with Chrome or Edge can save backups into a folder by themselves; phones can't. */
export const canPickFolder = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export async function getBackupFolder(): Promise<FolderHandle | null> {
  if (folderCache === undefined) folderCache = ((await db.settings.get(FOLDER_KEY))?.value as FolderHandle | undefined) ?? null;
  return folderCache;
}

/** Lets the user pick the backup folder and remembers it; its name, or null if cancelled. */
export async function chooseBackupFolder(): Promise<string | null> {
  try {
    const dir = await (window as unknown as { showDirectoryPicker: Picker }).showDirectoryPicker({ id: 'book-reader-backup', mode: 'readwrite', startIn: 'documents' });
    await db.settings.put({ key: FOLDER_KEY, value: dir });
    folderCache = dir;
    return dir.name;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    throw e;
  }
}

export async function forgetBackupFolder() {
  await db.settings.delete(FOLDER_KEY);
  folderCache = null;
}

/** Whether the app may write into the backup folder without asking (else automatic backups wait for a tap). */
export async function folderAllowed(dir: FolderHandle) {
  return (await dir.queryPermission({ mode: 'readwrite' }).catch(() => 'denied')) === 'granted';
}

/** Whether the app may write into the folder; with `ask`, prompts for it (needs a tap to have started this). */
async function canWrite(dir: FolderHandle, ask: boolean) {
  const access: Access = { mode: 'readwrite' };
  if ((await dir.queryPermission(access)) === 'granted') return true;
  return ask && (await dir.requestPermission(access).catch(() => 'denied')) === 'granted';
}

/** The backups to delete from a folder's file names: all but the `keep` newest (other files are left alone). */
export function backupsToRemove(names: string[], keep = KEEP) {
  return names
    .filter((n) => BACKUP_NAME.test(n))
    .sort()
    .reverse()
    .slice(keep);
}

async function writeToFolder(dir: FolderHandle, blob: Blob, name: string) {
  const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
  await writable.write(blob);
  await writable.close();
  const names: string[] = [];
  for await (const n of dir.keys()) names.push(n);
  for (const old of backupsToRemove(names)) await dir.removeEntry(old).catch(() => {});
}

// ---- Saving ----

export type BackupResult =
  | { via: 'drive' }
  | { via: 'folder'; folder: string }
  | { via: 'share' }
  | { via: 'download' }
  | { via: 'cancelled' }
  /** The share sheet needs a fresh tap (building the backup took too long): offer a button that calls `shareBackup`. */
  | { via: 'share-blocked'; file: File };

/** Whether a result means the backup was saved somewhere. */
export const savedBackup = (r: BackupResult) => r.via === 'drive' || r.via === 'folder' || r.via === 'share' || r.via === 'download';

async function toDrive(token: string) {
  try {
    await uploadBackup(token, await createBackup(), backupFileName());
  } catch (e) {
    // Expired: the next tap signs in again.
    if (e instanceof DriveError && e.status === 401) forgetToken();
    throw e;
  }
}

/**
 * Backs up in one tap, the best way the device has: straight into Google Drive (when connected,
 * `drive` being the account), into the chosen backup folder (computers), through the share sheet
 * so it goes to Drive, Files… (phones and tablets), or else as a download.
 */
export async function backupNow({ drive }: { drive?: string | null } = {}): Promise<BackupResult> {
  if (drive && driveAvailable()) {
    let token: string;
    try {
      // Before the slow part, like the folder's permission: Google's window needs the tap.
      token = await getToken(drive);
    } catch (e) {
      if (e instanceof DriveSignInCancelled) return { via: 'cancelled' };
      throw e;
    }
    await toDrive(token);
    return { via: 'drive' };
  }
  const dir = canPickFolder() ? await getBackupFolder() : null;
  // Ask for the folder before the slow part: the prompt needs the tap that started this.
  if (dir && (await canWrite(dir, true))) {
    await writeToFolder(dir, await createBackup(), backupFileName());
    return { via: 'folder', folder: dir.name };
  }
  const file = new File([await createBackup()], backupFileName(), { type: 'application/json' });
  // Computers download (and can pick a folder instead); the share sheet is for phones and tablets.
  if (!canPickFolder() && navigator.canShare?.({ files: [file] })) return shareBackup(file);
  download(file, file.name);
  return { via: 'download' };
}

/** Opens the share sheet with the backup file; a download if sharing fails for another reason than the user closing it. */
export async function shareBackup(file: File): Promise<BackupResult> {
  try {
    await navigator.share({ files: [file], title: file.name });
    return { via: 'share' };
  } catch (e) {
    const name = e instanceof DOMException ? e.name : '';
    if (name === 'AbortError') return { via: 'cancelled' };
    if (name === 'NotAllowedError') return { via: 'share-blocked', file };
    download(file, file.name);
    return { via: 'download' };
  }
}

/**
 * On opening the app: saves a backup into Google Drive (signed in within the hour) or the backup
 * folder, without asking, if it's still allowed, the last backup is over a day old and something
 * changed. True if it saved one.
 */
export async function autoBackup(lastBackupAt: number | null, drive?: string | null): Promise<boolean> {
  // Google Drive only while a sign-in from a recent tap is still good (an hour): no window without a tap.
  const token = drive && driveAvailable() ? currentToken() : null;
  if (token) {
    if (!(await backupDue(lastBackupAt, DAY))) return false;
    await toDrive(token);
    return true;
  }
  if (!canPickFolder()) return false;
  const dir = await getBackupFolder();
  if (!dir || !(await backupDue(lastBackupAt, DAY)) || !(await canWrite(dir, false))) return false;
  await writeToFolder(dir, await createBackup(), backupFileName());
  return true;
}
