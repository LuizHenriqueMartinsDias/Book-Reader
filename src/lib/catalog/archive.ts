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
}

export interface SearchResult {
  total: number;
  docs: ArchiveDoc[];
}

const quote = (s: string) => (/^[\p{L}\p{N}]+$/u.test(s) ? s : `"${s.replace(/"/g, '')}"`);

/** Solr query for public, downloadable PDFs and EPUBs (no lending or access-restricted items). */
export function buildQuery({ query, language, openOnly }: Omit<SearchParams, 'page'>) {
  const terms = query.replace(/[():[\]{}^~*?\\/!]|\b(AND|OR|NOT)\b/g, ' ').trim();
  const parts = [
    terms ? `(${terms})` : '*:*',
    'mediatype:texts',
    'format:(pdf OR epub)',
    'NOT access-restricted-item:true',
    'NOT collection:(inlibrary OR printdisabled OR lendinglibrary)',
  ];
  if (openOnly) parts.push(`(licenseurl:* OR year:[* TO ${PUBLIC_DOMAIN_YEAR}])`);
  if (language !== 'all') parts.push(`language:(${LANGUAGE_TERMS[language].map(quote).join(' OR ')})`);
  return parts.join(' AND ');
}

export async function searchArchive(params: SearchParams, signal?: AbortSignal): Promise<SearchResult> {
  const url = new URL('https://archive.org/advancedsearch.php');
  url.searchParams.set('q', buildQuery(params));
  for (const f of ['identifier', 'title', 'creator', 'year', 'date', 'language', 'licenseurl', 'downloads']) url.searchParams.append('fl[]', f);
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

export const authorsOf = (doc: ArchiveDoc) => (Array.isArray(doc.creator) ? doc.creator.join('; ') : (doc.creator ?? ''));

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

export async function fetchArchiveFile(identifier: string, signal?: AbortSignal) {
  const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, { signal });
  if (!res.ok) throw new Error(`Falha ao consultar o item (${res.status})`);
  const data = (await res.json()) as { files?: ArchiveFile[]; is_dark?: boolean };
  if (data.is_dark || !data.files) throw new Error('Este item não está disponível');
  return pickBookFile(identifier, data.files);
}

export function archiveItem(doc: ArchiveDoc): CatalogItem {
  return {
    key: `ia:${doc.identifier}`,
    title: doc.title?.trim() || doc.identifier,
    authors: authorsOf(doc),
    year: yearOf(doc),
    rights: classifyRights(doc),
    downloads: doc.downloads,
    cover: coverUrl(doc.identifier),
    pageUrl: itemUrl(doc.identifier),
    resolveFile: (signal) => fetchArchiveFile(doc.identifier, signal),
  };
}

export async function searchArchiveItems(params: SearchParams, signal?: AbortSignal): Promise<CatalogPage> {
  const { total, docs } = await searchArchive(params, signal);
  return { total, items: docs.map(archiveItem), hasMore: params.page * PAGE_SIZE < total };
}
