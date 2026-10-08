import { Copy, StickyNote, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { db, type Highlight } from '../../db/schema';
import { newId, putNote } from '../../db/repo';
import { clientRectsToPdf } from '../../lib/coords';
import { useHistory } from '../../store/history';
import { HIGHLIGHT_COLORS, useUi } from '../../store/ui';
import { useReader } from './readerStore';

type MenuState =
  | { kind: 'selection'; x: number; y: number; range: Range }
  | { kind: 'highlight'; x: number; y: number; highlight: Highlight };

/** Floating menu for a text selection (create highlight) or a clicked highlight (edit it). */
export default function SelectionMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const pointerDown = useRef(false);
  const downAt = useRef<[number, number]>([0, 0]);

  useEffect(() => {
    let timer = 0;
    const fromSelection = () => {
      if (useUi.getState().tool !== 'select') return;
      const sel = getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return setMenu((m) => (m?.kind === 'selection' ? null : m));
      const range = sel.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const el = container instanceof Element ? container : container.parentElement;
      // Only selections inside the pages (possibly spanning several), not e.g. the notes panel.
      if (!el?.closest('[data-reader-pages]')) return;
      const rects = [...range.getClientRects()].filter((r) => r.width > 0);
      const last = rects.at(-1);
      if (!last) return;
      setMenu({ kind: 'selection', x: last.left + last.width / 2, y: last.bottom, range: range.cloneRange() });
    };

    const onSelectionChange = () => {
      clearTimeout(timer);
      if (!pointerDown.current) timer = window.setTimeout(fromSelection, 200);
    };
    const onDown = (e: PointerEvent) => {
      if ((e.target as Element).closest('[data-selection-menu]')) return;
      pointerDown.current = true;
      downAt.current = [e.clientX, e.clientY];
      setMenu(null);
    };
    const onUp = (e: PointerEvent) => {
      if (!pointerDown.current) return;
      pointerDown.current = false;
      if (useUi.getState().tool !== 'select') return;
      const moved = Math.hypot(e.clientX - downAt.current[0], e.clientY - downAt.current[1]) > 4;
      const sel = getSelection();
      if (!moved && (!sel || sel.isCollapsed)) {
        const hit = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n instanceof HTMLElement && n.dataset.highlightId);
        const id = (hit as HTMLElement | undefined)?.dataset.highlightId;
        if (id)
          db.highlights.get(id).then((highlight) => highlight && setMenu({ kind: 'highlight', x: e.clientX, y: e.clientY + 8, highlight }));
        return;
      }
      timer = window.setTimeout(fromSelection, 10);
    };

    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('pointerup', onUp);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointerup', onUp);
    };
  }, []);

  if (!menu) return null;

  const close = () => {
    setMenu(null);
    getSelection()?.removeAllRanges();
  };

  const openNote = (noteId: string) => {
    useReader.setState({ sidebarTab: 'notes', focusNoteId: noteId });
    useUi.getState().set({ sidebarOpen: true });
  };

  async function highlightSelection(color: string, withNote = false) {
    if (menu?.kind !== 'selection') return;
    const created = rangeToHighlights(menu.range, color);
    if (!created.length) return close();
    await useHistory.getState().commit({ added: { highlights: created }, removed: {} });
    if (withNote) {
      const h = created[0];
      const note = { id: newId(), bookId: h.bookId, page: h.page, highlightId: h.id, body: '', createdAt: Date.now(), updatedAt: Date.now() };
      await putNote(note);
      openNote(note.id);
    }
    close();
  }

  async function recolor(color: string) {
    if (menu?.kind !== 'highlight') return;
    const old = menu.highlight;
    await useHistory.getState().commit({ added: { highlights: [{ ...old, color }] }, removed: { highlights: [old] } });
    close();
  }

  async function noteForHighlight() {
    if (menu?.kind !== 'highlight') return;
    const h = menu.highlight;
    const existing = await db.notes.where('highlightId').equals(h.id).first();
    const note = existing ?? { id: newId(), bookId: h.bookId, page: h.page, highlightId: h.id, body: '', createdAt: Date.now(), updatedAt: Date.now() };
    if (!existing) await putNote(note);
    openNote(note.id);
    close();
  }

  const left = Math.min(Math.max(8, menu.x - 130), window.innerWidth - 268);
  const top = Math.min(menu.y + 8, window.innerHeight - 56);
  const current = menu.kind === 'highlight' ? menu.highlight.color : null;

  return (
    <div
      data-selection-menu
      className="fixed z-50 flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-1.5 shadow-xl"
      style={{ left, top }}
      onPointerDown={(e) => e.preventDefault()}
    >
      {HIGHLIGHT_COLORS.map((c) => (
        <button
          key={c}
          title="Destacar"
          onClick={() => (menu.kind === 'selection' ? highlightSelection(c) : recolor(c))}
          className={`size-7 rounded-full border-2 ${current === c ? 'border-amber-600' : 'border-transparent'}`}
        >
          <span className="block size-full rounded-full ring-1 ring-black/10" style={{ background: c }} />
        </button>
      ))}
      <div className="mx-1 h-6 w-px bg-[var(--border)]" />
      <button
        title="Adicionar nota"
        className="rounded-md p-1.5 hover:bg-[var(--app-bg)]"
        onClick={() => (menu.kind === 'selection' ? highlightSelection(HIGHLIGHT_COLORS[0], true) : noteForHighlight())}
      >
        <StickyNote className="size-5" />
      </button>
      {menu.kind === 'selection' ? (
        <button
          title="Copiar"
          className="rounded-md p-1.5 hover:bg-[var(--app-bg)]"
          onClick={() => {
            navigator.clipboard?.writeText(menu.range.toString());
            close();
          }}
        >
          <Copy className="size-5" />
        </button>
      ) : (
        <button
          title="Remover destaque"
          className="rounded-md p-1.5 text-red-600 hover:bg-[var(--app-bg)]"
          onClick={async () => {
            await useHistory.getState().commit({ added: {}, removed: { highlights: [menu.highlight] } });
            close();
          }}
        >
          <Trash2 className="size-5" />
        </button>
      )}
    </div>
  );
}

/** Splits a DOM selection into one highlight per page it touches. */
function rangeToHighlights(range: Range, color: string): Highlight[] {
  const { bookId } = useReader.getState();
  const out: Highlight[] = [];
  for (const pageEl of document.querySelectorAll<HTMLElement>('[data-page]')) {
    const textLayer = pageEl.querySelector('.textLayer');
    if (!textLayer || !range.intersectsNode(textLayer)) continue;
    // Clamp to the text layer so canvases and other page chrome never count as selected.
    const sub = range.cloneRange();
    if (!textLayer.contains(range.startContainer)) sub.setStart(textLayer, 0);
    if (!textLayer.contains(range.endContainer)) sub.setEnd(textLayer, textLayer.childNodes.length);
    const scale = Number(pageEl.dataset.scale);
    const rects = clientRectsToPdf(sub.getClientRects(), pageEl.getBoundingClientRect(), scale);
    const text = sub.toString().replace(/\s+/g, ' ').trim();
    if (!rects.length || !text) continue;
    out.push({ id: newId(), bookId, page: Number(pageEl.dataset.page), color, rects, text, createdAt: Date.now() });
  }
  return out;
}
