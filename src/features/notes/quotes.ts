import { addPage, getPages, touchNotebook } from '../../db/notes';
import { db, type QuoteSource, type TextItem } from '../../db/schema';
import { newId } from '../../db/repo';
import { bboxOf, estimateTextHeight } from '../../lib/notes/geometry';
import { useSplit } from '../split/splitStore';
import { useNoteEditor } from './editor/editorStore';
import { commitItems } from './editor/items';

const FONT = 14;
const MARGIN = 48;

/**
 * Adds a quote from a book to a notebook, below what's already on the page (a new page if it
 * doesn't fit). With the notebook open next to the book it goes to the page in view and can be undone.
 */
export async function sendQuote(notebookId: string, text: string, source: QuoteSource) {
  const notebook = await db.notebooks.get(notebookId);
  if (!notebook) throw new Error('Caderno não encontrado');
  const pages = await getPages(notebookId);
  const open = useSplit.getState().notebookId === notebookId;
  const currentId = open ? useNoteEditor.getState().currentPageId : null;
  let page = pages.find((p) => p.id === currentId) ?? pages[pages.length - 1];

  const body = `“${text.trim()}”\n— ${source.title}${source.page && !source.cfi ? `, p. ${source.page}` : ''}`;
  const canvas = notebook.kind === 'canvas';
  // An open infinite canvas: put it where the user is looking, sized to the view.
  const view = open && canvas ? useNoteEditor.getState().insertTarget?.() : null;
  const w = canvas ? Math.min(480, (view?.viewWidth ?? 600) * 0.8) : page.width - 2 * MARGIN;
  const height = estimateTextHeight(body, FONT, w);

  const items = await db.noteItems.where('pageId').equals(page.id).toArray();
  const boxes = items.map(bboxOf);
  let y = boxes.length ? Math.max(...boxes.map((b) => b.y + b.h)) + 20 : MARGIN + 12;
  let x = canvas && boxes.length ? Math.min(...boxes.map((b) => b.x)) : MARGIN;
  if (view) {
    x = view.x - w / 2;
    y = view.y - height / 2;
    // Slide down past anything it would cover (e.g. the previous quote).
    for (let moved = true; moved; ) {
      moved = false;
      for (const b of boxes) {
        if (x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + height > b.y) {
          y = b.y + b.h + 16;
          moved = true;
        }
      }
    }
  }
  if (!canvas && y + height > page.height - MARGIN) {
    page = await addPage(notebookId, page.order);
    y = MARGIN + 12;
    x = MARGIN;
  }

  const z = items.reduce((m, i) => Math.max(m, i.z), 0) + 1;
  const item: TextItem = { id: newId(), notebookId, pageId: page.id, z, createdAt: Date.now(), type: 'text', x, y, w, text: body, fontSize: FONT, color: '#475569', source };
  if (open) await commitItems([item]);
  else {
    await db.noteItems.add(item);
    await touchNotebook(notebookId);
  }
  return notebook;
}
