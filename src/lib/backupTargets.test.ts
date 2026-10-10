import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, lastChangeAt } from '../db/schema';
import { allowBackupFolder, autoBackup, backupFileName, backupNow, backupsToRemove, chooseBackupFolder, DAY, forgetBackupFolder, needsBackup } from './backupTargets';

const NOW = Date.UTC(2026, 9, 10, 12);

describe('needsBackup', () => {
  const base = { now: NOW, lastBackupAt: NOW - 8 * DAY, lastChangeAt: NOW - DAY, hasData: true, maxAge: 7 * DAY };

  it('is due when the last backup is old and something changed since', () => {
    expect(needsBackup(base)).toBe(true);
  });

  it('waits until the backup is old enough', () => {
    expect(needsBackup({ ...base, lastBackupAt: NOW - 6 * DAY })).toBe(false);
  });

  it('is not due when nothing changed since the last backup', () => {
    expect(needsBackup({ ...base, lastChangeAt: NOW - 9 * DAY })).toBe(false);
  });

  it('assumes changes when they are unknown', () => {
    expect(needsBackup({ ...base, lastChangeAt: null })).toBe(true);
  });

  it('is due right away if there was never a backup, but only with something to back up', () => {
    expect(needsBackup({ ...base, lastBackupAt: null })).toBe(true);
    expect(needsBackup({ ...base, lastBackupAt: null, hasData: false })).toBe(false);
  });
});

describe('backup files', () => {
  it('are named by the local date', () => {
    expect(backupFileName(new Date(2026, 0, 5, 23, 30))).toBe('book-reader-backup-2026-01-05.json');
  });

  it('keeps the 10 newest backups and leaves other files alone', () => {
    const names = Array.from({ length: 12 }, (_, i) => `book-reader-backup-2026-01-${String(i + 1).padStart(2, '0')}.json`);
    expect(backupsToRemove([...names, 'notes.txt', 'book-reader-backup-old.json'])).toEqual(['book-reader-backup-2026-01-02.json', 'book-reader-backup-2026-01-01.json']);
  });
});

describe('change tracking', () => {
  it('notes writes to annotations but not to reading positions', async () => {
    localStorage.clear();
    await db.books.put({ id: 'b', title: 'T', pageCount: 1, addedAt: 0, lastOpenedAt: 0, lastPage: 1, zoom: 0, fileSize: 1 });
    expect(lastChangeAt()).toBeNull();
    await db.notes.put({ id: 'n', bookId: 'b', page: 1, body: 'x', createdAt: 0, updatedAt: 0 });
    expect(lastChangeAt()).toBeGreaterThan(0);
  });
});

/** A backup folder that keeps its files in memory, like Chrome's FileSystemDirectoryHandle. */
class FakeFolder {
  name = 'Backups';
  files = new Map<string, Blob>();
  permission: PermissionState = 'granted';
  async queryPermission() {
    return this.permission;
  }
  async requestPermission() {
    return this.permission;
  }
  async getFileHandle(name: string) {
    return { createWritable: async () => ({ write: async (b: Blob) => void this.files.set(name, b), close: async () => {} }) };
  }
  async *keys() {
    yield* this.files.keys();
  }
  async removeEntry(name: string) {
    this.files.delete(name);
  }
}

describe('saving a backup', () => {
  const nav = navigator as unknown as Record<string, unknown>;
  const win = window as unknown as Record<string, unknown>;
  let downloaded: string[];

  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await forgetBackupFolder();
    await db.notes.put({ id: 'n', bookId: 'b', page: 1, body: 'x', createdAt: 0, updatedAt: 0 });
    downloaded = [];
    URL.createObjectURL = () => 'blob:x';
    URL.revokeObjectURL = () => {};
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloaded.push(this.download);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete nav.share;
    delete nav.canShare;
    delete win.showDirectoryPicker;
  });

  it('goes to the share sheet on phones and tablets', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(nav, { share, canShare: () => true });
    expect(await backupNow()).toEqual({ via: 'share' });
    const file = share.mock.calls[0][0].files[0] as File;
    expect(file.name).toBe(backupFileName());
    expect(file.type).toBe('application/json');
    expect(downloaded).toEqual([]);
  });

  it('tells apart closing the share sheet from a share that needs a new tap', async () => {
    Object.assign(nav, { canShare: () => true, share: vi.fn().mockRejectedValue(new DOMException('', 'AbortError')) });
    expect(await backupNow()).toEqual({ via: 'cancelled' });
    nav.share = vi.fn().mockRejectedValue(new DOMException('', 'NotAllowedError'));
    expect((await backupNow()).via).toBe('share-blocked');
    expect(downloaded).toEqual([]);
  });

  it('downloads when files cannot be shared', async () => {
    Object.assign(nav, { share: vi.fn(), canShare: () => false });
    expect(await backupNow()).toEqual({ via: 'download' });
    expect(downloaded).toEqual([backupFileName()]);
  });

  it('downloads on computers until a folder is picked, then saves into it', async () => {
    const folder = new FakeFolder();
    Object.assign(nav, { share: vi.fn(), canShare: () => true });
    win.showDirectoryPicker = vi.fn().mockResolvedValue(folder);
    expect(await backupNow()).toEqual({ via: 'download' });

    expect(await chooseBackupFolder()).toBe('Backups');
    expect(await backupNow()).toEqual({ via: 'folder', folder: 'Backups' });
    expect([...folder.files.keys()]).toEqual([backupFileName()]);
    expect(JSON.parse(await folder.files.get(backupFileName())!.text()).notes).toHaveLength(1);
    expect(nav.share).not.toHaveBeenCalled();
  });

  it('backs up into the folder by itself when due and allowed', async () => {
    const folder = new FakeFolder();
    win.showDirectoryPicker = vi.fn().mockResolvedValue(folder);
    await chooseBackupFolder();
    folder.permission = 'prompt';
    expect(await autoBackup(null)).toBe(false);
    folder.permission = 'granted';
    expect(await autoBackup(Date.now())).toBe(false);
    expect(await autoBackup(null)).toBe(true);
    expect(folder.files.size).toBe(1);
  });

  it('asks again for the remembered folder, so automatic backups go on', async () => {
    expect(await allowBackupFolder()).toBe(false);
    const folder = new FakeFolder();
    win.showDirectoryPicker = vi.fn().mockResolvedValue(folder);
    await chooseBackupFolder();
    folder.permission = 'prompt';
    folder.requestPermission = async () => (folder.permission = 'granted');
    expect(await autoBackup(null)).toBe(false);
    expect(await allowBackupFolder()).toBe(true);
    expect(win.showDirectoryPicker).toHaveBeenCalledTimes(1);
    expect(await autoBackup(null)).toBe(true);
  });
});
