import { Cloud, Download, FolderOpen, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  autoBackup,
  backupDue,
  backupNow,
  canPickFolder,
  chooseBackupFolder,
  DAY,
  folderAllowed,
  getBackupFolder,
  savedBackup,
  shareBackup,
  type BackupResult,
} from '../../lib/backupTargets';
import { driveAvailable, DriveSignInCancelled, forgetToken, getToken, loadGoogle, revokeDrive } from '../../lib/drive/auth';
import { downloadBackup, driveEmail, forgetDriveFolder, listBackups, type DriveBackup } from '../../lib/drive/files';
import { DriveRelink, finishLink, isLinked, LINK_ROUTE, linkAvailable, startLink, unlink } from '../../lib/drive/link';
import { formatBytes, protectStorage, storageStatus, type StorageStatus } from '../../lib/storage';
import { useUi } from '../../store/ui';
import { useToast } from '../Toast';

/** How long without a backup (with changes) before the shelf shows the reminder. */
const REMIND_AFTER = 7 * DAY;
/** Closing the reminder hides it until the app is opened again. */
let reminderDismissed = false;

const daysSince = (t: number) => Math.floor((Date.now() - t) / DAY);
const ago = (t: number) => {
  const days = daysSince(t);
  return days === 0 ? 'hoje' : days === 1 ? 'ontem' : `há ${days} dias`;
};

function report(r: BackupResult) {
  if (savedBackup(r)) useUi.getState().set({ lastBackupAt: Date.now() });
  const toast = useToast.getState();
  if (r.via === 'drive') toast.show('Backup salvo no Google Drive');
  else if (r.via === 'folder') toast.show(`Backup salvo na pasta “${r.folder}”`);
  else if (r.via === 'download') toast.show('Backup baixado');
  else if (r.via === 'share') toast.show('Backup feito');
  // Building it took long enough that the browser wants a new tap to open the share sheet.
  else if (r.via === 'share-blocked') toast.show('Backup pronto', { label: 'Compartilhar', run: () => shareBackup(r.file).then(report, fail) });
}

const fail = (e: unknown) => useToast.getState().show(`Falha no backup: ${e instanceof Error ? e.message : e}`);

/** The one-tap backup, with its outcome shown and remembered. */
export const runBackup = () => backupNow({ drive: useUi.getState().driveAccount }).then(report, fail);

/** How often the automatic backup checks whether one is due while the app is open. */
const AUTO_EVERY = 30 * 60 * 1000;
let autoBackupStarted = false;
let autoBackupRunning = false;

function tryAutoBackup() {
  if (autoBackupRunning || document.visibilityState === 'hidden') return;
  autoBackupRunning = true;
  autoBackup(useUi.getState().lastBackupAt, useUi.getState().driveAccount)
    .then(
      (saved) => {
        if (!saved) return;
        useUi.getState().set({ lastBackupAt: Date.now() });
        useToast.getState().show('Backup automático salvo');
      },
      (e) => {
        // The Worker lost Google's access (revoked or expired): it takes a new consent.
        if (e instanceof DriveRelink) useToast.getState().show('O backup automático no Google Drive parou. Reconecte o Drive.', { label: 'Reconectar', run: startLink });
        // Otherwise tried again next time; the reminder catches it if it keeps failing.
      },
    )
    .finally(() => (autoBackupRunning = false));
}

/**
 * The automatic backup into Google Drive or the backup folder, if set and due: on opening the app,
 * on coming back to it, and every half hour while it's open.
 */
export function runAutoBackup() {
  // Once per app start (React's strict mode runs effects twice in development).
  if (autoBackupStarted) return;
  autoBackupStarted = true;
  tryAutoBackup();
  setInterval(tryAutoBackup, AUTO_EVERY);
  document.addEventListener('visibilitychange', tryAutoBackup);
}

/**
 * Back from Google's consent page (`#/drive-conectado?…`): keeps the link and shows the shelf.
 * The fragment, with the device key, is replaced right away so it doesn't stay in the history.
 */
export async function receiveDriveLink() {
  const hash = location.hash;
  if (!hash.startsWith(LINK_ROUTE)) return;
  location.replace(`${location.pathname}${location.search}#/`);
  const result = await finishLink(hash);
  if ('error' in result) return useToast.getState().show(result.error);
  // Another account may have a folder of its own; a popup sign-in of another account is dropped.
  if (result.email !== useUi.getState().driveAccount) {
    forgetToken();
    await forgetDriveFolder();
  }
  useUi.getState().set({ driveAccount: result.email });
  useToast.getState().show('Backup automático no Google Drive ligado', { label: 'Fazer backup', run: runBackup });
}

/** Notice at the top of the shelf when the annotations haven't been backed up in a while. */
export function BackupReminder() {
  const lastBackupAt = useUi((s) => s.lastBackupAt);
  const [due, setDue] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    if (!reminderDismissed) backupDue(lastBackupAt, REMIND_AFTER).then((d) => live && setDue(d));
    else setDue(false);
    return () => {
      live = false;
    };
  }, [lastBackupAt]);

  // Google's sign-in script ready before the tap, so its window isn't blocked by the wait.
  useEffect(() => {
    if (due && useUi.getState().driveAccount && driveAvailable()) loadGoogle().catch(() => {});
  }, [due]);

  if (!due) return null;
  return (
    <div className="mx-4 mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2.5 text-sm sm:mx-6">
      <ShieldAlert className="size-5 shrink-0 text-[var(--accent-text)]" />
      <span className="min-w-0 flex-1">
        {lastBackupAt == null ? 'Você ainda não fez backup das anotações e cadernos.' : `Faz ${daysSince(lastBackupAt)} dias desde o último backup.`}
      </span>
      <button
        disabled={busy}
        className="h-8 rounded-full bg-amber-500 px-3.5 font-semibold text-stone-900 hover:bg-amber-400 disabled:opacity-60"
        onClick={async () => {
          setBusy(true);
          await runBackup();
          setBusy(false);
        }}
      >
        {busy ? 'Preparando…' : 'Fazer backup'}
      </button>
      <button
        aria-label="Lembrar depois"
        className="text-[var(--muted)]"
        onClick={() => {
          reminderDismissed = true;
          setDue(false);
        }}
      >
        ✕
      </button>
    </div>
  );
}

const item = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[var(--app-bg)]';

/** Connects Google Drive (Google's window, from a tap): backups go there from now on. */
async function connectDrive() {
  try {
    const email = await driveEmail(await getToken(null));
    // Another account may have a folder of its own.
    if (email !== useUi.getState().driveAccount) await forgetDriveFolder();
    useUi.getState().set({ driveAccount: email });
    useToast.getState().show(`Google Drive conectado: ${email}`, { label: 'Fazer backup', run: runBackup });
  } catch (e) {
    if (!(e instanceof DriveSignInCancelled)) useToast.getState().show(`Não foi possível conectar: ${e instanceof Error ? e.message : e}`);
  }
}

async function disconnectDrive() {
  await unlink();
  revokeDrive();
  await forgetDriveFolder();
  useUi.getState().set({ driveAccount: null });
  useToast.getState().show('Google Drive desconectado');
}

/** The "⋯" menu's part about keeping the data safe: storage protection, backup now, Google Drive, backup folder. */
export function BackupMenuSection({ onDone }: { onDone: () => void }) {
  const lastBackupAt = useUi((s) => s.lastBackupAt);
  const driveAccount = useUi((s) => s.driveAccount);
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [folder, setFolder] = useState<{ name: string; allowed: boolean } | null>(null);
  const [linked, setLinked] = useState(false);

  useEffect(() => {
    storageStatus().then(setStorage);
    isLinked().then(setLinked);
    if (driveAvailable()) loadGoogle().catch(() => {});
    if (canPickFolder())
      getBackupFolder().then(async (dir) => dir && setFolder({ name: dir.name, allowed: await folderAllowed(dir) }));
  }, []);

  return (
    <>
      {storage && storage.persisted !== null && (
        <div className="flex items-start gap-2.5 px-2.5 py-2">
          {storage.persisted ? <ShieldCheck className="mt-0.5 size-4 shrink-0 text-green-600" /> : <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[var(--accent-text)]" />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="mr-auto">{storage.persisted ? 'Armazenamento protegido ✓' : 'Não protegido'}</span>
              {!storage.persisted && (
                <button
                  className="rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-semibold text-stone-900 hover:bg-amber-400"
                  onClick={async () => {
                    const ok = await protectStorage();
                    setStorage(await storageStatus());
                    if (!ok) useToast.getState().show('O navegador não liberou agora. Instalar o app e usá-lo com frequência ajuda.');
                  }}
                >
                  Proteger
                </button>
              )}
            </div>
            {storage.usage != null && (
              <div className="text-xs text-[var(--muted)]">
                Usando {formatBytes(storage.usage)}
                {storage.quota ? ` de ${formatBytes(storage.quota)}` : ''}
              </div>
            )}
            {!storage.persisted && <div className="text-xs text-[var(--muted)]">Sem proteção, o navegador pode apagar os livros se faltar espaço.</div>}
          </div>
        </div>
      )}
      <button
        className={item}
        onClick={() => {
          onDone();
          runBackup();
        }}
      >
        <Download className="size-4 shrink-0" />
        <span className="min-w-0">
          Salvar backup das anotações
          <span className="block text-xs text-[var(--muted)]">
            {driveAccount && driveAvailable() ? 'No Google Drive · ' : ''}
            {lastBackupAt == null ? 'Nenhum backup ainda' : `Último: ${ago(lastBackupAt)}`}
          </span>
        </span>
      </button>
      {driveAvailable() &&
        (driveAccount ? (
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <Cloud className="size-4 shrink-0 text-green-600" />
            <span className="min-w-0 flex-1">
              Google Drive
              <span className="block truncate text-xs text-[var(--muted)]">
                {driveAccount}
                {linked && ' · backup automático'}
              </span>
            </span>
            {linkAvailable() && !linked && (
              <button className="rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-semibold text-stone-900 hover:bg-amber-400" onClick={startLink}>
                Ativar backup automático
              </button>
            )}
            <button
              className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs hover:bg-[var(--app-bg)]"
              onClick={() => {
                onDone();
                disconnectDrive();
              }}
            >
              Desconectar
            </button>
          </div>
        ) : (
          <button
            className={item}
            onClick={() => {
              onDone();
              // With the Worker, linked once for good (automatic backups); else Google's popup.
              if (linkAvailable()) startLink();
              else connectDrive();
            }}
          >
            <Cloud className="size-4 shrink-0" />
            <span className="min-w-0">
              Conectar ao Google Drive
              <span className="block text-xs text-[var(--muted)]">{linkAvailable() ? 'Backup automático numa pasta do seu Drive' : 'Backups direto numa pasta do seu Drive'}</span>
            </span>
          </button>
        ))}
      {canPickFolder() && (
        <button
          className={item}
          onClick={async () => {
            onDone();
            const name = await chooseBackupFolder().catch(fail);
            if (!name) return;
            useToast.getState().show(`Backups automáticos em “${name}”`);
            runBackup();
          }}
        >
          <FolderOpen className="size-4 shrink-0" />
          <span className="min-w-0">
            {folder ? 'Trocar pasta de backup' : 'Escolher pasta de backup automático'}
            {folder && (
              <span className="block truncate text-xs text-[var(--muted)]">
                {folder.allowed ? `Salvando todo dia em “${folder.name}”` : `“${folder.name}”: precisa de permissão (salve um backup)`}
              </span>
            )}
          </span>
        </button>
      )}
    </>
  );
}

const dateOf = (b: DriveBackup) => new Date(b.modifiedTime).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * "Restaurar backup" with Google Drive connected: one of the backups there (newest first), or a
 * file as before. Restoring adds to what's on this device; it doesn't delete anything.
 */
export function RestoreDialog({ onRestore, onFile, onClose }: { onRestore: (backup: Blob) => Promise<void>; onFile: () => void; onClose: () => void }) {
  const account = useUi((s) => s.driveAccount);
  const [backups, setBackups] = useState<DriveBackup[] | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'restoring'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Signing in may open Google's window, so it waits for a tap unless the sign-in is still good.
  const load = async () => {
    setState('loading');
    setError(null);
    try {
      setBackups(await listBackups(await getToken(account)));
    } catch (e) {
      if (!(e instanceof DriveSignInCancelled)) setError(e instanceof Error ? e.message : String(e));
    }
    setState('idle');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col rounded-2xl bg-[var(--panel)] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Restaurar backup</h2>
          <button aria-label="Fechar" className="rounded-md p-1 hover:bg-[var(--app-bg)]" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>
        <p className="mb-4 text-sm text-[var(--muted)]">O backup é juntado ao que já está neste aparelho; nada é apagado.</p>

        <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-[var(--muted)]">
          <Cloud className="size-3.5" /> Google Drive · {account}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-[var(--border)]">
          {backups === null ? (
            <button disabled={state !== 'idle'} onClick={load} className="w-full px-4 py-6 text-sm font-medium text-[var(--accent-text)] disabled:opacity-60">
              {state === 'loading' ? 'Buscando backups…' : 'Ver backups no Google Drive'}
            </button>
          ) : backups.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">Nenhum backup no Google Drive ainda.</p>
          ) : (
            backups.map((b) => (
              <button
                key={b.id}
                disabled={state !== 'idle'}
                className="flex w-full items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-2.5 text-left text-sm last:border-b-0 hover:bg-[var(--app-bg)] disabled:opacity-60"
                onClick={async () => {
                  if (!confirm(`Restaurar o backup de ${dateOf(b)}? Ele é juntado ao que já está aqui.`)) return;
                  setState('restoring');
                  try {
                    await onRestore(await downloadBackup(await getToken(account), b.id));
                    onClose();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                    setState('idle');
                  }
                }}
              >
                <span>{dateOf(b)}</span>
                <span className="text-xs text-[var(--muted)]">{formatBytes(b.size)}</span>
              </button>
            ))
          )}
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {state === 'restoring' && <p className="mt-2 text-sm text-[var(--muted)]">Restaurando…</p>}

        <button
          className="mt-4 h-10 rounded-full border border-[var(--border)] text-sm hover:bg-[var(--app-bg)]"
          onClick={() => {
            onClose();
            onFile();
          }}
        >
          Restaurar de um arquivo…
        </button>
      </div>
    </div>
  );
}
