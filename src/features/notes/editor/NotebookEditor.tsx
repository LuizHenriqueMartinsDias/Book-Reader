import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import { navigate } from '../../../App';
import { getPages } from '../../../db/notes';
import { db, type ImageItem, type Notebook, type NoteItem } from '../../../db/schema';
import { getBookFile, newId } from '../../../db/repo';
import { download } from '../../../lib/backup';
import { prepareImage } from '../../../lib/notes/images';
import { renderThumbnail } from '../../../lib/notes/thumbnail';
import { CSS_UNITS, openPdf, type PDFDocumentProxy } from '../../../lib/pdf';
import { useNoteHistory } from '../../../store/history';
import FullscreenChrome from '../../reader/FullscreenChrome';
import { useFullscreen } from '../../reader/useFullscreen';
import type { ZoomChange, ZoomMode } from '../../reader/views/types';
import { useSplit } from '../../split/splitStore';
import BookPicker from './BookPicker';
import { useNoteEditor, type NoteTool } from './editorStore';
import InfiniteCanvas from './InfiniteCanvas';
import { cloneItems, commitItems } from './items';
import NoteToolbar from './NoteToolbar';
import PagedNotebook from './PagedNotebook';

const TOOL_KEYS: Record<string, NoteTool> = { p: 'pen', h: 'marker', e: 'eraser', l: 'lasso', t: 'text', s: 'shape' };

interface Props {
  notebookId: string;
  /** Side by side with a book: shows a close button instead of "back". */
  onClose?: () => void;
}

export default function NotebookEditor({ notebookId, onClose }: Props) {
  const notebook = useLiveQuery(() => db.notebooks.get(notebookId), [notebookId], null);
  const pages = useLiveQuery(() => getPages(notebookId), [notebookId]);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);

  // Imported PDFs are drawn under the pages.
  useEffect(() => {
    if (!notebook?.hasPdf) return;
    let doc: PDFDocumentProxy | null = null;
    let cancelled = false;
    getBookFile(notebookId)
      .then((file) => (file ? openPdf(file) : null))
      .then((d) => {
        if (cancelled) d?.destroy();
        else setPdf((doc = d));
      });
    return () => {
      cancelled = true;
      doc?.destroy();
    };
  }, [notebookId, notebook?.hasPdf]);

  if (notebook === null || !pages) return <div className="p-8 text-[var(--muted)]">Abrindo caderno…</div>;
  if (!notebook)
    return (
      <div className="p-8">
        <p className="mb-4">Caderno não encontrado.</p>
        <a href="#/cadernos" className="text-amber-600 underline">
          Voltar aos cadernos
        </a>
      </div>
    );
  return <Editor notebook={notebook} pages={pages} pdf={pdf} onClose={onClose} />;
}

function Editor({ notebook, pages, pdf, onClose }: { notebook: Notebook; pages: Awaited<ReturnType<typeof getPages>>; pdf: PDFDocumentProxy | null; onClose?: () => void }) {
  const [zoom, setZoom] = useState<ZoomMode>(null);
  const [scale, setScale] = useState(CSS_UNITS);
  const [pickingBook, setPickingBook] = useState(false);
  const canvasZoom = useRef<((z: ZoomChange) => void) | null>(null);
  const fullscreen = useFullscreen();
  const notebookRef = useRef(notebook);
  notebookRef.current = notebook;

  useState(() => {
    useNoteHistory.getState().reset();
    useNoteEditor.getState().set({ selection: null, editingTextId: null });
  });

  useEffect(() => {
    db.notebooks.update(notebook.id, { lastOpenedAt: Date.now() });
    document.title = `${notebook.title} · Cadernos`;
    return () => {
      document.title = 'Book Reader';
    };
  }, [notebook.id, notebook.title]);

  // Refresh the cover when leaving.
  useEffect(
    () => () => {
      const nb = notebookRef.current;
      getPages(nb.id).then(async ([first]) => {
        if (!first) return;
        const items = await db.noteItems.where('pageId').equals(first.id).toArray();
        db.notebooks.update(nb.id, { thumb: await renderThumbnail(nb, first, items) });
      });
    },
    [],
  );

  const changeZoom = useCallback(
    (next: ZoomChange) => {
      if (notebook.kind === 'canvas') return canvasZoom.current?.(next);
      const value = typeof next === 'function' ? next(scale / CSS_UNITS) : next;
      setZoom(value === null ? null : Math.min(4, Math.max(0.3, Math.round(value * 100) / 100)));
    },
    [notebook.kind, scale],
  );

  const insertImage = useCallback(
    async (file: Blob) => {
      const target = useNoteEditor.getState().insertTarget?.();
      if (!target) return;
      const { blob, width, height } = await prepareImage(file);
      const page = pages.find((p) => p.id === target.pageId);
      const maxW = notebook.kind === 'canvas' ? 400 : (page?.width ?? 595) * 0.7;
      const w = Math.min(maxW, width * 0.75);
      const h = (w * height) / width;
      const assetId = newId();
      await db.noteAssets.add({ id: assetId, notebookId: notebook.id, blob, width, height });
      const z = (await db.noteItems.where('pageId').equals(target.pageId).toArray()).reduce((m, i) => Math.max(m, i.z), 0) + 1;
      const item: ImageItem = { id: newId(), notebookId: notebook.id, pageId: target.pageId, z, createdAt: Date.now(), type: 'image', x: target.x - w / 2, y: target.y - h / 2, w, h, assetId };
      await commitItems([item]);
      useNoteEditor.getState().set({ tool: 'lasso' });
      useNoteEditor.getState().set({ selection: { pageId: target.pageId, ids: [item.id] } });
    },
    [notebook.id, notebook.kind, pages],
  );

  const paste = useCallback(async () => {
    const { clipboard, insertTarget } = useNoteEditor.getState();
    const target = insertTarget?.();
    if (!clipboard?.length || !target) return;
    const copies = (await cloneItems(clipboard, target.pageId, 24)).map((i) => ({ ...i, notebookId: notebook.id }));
    for (const i of copies) if (i.type === 'image') i.assetId = await assetFor(i.assetId, notebook.id);
    await commitItems(copies);
    useNoteEditor.getState().set({ tool: 'lasso' });
    useNoteEditor.getState().set({ selection: { pageId: target.pageId, ids: copies.map((i) => i.id) } });
  }, [notebook.id]);

  const exportPdf = useCallback(async () => {
    const { exportNotebookPdf } = await import('../../../lib/notes/export');
    try {
      const bytes = await exportNotebookPdf(notebook.id);
      download(new Blob([bytes], { type: 'application/pdf' }), `${notebook.title}.pdf`);
    } catch (e) {
      alert(`Não foi possível exportar: ${e instanceof Error ? e.message : e}`);
    }
  }, [notebook.id, notebook.title]);

  // Keyboard shortcuts (skipped while typing, and when the book pane is the active one).
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
      if (useSplit.getState().active === 'reader') return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const editor = useNoteEditor.getState();
      const selected = editor.selection ? (await db.noteItems.bulkGet(editor.selection.ids)).filter((i): i is NoteItem => !!i) : [];
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) useNoteHistory.getState().redo();
        else useNoteHistory.getState().undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        useNoteHistory.getState().redo();
      } else if (mod && key === 'c' && selected.length) {
        editor.set({ clipboard: selected });
      } else if (mod && key === 'd' && selected.length) {
        e.preventDefault();
        const copies = await cloneItems(selected, editor.selection!.pageId, 20);
        await commitItems(copies);
        editor.set({ selection: { pageId: editor.selection!.pageId, ids: copies.map((i) => i.id) } });
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected.length) {
        e.preventDefault();
        editor.set({ selection: null });
        commitItems([], selected);
      } else if (e.key === 'Escape') {
        editor.set({ selection: null });
      } else if (mod && (key === '=' || key === '+')) {
        e.preventDefault();
        changeZoom((z) => z * 1.2);
      } else if (mod && key === '-') {
        e.preventDefault();
        changeZoom((z) => z / 1.2);
      } else if (mod && key === '0') {
        e.preventDefault();
        changeZoom(null);
      } else if (!mod && !e.altKey && TOOL_KEYS[key]) {
        editor.set({ tool: TOOL_KEYS[key] });
      }
    };
    // Pasting: images from the system clipboard, otherwise items copied in the app.
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, textarea')) return;
      if (useSplit.getState().active === 'reader') return;
      const image = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      e.preventDefault();
      if (image) insertImage(image);
      else paste();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
    };
  }, [changeZoom, insertImage, paste]);

  const registerZoom = useCallback((fn: (z: ZoomChange) => void) => {
    canvasZoom.current = fn;
  }, []);

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const image = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
        if (!image) return;
        e.preventDefault();
        insertImage(image);
      }}
    >
      <FullscreenChrome
        fullscreen={fullscreen.active}
        onExit={fullscreen.toggle}
        toolbar={
          <NoteToolbar
            notebook={notebook}
            zoomPercent={Math.round((scale / CSS_UNITS) * 100)}
            onZoom={changeZoom}
            onInsertImage={insertImage}
            onPaste={paste}
            onExport={exportPdf}
            onOpenBook={() => setPickingBook(true)}
            fullscreen={fullscreen}
            onClose={onClose}
          />
        }
      />
      {notebook.kind === 'canvas' ? (
        <InfiniteCanvas notebook={notebook} page={pages[0]} registerZoom={registerZoom} onScale={setScale} />
      ) : (
        <PagedNotebook notebook={notebook} pages={pages} pdf={pdf} zoom={zoom} onZoom={changeZoom} onScale={setScale} />
      )}
      {pickingBook && (
        <BookPicker
          onClose={() => setPickingBook(false)}
          onPick={(bookId) => navigate(`#/read/${bookId}?caderno=${notebook.id}`)}
        />
      )}
    </div>
  );
}

/** Images pasted into another notebook get their own copy of the picture (deleting one notebook mustn't break the other). */
async function assetFor(assetId: string, notebookId: string) {
  const asset = await db.noteAssets.get(assetId);
  if (!asset || asset.notebookId === notebookId) return assetId;
  const id = newId();
  await db.noteAssets.add({ ...asset, id, notebookId });
  return id;
}
