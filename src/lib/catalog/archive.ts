import { normalize, plainText, subjectLabels } from './text';
import type { BookFile, CatalogItem, CatalogPage, Language, Rights } from './types';

/**
 * Internet Archive catalog: searching (its APIs allow cross-origin requests) and picking the
 * file to download (files themselves need the proxy, see download.ts).
 */

/** The Archive's language field is free text, so match the common spellings. */
const LANGUAGE_TERMS: Record<Exclude<Language, 'all'>, string[]> = {
  por: ['por', 'portuguese', 'pt', 'português', 'portugues'],
  eng: ['eng', 'english', 'en'],
  spa: ['spa', 'spanish', 'es', 'español', 'espanol'],
  fre: ['fre', 'fra', 'french', 'fr', 'français', 'francais'],
};

/** Year up to which works are treated as public domain without an explicit license. */
export const PUBLIC_DOMAIN_YEAR = 1929;
export const PAGE_SIZE = 30;

export interface SearchParams {
  query: string;
  /** Books by any of these authors. */
  authors?: string[];
  /** Books with any of these subjects. */
  subjects?: string[];
  language: Language;
  /** Only works marked public domain / openly licensed, or old enough to be public domain. */
  openOnly: boolean;
  page: number;
}

export interface ArchiveDoc {
  identifier: string;
  title?: string;
  creator?: string | string[];
  year?: number | string;
  date?: string;
  language?: string | string[];
  licenseurl?: string;
  downloads?: number;
  description?: string | string[];
  subject?: string | string[];
}

export interface SearchResult {
  total: number;
  docs: ArchiveDoc[];
}

const quote = (s: string) => (/^[\p{L}\p{N}]+$/u.test(s) ? s : `"${s.replace(/"/g, '')}"`);

/** Query syntax out of user input, so it cannot widen the filters. */
const clean = (s: string) => s.replace(/[():[\]{}^~*?\\/!"]|\b(AND|OR|NOT)\b/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * An author's name in any order and with or without dates ("Machado de Assis" also finds
 * "Assis, Machado de, 1839-1908"): all its longer words.
 */
const authorClause = (name: string) => {
  const words = clean(name.replace(/[,.;\d-]/g, ' ')).split(' ').filter((w) => w.length > 2);
  return words.length ? `(${words.map(quote).join(' AND ')})` : null;
};

/** Solr query for public, downloadable PDFs and EPUBs (no lending or access-restricted items). */
export function buildQuery({ query, authors, subjects, language, openOnly }: Omit<SearchParams, 'page'>) {
  const terms = clean(query);
  // Matches in the title and author count for more than in the description.
  const parts = [terms ? `(title:(${terms})^4 OR creator:(${terms})^3 OR (${terms}))` : '*:*'];
  const byAuthor = (authors ?? []).map(authorClause).filter(Boolean);
  if (byAuthor.length) parts.push(`creator:(${byAuthor.join(' OR ')})`);
  const bySubject = (subjects ?? []).map(clean).filter(Boolean);
  if (bySubject.length) parts.push(`subject:(${bySubject.map(quote).join(' OR ')})`);
  parts.push(
    'mediatype:texts',
    'format:(pdf OR epub)',
    'NOT access-restricted-item:true',
    'NOT collection:(inlibrary OR printdisabled OR lendinglibrary)',
  );
  if (openOnly) parts.push(`(licenseurl:* OR year:[* TO ${PUBLIC_DOMAIN_YEAR}])`);
  if (language !== 'all') parts.push(`language:(${LANGUAGE_TERMS[language].map(quote).join(' OR ')})`);
  return parts.join(' AND ');
}

export async function searchArchive(params: SearchParams, signal?: AbortSignal): Promise<SearchResult> {
  const url = new URL('https://archive.org/advancedsearch.php');
  url.searchParams.set('q', buildQuery(params));
  for (const f of ['identifier', 'title', 'creator', 'year', 'date', 'language', 'licenseurl', 'downloads', 'description', 'subject']) url.searchParams.append('fl[]', f);
  url.searchParams.set('rows', String(PAGE_SIZE));
  url.searchParams.set('page', String(params.page));
  url.searchParams.set('output', 'json');
  if (!params.query.trim()) url.searchParams.append('sort[]', 'downloads desc');
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Falha na busca (${res.status})`);
  const data = (await res.json()) as { response?: { numFound: number; docs: ArchiveDoc[] } };
  if (!data.response) throw new Error('Resposta inesperada do Internet Archive');
  return { total: data.response.numFound, docs: data.response.docs };
}

export function yearOf(doc: ArchiveDoc): number | null {
  const y = Number(String(doc.year ?? doc.date ?? '').slice(0, 4));
  return Number.isFinite(y) && y > 0 ? y : null;
}

export function classifyRights(doc: ArchiveDoc): Rights {
  const license = (doc.licenseurl ?? '').toLowerCase();
  if (/publicdomain|\/zero\//.test(license)) return { kind: 'public-domain', label: 'Domínio público' };
  const cc = license.match(/creativecommons\.org\/licenses\/([a-z-]+)\/([\d.]+)/);
  if (cc) return { kind: 'open-license', label: `CC ${cc[1].toUpperCase()} ${cc[2]}` };
  if (license) return { kind: 'open-license', label: 'Licença aberta' };
  const year = yearOf(doc);
  if (year !== null && year <= PUBLIC_DOMAIN_YEAR) return { kind: 'public-domain', label: `Domínio público (${year})` };
  return { kind: 'unknown', label: 'Verifique os direitos' };
}

/** Library-style names ("Assis, Machado de, 1839-1908") the usual way round, without dates. */
export const displayName = (name: string) =>
  name
    .replace(/,?\s*(\d{4}\??-(\d{4}\??)?|-\d{4}|\d{4}-?)\.?$/, '')
    .replace(/^([^,]+),\s*([^,]+)$/, '$2 $1')
    .trim();

export const authorsOf = (doc: ArchiveDoc) => (Array.isArray(doc.creator) ? doc.creator : doc.creator ? [doc.creator] : []).map(displayName).join('; ');

export const coverUrl = (id: string) => `https://archive.org/services/img/${encodeURIComponent(id)}`;
export const itemUrl = (id: string) => `https://archive.org/details/${encodeURIComponent(id)}`;

export interface ArchiveFile {
  name: string;
  format?: string | null;
  size?: string | null;
  source?: string | null;
}

/**
 * The best file of an item: what the uploader sent (PDF, then EPUB), else the OCR'd "Text PDF"
 * the Archive derives from scans, else its auto-generated EPUB, else the largest PDF.
 * Derived EPUBs come from OCR and read worse than the scan, hence their low priority.
 */
export function pickBookFile(identifier: string, files: ArchiveFile[]): BookFile | null {
  const ext = (f: ArchiveFile) => f.name.toLowerCase().split('.').pop();
  const pdfs = files.filter((f) => ext(f) === 'pdf');
  const epubs = files.filter((f) => ext(f) === 'epub');
  const size = (f: ArchiveFile) => Number(f.size ?? 0);
  const best =
    pdfs.find((f) => f.source === 'original') ??
    epubs.find((f) => f.source === 'original') ??
    pdfs.find((f) => f.format === 'Text PDF') ??
    epubs[0] ??
    [...pdfs].sort((a, b) => size(b) - size(a))[0];
  if (!best) return null;
  return {
    name: best.name,
    size: size(best) || null,
    format: ext(best) === 'epub' ? 'epub' : 'pdf',
    url: `https://archive.org/download/${encodeURIComponent(identifier)}/${best.name.split('/').map(encodeURIComponent).join('/')}`,
  };
}

interface ArchiveMetadata {
  metadata?: ArchiveDoc;
  files?: ArchiveFile[];
  is_dark?: boolean;
}

/** An item's details and the file to download, in one request. */
export async function getArchiveItem(identifier: string, signal?: AbortSignal): Promise<{ item: CatalogItem; file: BookFile | null }> {
  const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, { signal });
  if (!res.ok) throw new Error(`Falha ao consultar o item (${res.status})`);
  const data = (await res.json()) as ArchiveMetadata;
  if (data.is_dark || !data.files || !data.metadata) throw new Error('Este item não está disponível');
  return { item: archiveItem({ ...data.metadata, identifier }), file: pickBookFile(identifier, data.files) };
}

// Subjects uploaders add that say nothing about the book.
const NOISE = new Set(['livro', 'livros', 'book', 'books', 'ebook', 'ebooks', 'e-book', 'pdf', 'epub', 'texto', 'text', 'libro', 'libros', 'livre']);

export function archiveItem(doc: ArchiveDoc): CatalogItem {
  const title = plainText(doc.title) || doc.identifier;
  const authors = authorsOf(doc);
  // Nor do the title, the author's name or a year repeated as subjects.
  const repeated = new Set([normalize(title), ...authors.split('; ').map(normalize)]);
  const subjects = subjectLabels(Array.isArray(doc.subject) ? doc.subject : [doc.subject], 20)
    .filter((s) => !NOISE.has(s.toLowerCase()) && !repeated.has(normalize(s)) && !/^[\d\s.-]+$/.test(s))
    .slice(0, 8);
  return {
    key: `ia:${doc.identifier}`,
    source: 'archive',
    title,
    authors,
    year: yearOf(doc),
    rights: classifyRights(doc),
    downloads: doc.downloads,
    cover: coverUrl(doc.identifier),
    pageUrl: itemUrl(doc.identifier),
    summary: plainText(doc.description) || undefined,
    subjects,
  };
}

/** The Archive has many copies of the same book; show each title and author once. */
export function dedupe(items: CatalogItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = `${normalize(item.title)}|${normalize(item.authors).split(' ').pop() ?? ''}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export async function searchArchiveItems(params: SearchParams, signal?: AbortSignal): Promise<CatalogPage> {
  const { total, docs } = await searchArchive(params, signal);
  return { items: dedupe(docs.map(archiveItem)), hasMore: params.page * PAGE_SIZE < total };
}
