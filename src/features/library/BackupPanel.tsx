import { Download, FolderOpen, ShieldAlert, ShieldCheck } from 'lucide-react';
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
  if (r.via === 'folder') toast.show(`Backup salvo na pasta “${r.folder}”`);
  else if (r.via === 'download') toast.show('Backup baixado');
  else if (r.via === 'share') toast.show('Backup feito');
  // Building it took long enough that the browser wants a new tap to open the share sheet.
  else if (r.via === 'share-blocked') toast.show('Backup pronto', { label: 'Compartilhar', run: () => shareBackup(r.file).then(report, fail) });
}

const fail = (e: unknown) => useToast.getState().show(`Falha no backup: ${e instanceof Error ? e.message : e}`);

/** The one-tap backup, with its outcome shown and remembered. */
export const runBackup = () => backupNow().then(report, fail);

let autoBackupStarted = false;

/** On opening the app: the automatic backup into the backup folder, if one is set and due. */
export function runAutoBackup() {
  // Once per app start (React's strict mode runs effects twice in development).
  if (autoBackupStarted) return;
  autoBackupStarted = true;
  autoBackup(useUi.getState().lastBackupAt).then(
    (saved) => {
      if (!saved) return;
      useUi.getState().set({ lastBackupAt: Date.now() });
      useToast.getState().show('Backup automático salvo');
    },
    () => {}, // Tried again next time; the reminder catches it if it keeps failing.
  );
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

/** The "⋯" menu's part about keeping the data safe: storage protection, backup now, backup folder. */
export function BackupMenuSection({ onDone }: { onDone: () => void }) {
  const lastBackupAt = useUi((s) => s.lastBackupAt);
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [folder, setFolder] = useState<{ name: string; allowed: boolean } | null>(null);

  useEffect(() => {
    storageStatus().then(setStorage);
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
          <span className="block text-xs text-[var(--muted)]">{lastBackupAt == null ? 'Nenhum backup ainda' : `Último: ${ago(lastBackupAt)}`}</span>
        </span>
      </button>
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
