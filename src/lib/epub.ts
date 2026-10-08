import ePub, { EpubCFI, type Book as EpubBook } from 'epubjs';
import type { BookFormat } from '../db/schema';

export type { EpubBook };

/** PDFs start with "%PDF"; EPUBs are zip files ("PK") declaring the epub mimetype. */
export function sniffFormat(data: ArrayBuffer, name = ''): BookFormat | null {
  const head = new Uint8Array(data.slice(0, 64));
  const ascii = String.fromCharCode(...head);
  if (ascii.includes('%PDF')) return 'pdf';
  if (ascii.startsWith('PK') && (ascii.includes('application/epub+zip') || name.toLowerCase().endsWith('.epub'))) return 'epub';
  return null;
}

export function openEpub(data: ArrayBuffer) {
  const book = ePub(data.slice(0));
  return book;
}

export interface EpubInfo {
  title: string;
  author?: string;
  coverThumb?: string;
}

export async function readEpubInfo(book: EpubBook, fallbackTitle: string, width = 240): Promise<EpubInfo> {
  await book.ready;
  const meta = await book.loaded.metadata;
  const title = meta.title?.trim() || fallbackTitle.replace(/\.epub$/i, '');
  const author = meta.creator?.trim() || undefined;
  let coverThumb: string | undefined;
  try {
    const url = await book.coverUrl();
    if (url) coverThumb = await thumbnail(url, width);
  } catch {
    // no usable cover
  }
  return { title, author, coverThumb };
}

async function thumbnail(url: string, width: number) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round((img.naturalHeight / img.naturalWidth) * width);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', 0.8);
}

export interface TocItem {
  label: string;
  href: string;
  subitems: TocItem[];
}

export async function loadToc(book: EpubBook): Promise<TocItem[]> {
  const nav = await book.loaded.navigation;
  const map = (items: { label: string; href: string; subitems?: unknown[] }[]): TocItem[] =>
    items.map((i) => ({ label: i.label.trim(), href: i.href, subitems: map((i.subitems ?? []) as typeof items) }));
  return map(nav.toc as unknown as { label: string; href: string; subitems?: unknown[] }[]);
}

type NavItem = { label: string; href: string; subitems?: NavItem[] };

export function flatToc(book: EpubBook): { label: string; href: string }[] {
  const flat: { label: string; href: string }[] = [];
  const walk = (items: NavItem[]) =>
    items.forEach((i) => {
      flat.push({ label: i.label.trim(), href: i.href });
      walk(i.subitems ?? []);
    });
  walk((book.navigation?.toc ?? []) as unknown as NavItem[]);
  return flat;
}

/**
 * Title of the table-of-contents entry covering `node` in the spine item `href`. Books often
 * hold many chapters in one file, so among entries pointing into that file, take the last
 * anchor that comes before the node.
 */
export function tocTitleAt(toc: { label: string; href: string }[], href: string, node: Node | null | undefined) {
  const file = (h: string) => h.split('#')[0].split('/').pop() ?? '';
  const here = toc.filter((i) => file(i.href) === file(href));
  if (here.length <= 1 || !node?.ownerDocument) return here[0]?.label ?? '';
  const doc = node.ownerDocument;
  let best = here[0];
  for (const item of here) {
    const id = item.href.split('#')[1];
    const el = id ? doc.getElementById(decodeURIComponent(id)) : null;
    if (el && (el === node || el.contains(node) || el.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) best = item;
  }
  return best.label;
}

export interface EpubHit {
  cfi: string;
  excerpt: string;
  /** Spine item (1-based) and, when the table of contents names it, its title. */
  chapter: number;
  chapterTitle?: string;
}

/** Full-text search across all chapters (each is loaded, searched and unloaded in turn). */
export async function searchEpub(book: EpubBook, query: string, isCancelled: () => boolean, onProgress: (hits: EpubHit[], fraction: number) => void, max = 500) {
  const hits: EpubHit[] = [];
  const toc = flatToc(book);
  const sections: {
    load: (r: unknown) => Promise<unknown>;
    find: (q: string) => { cfi: string; excerpt: string }[];
    unload: () => void;
    index: number;
    href: string;
    document?: Document;
  }[] = [];
  (book.spine as unknown as { each: (fn: (s: (typeof sections)[number]) => void) => void }).each((s) => sections.push(s));
  for (const [i, section] of sections.entries()) {
    if (isCancelled() || hits.length >= max) break;
    await section.load(book.load.bind(book));
    for (const r of section.find(query)) {
      let node: Node | undefined;
      try {
        node = section.document ? new EpubCFI(r.cfi).toRange(section.document)?.startContainer : undefined;
      } catch {
        node = undefined;
      }
      hits.push({ ...r, chapter: section.index + 1, chapterTitle: tocTitleAt(toc, section.href, node) });
    }
    section.unload();
    onProgress([...hits], (i + 1) / sections.length);
  }
  return hits.slice(0, max);
}

/** Spine index a CFI points into: "epubcfi(/6/4!…)" is the 2nd spine item (index 1). */
export function spineIndexOfCfi(cfi: string) {
  const m = cfi.match(/^epubcfi\(\/6\/(\d+)/);
  return m ? Number(m[1]) / 2 - 1 : -1;
}

export interface LocationIndex {
  /** Locations (~1000 characters each) before each spine item, and in total. */
  before: number[];
  counts: number[];
  total: number;
}

/**
 * epub.js' own percentage lookup is unreliable on books whose text sits in a few huge
 * files (e.g. Project Gutenberg), so progress is derived from how many locations each
 * spine item holds plus the page shown within it.
 */
export function buildLocationIndex(cfis: string[], spineLength: number): LocationIndex {
  const counts = new Array(Math.max(spineLength, 0)).fill(0);
  for (const cfi of cfis) {
    const i = spineIndexOfCfi(cfi);
    if (i >= 0) counts[i] = (counts[i] ?? 0) + 1;
  }
  const before: number[] = [];
  let sum = 0;
  for (let i = 0; i < counts.length; i++) {
    before.push(sum);
    sum += counts[i] ?? 0;
  }
  return { before, counts, total: sum };
}

/** Fraction read and 1-based position, given the spine item and the page shown within it. */
export function progressAt(index: LocationIndex, spineIndex: number, page: number, pages: number) {
  if (!index.total || spineIndex < 0) return { fraction: 0, position: 1 };
  const within = pages > 1 ? Math.min(1, Math.max(0, (page - 1) / pages)) : 0;
  const at = (index.before[spineIndex] ?? index.total) + (index.counts[spineIndex] ?? 0) * within;
  return { fraction: Math.min(1, at / index.total), position: Math.min(index.total, Math.floor(at) + 1) };
}
