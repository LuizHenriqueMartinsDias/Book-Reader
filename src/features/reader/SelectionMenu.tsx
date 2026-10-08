import { useEffect, useRef, useState } from 'react';
import { db, type Highlight } from '../../db/schema';
import { newId } from '../../db/repo';
import { clientRectsToPdf } from '../../lib/coords';
import { useUi } from '../../store/ui';
import AnnotationMenu, { type MenuTarget } from './AnnotationMenu';
import { useReader } from './readerStore';

type MenuState =
  | { kind: 'selection'; x: number; y: number; range: Range }
  | { kind: 'highlight'; x: number; y: number; highlight: Highlight };

/** Tracks text selections and highlight clicks on PDF pages and shows the annotation menu. */
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

  const target: MenuTarget =
    menu.kind === 'selection'
      ? { kind: 'selection', text: menu.range.toString(), createHighlights: (color) => rangeToHighlights(menu.range, color) }
      : { kind: 'highlight', highlight: menu.highlight };

  return <AnnotationMenu x={menu.x} y={menu.y} target={target} onClose={close} />;
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
