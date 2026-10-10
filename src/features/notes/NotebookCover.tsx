import { useLiveQuery } from 'dexie-react-hooks';
import { ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { COVER_COLORS, updateNotebook } from '../../db/notes';
import { newId } from '../../db/repo';
import { db, type CoverPattern, type Notebook, type NotebookCover } from '../../db/schema';
import { COVER_PATTERNS, coverBackground, panCover } from '../../lib/notes/covers';
import { prepareImage } from '../../lib/notes/images';
import ColorPicker from '../ColorPicker';

/** A cover being chosen, before it's saved. */
export interface CoverDraft {
  color: string;
  pattern: CoverPattern;
  label: boolean;
  show: 'cover' | 'page';
  /** The picture: one already saved, a new one picked (already downscaled), or none. */
  image: { assetId: string } | { blob: Blob; width: number; height: number } | null;
  /** Which part of the picture shows, in percent (see `NotebookCover.imagePos`). */
  imagePos: [number, number];
}

const CENTER: [number, number] = [50, 50];

/** The cover a new notebook starts with, or a notebook's own (opening "Capa…" means showing it). */
export function coverDraft(notebook?: Notebook): CoverDraft {
  const cover = notebook?.cover;
  return {
    color: notebook?.coverColor ?? COVER_COLORS[0],
    pattern: cover?.pattern ?? 'plain',
    label: cover?.label ?? true,
    show: cover?.show ?? 'cover',
    image: cover?.imageId ? { assetId: cover.imageId } : null,
    imagePos: cover?.imagePos ?? CENTER,
  };
}

/** Saves a cover: stores a newly picked picture with the notebook's others and drops the one it replaces. */
export async function saveCover(notebookId: string, draft: CoverDraft, previous?: NotebookCover) {
  let imageId: string | undefined;
  if (draft.image && 'assetId' in draft.image) imageId = draft.image.assetId;
  else if (draft.image) {
    imageId = newId();
    await db.noteAssets.add({ id: imageId, notebookId, blob: draft.image.blob, width: draft.image.width, height: draft.image.height });
  }
  if (previous?.imageId && previous.imageId !== imageId) await db.noteAssets.delete(previous.imageId);
  const moved = imageId && (draft.imagePos[0] !== 50 || draft.imagePos[1] !== 50);
  const cover: NotebookCover = {
    pattern: draft.pattern,
    show: draft.show,
    ...(imageId && { imageId }),
    ...(moved && { imagePos: draft.imagePos }),
    ...(!draft.label && { label: false }),
  };
  await updateNotebook(notebookId, { coverColor: draft.color, cover });
}

/** An object URL for a picture (saved, by id, or a blob), revoked when it changes. */
function useImageUrl(image: CoverDraft['image'] | undefined) {
  const assetId = image && 'assetId' in image ? image.assetId : null;
  const asset = useLiveQuery(() => (assetId ? db.noteAssets.get(assetId) : undefined), [assetId]);
  const blob = image && 'blob' in image ? image.blob : asset?.blob;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return setUrl(null);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

interface ArtProps {
  color: string;
  pattern: CoverPattern;
  title?: string;
  label?: boolean;
  image?: CoverDraft['image'];
  imagePos?: [number, number];
  className?: string;
}

/**
 * A notebook's cover: its color and pattern (or picture), a bound spine on the left and the
 * title on a label. Sizes follow its width, so it reads the same as a card or a small icon.
 */
export function CoverArt({ color, pattern, title, label = true, image, imagePos = CENTER, className = '' }: ArtProps) {
  const url = useImageUrl(image);
  return (
    <div className={`@container relative overflow-hidden ${className}`} style={{ background: coverBackground(pattern, color) }}>
      {url && <img src={url} alt="" draggable={false} className="absolute inset-0 size-full object-cover" style={{ objectPosition: `${imagePos[0]}% ${imagePos[1]}%` }} />}
      {pattern === 'leather' && !url && <div className="absolute inset-y-[5%] right-[5%] left-[14%] rounded-[3px] border border-dashed border-white/45" />}
      <div className="absolute inset-y-0 left-0 w-[9%] bg-black/20 shadow-[inset_-3px_0_4px_rgba(0,0,0,0.2)]" />
      {label && title && (
        <div className="absolute top-[15%] right-[12%] left-[20%] line-clamp-4 rounded-[3px] bg-[#fdfcf8] px-[5cqw] py-[4cqw] text-center font-serif text-[9cqw] leading-tight font-semibold break-words text-stone-800 shadow-md">
          {title}
        </div>
      )}
    </div>
  );
}

/** A notebook's cover as saved. */
export function NotebookCoverArt({ notebook, label, className }: { notebook: Notebook; label?: boolean; className?: string }) {
  const draft = coverDraft(notebook);
  return (
    <CoverArt color={draft.color} pattern={draft.pattern} title={notebook.title} label={label ?? draft.label} image={draft.image} imagePos={draft.imagePos} className={className} />
  );
}

/** Whether a notebook's card shows its cover (else its first page, as before covers existed). */
export const showsCover = (notebook: Notebook) => notebook.cover?.show === 'cover';

const heading = 'mb-1.5 text-xs font-medium text-[var(--muted)]';

/** Choosing a cover: preview, pattern, color (any), picture, title label, and what the card shows. */
export function CoverEditor({ draft, onChange, title }: { draft: CoverDraft; onChange: (d: CoverDraft) => void; title: string }) {
  const set = (patch: Partial<CoverDraft>) => onChange({ ...draft, ...patch });
  const [mixing, setMixing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; y: number; pos: [number, number] } | null>(null);
  const custom = !COVER_COLORS.includes(draft.color);

  return (
    <div>
      <div className="flex gap-4">
        <div className="w-24 shrink-0">
          <div
            // With a picture, dragging the preview picks which part of it shows.
            className={draft.image ? 'cursor-grab touch-none active:cursor-grabbing' : ''}
            onPointerDown={(e) => {
              if (!draft.image) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { x: e.clientX, y: e.clientY, pos: draft.imagePos };
            }}
            onPointerMove={(e) => {
              const start = drag.current;
              const img = e.currentTarget.querySelector('img');
              if (!start || !img?.naturalWidth) return;
              const box = e.currentTarget.getBoundingClientRect();
              set({ imagePos: panCover(start.pos, [e.clientX - start.x, e.clientY - start.y], img.naturalWidth / img.naturalHeight, [box.width, box.height]) });
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          >
            <CoverArt {...draft} title={title || 'Caderno'} className="aspect-[3/4] w-full rounded-l-sm rounded-r-md shadow-md ring-1 ring-black/10" />
          </div>
          {draft.image && <div className="mt-1 text-center text-[11px] leading-tight text-[var(--muted)]">Arraste para ajustar</div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className={heading}>Padrão</div>
          <div className="grid grid-cols-4 gap-1.5">
            {COVER_PATTERNS.map((p) => (
              <button
                key={p.id}
                type="button"
                title={p.label}
                aria-label={p.label}
                aria-pressed={draft.pattern === p.id}
                onClick={() => set({ pattern: p.id })}
                className={`h-9 rounded-md border-2 ${draft.pattern === p.id ? 'border-amber-500' : 'border-transparent ring-1 ring-[var(--border)]'}`}
                style={{ background: coverBackground(p.id, draft.color) }}
              />
            ))}
          </div>
          <div className="mt-1 text-[11px] text-[var(--muted)]">{COVER_PATTERNS.find((p) => p.id === draft.pattern)?.label}</div>
        </div>
      </div>

      <div className={`${heading} mt-3`}>Cor</div>
      <div className="flex flex-wrap gap-1.5">
        {COVER_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            aria-label={`Cor ${c}`}
            onClick={() => set({ color: c })}
            className={`size-7 rounded-full border-2 ${draft.color === c ? 'border-amber-500' : 'border-transparent'}`}
            style={{ background: c }}
          />
        ))}
        <button
          type="button"
          title="Outra cor"
          aria-label="Outra cor"
          aria-expanded={mixing}
          onClick={() => setMixing((m) => !m)}
          className={`flex size-7 items-center justify-center rounded-full border-2 ${custom || mixing ? 'border-amber-500' : 'border-transparent'}`}
          style={{ background: custom ? draft.color : 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}
        >
          <Plus className="size-3.5 text-white drop-shadow" />
        </button>
      </div>
      {mixing && (
        <div className="mt-2 rounded-lg border border-[var(--border)] p-2">
          <ColorPicker value={draft.color} onChange={(color) => set({ color })} onCommit={() => {}} />
        </div>
      )}

      <div className={`${heading} mt-3`}>Imagem</div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex h-8 items-center gap-1.5 rounded-full border border-[var(--border)] px-3 text-sm hover:bg-[var(--app-bg)]"
        >
          <ImagePlus className="size-4" /> {draft.image ? 'Trocar imagem' : 'Usar uma imagem'}
        </button>
        {draft.image && (
          <button type="button" onClick={() => set({ image: null, imagePos: CENTER })} className="flex h-8 items-center gap-1.5 rounded-full px-3 text-sm text-red-600 hover:bg-[var(--app-bg)]">
            <Trash2 className="size-4" /> Remover
          </button>
        )}
        {error && <span className="text-xs text-red-600">{error}</span>}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setError(null);
            // A cover is shown small: no need to keep the photo at full size.
            const image = await prepareImage(file, 1200).catch(() => null);
            if (image) set({ image, imagePos: CENTER });
            else setError('Não foi possível abrir essa imagem.');
          }}
        />
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={draft.label} onChange={(e) => set({ label: e.target.checked })} className="accent-amber-500" />
        Título na capa
      </label>

      <div className={`${heading} mt-3`}>Na lista de cadernos, mostrar</div>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ['cover', 'A capa'],
            ['page', 'A primeira página'],
          ] as const
        ).map(([id, text]) => (
          <button
            key={id}
            type="button"
            onClick={() => set({ show: id })}
            className={`rounded-lg border px-3 py-1.5 text-sm ${draft.show === id ? 'border-amber-500 bg-amber-500/10' : 'border-[var(--border)]'}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** "Capa…" on a notebook's menu: changes its cover. */
export function CoverDialog({ notebook, onClose }: { notebook: Notebook; onClose: () => void }) {
  const [draft, setDraft] = useState(() => coverDraft(notebook));
  const [saving, setSaving] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-[var(--panel)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          await saveCover(notebook.id, draft, notebook.cover);
          onClose();
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Capa do caderno</h2>
          <button type="button" aria-label="Fechar" className="rounded-md p-1 hover:bg-[var(--app-bg)]" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>
        <CoverEditor draft={draft} onChange={setDraft} title={notebook.title} />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-full px-4 text-sm hover:bg-[var(--app-bg)]">
            Cancelar
          </button>
          <button disabled={saving} className="h-10 rounded-full bg-amber-500 px-5 text-sm font-semibold text-stone-900 hover:bg-amber-400 disabled:opacity-60">
            Salvar
          </button>
        </div>
      </form>
    </div>
  );
}
