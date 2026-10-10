import { LayoutGrid, Square, X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { createNotebook } from '../../db/notes';
import { db, type Folder, type NotebookKind, type PaperStyle } from '../../db/schema';
import { PAPER_COLORS, paperCss } from '../../lib/notes/render';
import { CoverEditor, coverDraft, saveCover } from './NotebookCover';

const PAPERS: { id: PaperStyle; label: string }[] = [
  { id: 'lined', label: 'Pautado' },
  { id: 'grid', label: 'Quadriculado' },
  { id: 'dotted', label: 'Pontilhado' },
  { id: 'blank', label: 'Liso' },
];

interface Props {
  folders: Folder[];
  folderId: string | null;
  onCreated: (id: string) => void;
  onClose: () => void;
}

export default function NewNotebookDialog({ folders, folderId, onCreated, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<NotebookKind>('paged');
  const [style, setStyle] = useState<PaperStyle>('lined');
  const [paperColor, setPaperColor] = useState(PAPER_COLORS[0]);
  const [cover, setCover] = useState(() => coverDraft());
  const [folder, setFolder] = useState<string | null>(folderId);
  const templates = useLiveQuery(() => db.pageTemplates.orderBy('createdAt').toArray(), []) ?? [];
  const [templateId, setTemplateId] = useState<string | null>(null);

  async function create() {
    const nb = await createNotebook({
      title: title.trim() || (kind === 'canvas' ? 'Quadro sem título' : 'Caderno sem título'),
      kind,
      paper: { style, color: paperColor },
      coverColor: cover.color,
      folderId: folder,
      template: templates.find((t) => t.id === templateId),
    });
    await saveCover(nb.id, cover);
    onCreated(nb.id);
  }

  const option = (active: boolean) => `rounded-lg border px-3 py-2 text-sm ${active ? 'border-amber-500 bg-amber-500/10' : 'border-[var(--border)]'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-[var(--panel)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Novo caderno</h2>
          <button type="button" className="rounded-md p-1 hover:bg-[var(--app-bg)]" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nome (ex.: Cálculo I — aula 3)"
          className="mb-4 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 outline-none focus:border-amber-500"
        />

        <div className="mb-1.5 text-xs font-medium text-[var(--muted)]">Tipo</div>
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button type="button" className={option(kind === 'paged')} onClick={() => setKind('paged')}>
            <Square className="mx-auto mb-1 size-5" /> Páginas (A4)
          </button>
          <button type="button" className={option(kind === 'canvas')} onClick={() => setKind('canvas')}>
            <LayoutGrid className="mx-auto mb-1 size-5" /> Tela infinita
          </button>
        </div>

        <div className="mb-1.5 text-xs font-medium text-[var(--muted)]">Papel</div>
        <div className="mb-2 grid grid-cols-4 gap-2">
          {PAPERS.map((p) => (
            <button key={p.id} type="button" onClick={() => setStyle(p.id)} className={`overflow-hidden rounded-lg border-2 ${style === p.id ? 'border-amber-500' : 'border-[var(--border)]'}`}>
              <div className="h-12" style={paperCss({ style: p.id, color: paperColor }, 0.5)} />
              <div className="py-1 text-[11px]">{p.label}</div>
            </button>
          ))}
        </div>
        <div className="mb-4 flex gap-2">
          {PAPER_COLORS.map((c) => (
            <button key={c} type="button" title={c} onClick={() => setPaperColor(c)} className={`size-7 rounded-md border-2 ${paperColor === c ? 'border-amber-500' : 'border-[var(--border)]'}`} style={{ background: c }} />
          ))}
        </div>

        {kind === 'paged' && templates.length > 0 && (
          <>
            <div className="mb-1.5 text-xs font-medium text-[var(--muted)]">Modelo da folha</div>
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setTemplateId(null)}
                className={`flex h-16 w-12 shrink-0 items-center justify-center rounded-md border-2 text-[10px] text-[var(--muted)] ${templateId === null ? 'border-amber-500' : 'border-[var(--border)]'}`}
              >
                Nenhum
              </button>
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  title={t.name}
                  onClick={() => setTemplateId(t.id)}
                  className={`h-16 w-12 shrink-0 overflow-hidden rounded-md border-2 ${templateId === t.id ? 'border-amber-500' : 'border-[var(--border)]'}`}
                >
                  <img src={t.thumb} alt={t.name} className="size-full object-cover object-top" />
                </button>
              ))}
            </div>
          </>
        )}

        <div className="mb-1.5 text-xs font-medium text-[var(--muted)]">Capa</div>
        <div className="mb-4">
          <CoverEditor draft={cover} onChange={setCover} title={title.trim()} />
        </div>

        {folders.length > 0 && (
          <>
            <div className="mb-1.5 text-xs font-medium text-[var(--muted)]">Pasta</div>
            <select
              value={folder ?? ''}
              onChange={(e) => setFolder(e.target.value || null)}
              className="mb-4 w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm"
            >
              <option value="">Sem pasta</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </>
        )}

        <button type="submit" className="w-full rounded-lg bg-amber-500 py-2.5 font-medium text-stone-900 hover:bg-amber-400">
          Criar
        </button>
      </form>
    </div>
  );
}
